import asyncio
import base64
import json
import math
import os
import threading
import urllib.request
import time
import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ══════════════════════════════════════════════════════════════
#  MODEL DOWNLOADS
# ══════════════════════════════════════════════════════════════
MODELS = {
    "face": (
        "face_landmarker.task",
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    ),
    "pose": (
        "pose_landmarker_lite.task",
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
    ),
    "hand": (
        "hand_landmarker.task",
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
    ),
}

for name, (filename, url) in MODELS.items():
    if not os.path.exists(filename):
        print(f"Downloading {filename}...")
        urllib.request.urlretrieve(url, filename)
        print(f"Saved {filename}")

# ══════════════════════════════════════════════════════════════
#  LANDMARKER INIT
# ══════════════════════════════════════════════════════════════
face_landmarker = vision.FaceLandmarker.create_from_options(
    vision.FaceLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=MODELS["face"][0]),
        running_mode=vision.RunningMode.IMAGE,
        num_faces=1,
    )
)

pose_landmarker = vision.PoseLandmarker.create_from_options(
    vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=MODELS["pose"][0]),
        running_mode=vision.RunningMode.IMAGE,
    )
)

hand_landmarker = vision.HandLandmarker.create_from_options(
    vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=MODELS["hand"][0]),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
    )
)

_landmarker_lock = threading.Lock()

# ══════════════════════════════════════════════════════════════
#  CONSTANTS
# ══════════════════════════════════════════════════════════════
EAR_THRESHOLD = 0.22
EAR_CONSEC_FR = 2
LEFT_EYE_IDX = [33, 160, 158, 133, 153, 144]
RIGHT_EYE_IDX = [362, 385, 387, 263, 373, 380]

COACHING = {
    "posture_low": "Sit straight — align your shoulders",
    "eye_low": "Look at the camera, not the screen",
    "hand_fidget": "Slow down hand movement",
    "emotion_fear": "Take a breath — you've got this",
    "blink_low": "Blink naturally — avoid staring",
    "blink_high": "Reduce blinking — stay focused",
}
ALERT_COOLDOWN = 8

SCORE_WEIGHTS = {
    "posture": 0.25, "eye": 0.25, "emotion": 0.20,
    "hand": 0.15, "blink": 0.08, "neutral_fill": 0.07,
}


# ══════════════════════════════════════════════════════════════
#  BLINK TRACKER
# ══════════════════════════════════════════════════════════════
class BlinkTracker:
    def __init__(self):
        self._count = 0
        self._consec = 0
        self._in_blink = False
        self._start_t = time.time()

    def update(self, left_ear, right_ear):
        avg = (left_ear + right_ear) / 2.0
        if avg < EAR_THRESHOLD:
            self._consec += 1
        else:
            if self._consec >= EAR_CONSEC_FR and not self._in_blink:
                self._count += 1
                self._in_blink = True
            else:
                self._in_blink = False
            self._consec = 0

    def bpm(self):
        elapsed = max(time.time() - self._start_t, 1.0) / 60.0
        return round(self._count / elapsed, 1)

    def score(self):
        b = self.bpm()
        if 12 <= b <= 20: return 100.0
        if 8 <= b < 12 or 20 < b <= 28: return 75.0
        if 4 <= b < 8 or 28 < b <= 35: return 50.0
        return 25.0


# ══════════════════════════════════════════════════════════════
#  HAND GESTURE CLASSIFIER
# ══════════════════════════════════════════════════════════════
def classify_gesture(hand_landmarks_list):
    if not hand_landmarks_list:
        return None, 50.0
    lm = hand_landmarks_list[0]

    def _dist(i, j):
        return math.hypot(lm[i].x - lm[j].x, lm[i].y - lm[j].y)

    tips = [4, 8, 12, 16, 20]
    mcps = [2, 5, 9, 13, 17]
    extended = [_dist(t, 0) > _dist(m, 0) * 1.4 for t, m in zip(tips, mcps)]
    n_ext = sum(extended)

    if n_ext >= 4:
        return "open hand", 85.0
    elif n_ext <= 1:
        return "fist", 40.0
    elif extended[1] and not extended[2] and not extended[3]:
        return "pointing", 70.0
    elif extended[0] and extended[1] and n_ext == 2:
        return "ok", 75.0
    return None, 50.0


# ══════════════════════════════════════════════════════════════
#  COACHING MANAGER
# ══════════════════════════════════════════════════════════════
class CoachingManager:
    def __init__(self):
        self._last = {}
        self._tip = None
        self._until = 0.0

    def trigger(self, key, now):
        if now - self._last.get(key, 0) > ALERT_COOLDOWN:
            self._last[key] = now
            self._tip = COACHING.get(key, "")
            self._until = now + 4.0

    def get(self, now):
        return self._tip if now < self._until else None


# ══════════════════════════════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════════════════════════════
def euclidean_distance(p1, p2):
    return math.hypot(p2[0] - p1[0], p2[1] - p1[1])

def _ear(landmarks, indices, w, h):
    pts = np.array([[landmarks[i].x * w, landmarks[i].y * h] for i in indices])
    A = np.linalg.norm(pts[1] - pts[5])
    B = np.linalg.norm(pts[2] - pts[4])
    C = np.linalg.norm(pts[0] - pts[3])
    return (A + B) / (2.0 * C + 1e-6)


# ══════════════════════════════════════════════════════════════
#  MAIN FRAME PROCESSOR
# ══════════════════════════════════════════════════════════════
def process_frame(image_bytes: str, state: dict) -> dict:
    try:
        if "," in image_bytes:
            image_bytes = image_bytes.split(',')[1]

        nparr = np.frombuffer(base64.b64decode(image_bytes), np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return {"status": "no_face_detected"}

        rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_img)
        h, w, _ = img.shape

        with _landmarker_lock:
            face_results = face_landmarker.detect(mp_image)
            pose_results = pose_landmarker.detect(mp_image)
            hand_results = hand_landmarker.detect(mp_image)

        if not face_results.face_landmarks:
            return {"status": "no_face_detected"}

        landmarks = face_results.face_landmarks[0]
        def get_pt(idx):
            return (int(landmarks[idx].x * w), int(landmarks[idx].y * h))

        current_time = time.time()

        # ── Init state objects ──
        if "blink_tracker" not in state:
            state["blink_tracker"] = BlinkTracker()
            state["coaching"] = CoachingManager()
            state["start_time"] = current_time
            state["calibration_data"] = []
            state["is_calibrating"] = True
            state["gesture_history"] = []

        blink_tracker = state["blink_tracker"]
        coaching = state["coaching"]

        # ── Blink tracking (always runs) ──
        ear_l = _ear(landmarks, LEFT_EYE_IDX, w, h)
        ear_r = _ear(landmarks, RIGHT_EYE_IDX, w, h)
        blink_tracker.update(ear_l, ear_r)

        # ── Posture from pose landmarks ──
        posture_score = 70.0  # default
        if pose_results.pose_landmarks:
            plm = pose_results.pose_landmarks[0]
            ls = plm[11]  # left shoulder
            rs = plm[12]  # right shoulder
            shoulder_diff = abs(ls.y - rs.y)
            if shoulder_diff < 0.03:
                posture_score = 95.0
            elif shoulder_diff < 0.06:
                posture_score = 75.0
            elif shoulder_diff < 0.10:
                posture_score = 55.0
            else:
                posture_score = 30.0
                coaching.trigger("posture_low", current_time)

        # ── Hand gesture ──
        gesture, hand_score = classify_gesture(
            hand_results.hand_landmarks if hand_results.hand_landmarks else None
        )
        state["gesture_history"].append(gesture)
        if len(state["gesture_history"]) > 10:
            state["gesture_history"].pop(0)

        # ── Face metrics (same as before) ──
        p13 = get_pt(13); p14 = get_pt(14)
        p61 = get_pt(61); p291 = get_pt(291)
        mouth_width_dist = euclidean_distance(p61, p291)
        mouth_open_dist = euclidean_distance(p13, p14)
        mouth_open_ratio = mouth_open_dist / mouth_width_dist if mouth_width_dist > 0 else 0

        p1 = get_pt(1); p10 = get_pt(10)
        head_tilt_y = abs(p10[1] - p1[1])
        corner_elev = abs(p61[1] - p13[1])

        p33 = get_pt(33); p133 = get_pt(133)
        p362 = get_pt(362); p263 = get_pt(263)
        left_eye_width = euclidean_distance(p33, p133)
        right_eye_width = euclidean_distance(p362, p263)

        ear = (ear_l + ear_r) / 2.0 if left_eye_width > 0 and right_eye_width > 0 else 0.3

        p107 = get_pt(107); p55 = get_pt(55); p285 = get_pt(285)
        p159 = get_pt(159)
        brow_height = abs(p159[1] - p107[1])
        brow_dist = euclidean_distance(p55, p285)

        elapsed = current_time - state["start_time"]

        # ── Calibration (first 3 seconds) ──
        if state.get("is_calibrating", True):
            if elapsed <= 3.0:
                state["calibration_data"].append({
                    "mouth_width": mouth_width_dist, "ear": ear,
                    "corner_elev": corner_elev, "head_tilt_y": head_tilt_y,
                    "brow_height": brow_height, "brow_dist": brow_dist,
                })
                return {
                    "looking_at_camera": True, "is_smiling": False,
                    "confidence": 0.0, "nervousness": 0.0, "neutral": 1.0,
                    "posture_score": posture_score, "hand_gesture": gesture,
                    "blink_rate": 0.0, "blink_score": 100.0,
                    "hand_score": 50.0, "coaching_tip": None,
                    "status": "calibrating",
                }
            else:
                calib = state["calibration_data"]
                if calib:
                    for key in ["mouth_width", "ear", "corner_elev", "head_tilt_y", "brow_height", "brow_dist"]:
                        state[f"base_{key}"] = sum(c[key] for c in calib) / len(calib)
                else:
                    state["base_mouth_width"] = mouth_width_dist
                    state["base_ear"] = ear
                    state["base_corner_elev"] = corner_elev
                    state["base_head_tilt_y"] = head_tilt_y
                    state["base_brow_height"] = brow_height
                    state["base_brow_dist"] = brow_dist
                state["is_calibrating"] = False
                print("--- Calibration Complete! ---")

        # ── Gaze tracking ──
        p468 = get_pt(468); p473 = get_pt(473)
        iris_left_ratio = euclidean_distance(p468, p133) / left_eye_width if left_eye_width > 0 else 0.5
        iris_right_ratio = euclidean_distance(p473, p362) / right_eye_width if right_eye_width > 0 else 0.5
        looking_at_camera = (0.35 < iris_left_ratio < 0.65) and (0.35 < iris_right_ratio < 0.65)

        eye_score = 90.0 if looking_at_camera else 30.0
        if not looking_at_camera:
            coaching.trigger("eye_low", current_time)

        # ── Emotion detection (geometric) ──
        base = state
        mw_inc = max(0, mouth_width_dist - base["base_mouth_width"]) / base["base_mouth_width"]
        ce_chg = max(0, base["base_corner_elev"] - corner_elev) / base["base_corner_elev"] if base["base_corner_elev"] > 0 else 0
        happy = min(1.0, mw_inc * 2.0 + ce_chg * 2.0)
        is_smiling = happy > 0.4

        ear_inc = max(0, ear - base["base_ear"]) / base["base_ear"] if base["base_ear"] > 0 else 0
        brow_inc = max(0, brow_height - base["base_brow_height"]) / base["base_brow_height"] if base["base_brow_height"] > 0 else 0
        fear = min(1.0, ear_inc * 2.0 + brow_inc * 2.0)

        bd_dec = max(0, base["base_brow_dist"] - brow_dist) / base["base_brow_dist"] if base["base_brow_dist"] > 0 else 0
        stress = min(1.0, bd_dec * 4.0)

        ear_dec = max(0, base["base_ear"] - ear) / base["base_ear"] if base["base_ear"] > 0 else 0
        ht_down = max(0, head_tilt_y - base["base_head_tilt_y"]) / base["base_head_tilt_y"] if base["base_head_tilt_y"] > 0 else 0
        fatigue = min(1.0, ear_dec * 2.0 + ht_down * 2.0)

        primary_neutral = max(0.0, 1.0 - max(happy, fear, stress, fatigue))
        emotions = {"Happy": happy, "Fear": fear, "Stress": stress, "Fatigue": fatigue, "Neutral": primary_neutral}

        # Interview metrics
        conf = max(0, min(1, happy * 0.5 + primary_neutral * 0.5 - fear * 0.3))
        nerv = max(0, min(1, fear * 0.7 + stress * 0.3))
        neut = max(0, 1.0 - (conf + nerv))

        if not looking_at_camera:
            conf = min(conf, 0.2)
            nerv = max(nerv, 0.4)

        if fear > 0.5:
            coaching.trigger("emotion_fear", current_time)

        # ── Blink coaching ──
        bpm = blink_tracker.bpm()
        if bpm < 6:
            coaching.trigger("blink_low", current_time)
        elif bpm > 30:
            coaching.trigger("blink_high", current_time)

        # ── Temporal smoothing ──
        if "score_history" not in state:
            state["score_history"] = []
        state["score_history"].append((conf, nerv, neut))
        if len(state["score_history"]) > 5:
            state["score_history"].pop(0)

        avg_conf = sum(s[0] for s in state["score_history"]) / len(state["score_history"])
        avg_nerv = sum(s[1] for s in state["score_history"]) / len(state["score_history"])
        avg_neut = sum(s[2] for s in state["score_history"]) / len(state["score_history"])

        # ── Emotion score ──
        emotion_score = max(0, min(100, (happy * 100 + primary_neutral * 85 - fear * 35 - stress * 25)))

        # ── Composite score ──
        composite = (
            SCORE_WEIGHTS["posture"] * posture_score +
            SCORE_WEIGHTS["eye"] * eye_score +
            SCORE_WEIGHTS["emotion"] * emotion_score +
            SCORE_WEIGHTS["hand"] * hand_score +
            SCORE_WEIGHTS["blink"] * blink_tracker.score() +
            SCORE_WEIGHTS["neutral_fill"] * 70  # baseline
        )

        tip = coaching.get(current_time)

        return {
            "looking_at_camera": bool(looking_at_camera),
            "is_smiling": bool(is_smiling),
            "mouth_open_ratio": round(mouth_open_ratio, 3),
            "confidence": float(avg_conf),
            "nervousness": float(avg_nerv),
            "neutral": float(avg_neut),
            "emotions": emotions,
            "posture_score": round(posture_score, 1),
            "eye_score": round(eye_score, 1),
            "hand_gesture": gesture,
            "hand_score": round(hand_score, 1),
            "blink_rate": bpm,
            "blink_score": round(blink_tracker.score(), 1),
            "emotion_score": round(emotion_score, 1),
            "composite_score": round(composite, 1),
            "coaching_tip": tip,
            "status": "success",
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ══════════════════════════════════════════════════════════════
#  SESSION REPORT
# ══════════════════════════════════════════════════════════════
LLM_MODULE_URL = "http://localhost:8080/api/session"

def generate_session_report(session_data) -> dict | None:
    if not session_data:
        return None

    total = len(session_data)
    avg = lambda key: round(sum(f.get(key, 0) for f in session_data) / total, 2)

    avg_conf = avg("confidence")
    avg_nerv = avg("nervousness")
    avg_neut = avg("neutral")
    avg_posture = avg("posture_score")
    avg_eye = avg("eye_score")
    avg_hand = avg("hand_score")
    avg_blink = avg("blink_score")
    avg_emotion = avg("emotion_score")
    avg_composite = avg("composite_score")

    verdict_parts = []
    if avg_conf > 0.75:
        verdict_parts.append("exuded high confidence")
    elif avg_conf < 0.3:
        verdict_parts.append("appeared somewhat disengaged")
    else:
        verdict_parts.append("maintained a professional baseline")

    if avg_nerv > 0.6:
        verdict_parts.append("while showing significant signs of anxiety")
    elif avg_nerv > 0.3:
        verdict_parts.append("with occasional moments of nervousness")

    if avg_posture < 50:
        verdict_parts.append("and had poor posture throughout")

    verdict = "The user " + " ".join(verdict_parts) + "."

    report = {
        "total_frames": total,
        "averages": {
            "confidence": avg_conf, "nervousness": avg_nerv, "neutral": avg_neut,
            "posture": avg_posture, "eye_contact": avg_eye,
            "hand_gesture": avg_hand, "blink_rate": avg_blink,
            "emotion": avg_emotion, "composite": avg_composite,
        },
        "verdict": verdict,
    }

    with open("interview_summary.json", "w") as f:
        json.dump(report, f, indent=2)
    print("Session report saved to interview_summary.json")
    return report


async def post_body_language_to_llm(session_id: str, report: dict):
    url = f"{LLM_MODULE_URL}/{session_id}/body-language"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=report)
            if response.status_code == 200:
                print(f"Body-language data sent to LLM module for session [{session_id}].")
            elif response.status_code == 404:
                print(f"WARNING: LLM module session [{session_id}] not found.")
            else:
                print(f"WARNING: LLM module returned {response.status_code}.")
    except httpx.ConnectError:
        print(f"ERROR: Could not connect to LLM module at {url}.")
    except Exception as e:
        print(f"ERROR: Failed to post body-language data: {e}")


# ══════════════════════════════════════════════════════════════
#  WEBSOCKET ENDPOINT
# ══════════════════════════════════════════════════════════════
@app.websocket("/ws/visual-analysis")
async def process_video_stream(websocket: WebSocket):
    await websocket.accept()
    session_data = []
    state = {}
    session_id = None
    frame_lock = asyncio.Lock()

    try:
        # Step 1: Wait for init handshake
        raw_init = await websocket.receive_text()
        try:
            init_msg = json.loads(raw_init)
            if init_msg.get("type") == "init" and init_msg.get("sessionId"):
                session_id = init_msg["sessionId"]
                print(f"Visual-analysis session started for sessionId [{session_id}]")
            else:
                print(f"WARNING: First message was not a valid init packet.")
        except json.JSONDecodeError:
            print("WARNING: First message was not JSON.")
            result = await asyncio.to_thread(process_frame, raw_init, state)
            if result.get("status") == "success":
                session_data.append(result)
            await websocket.send_json(result)

        # Step 2: Main loop
        while True:
            data = await websocket.receive_text()
            async with frame_lock:
                result = await asyncio.to_thread(process_frame, data, state)

            if result.get("status") == "success":
                session_data.append(result)

            # Send full metrics to frontend for HUD rendering
            await websocket.send_json({
                "looking_at_camera": result.get("looking_at_camera", False),
                "is_smiling": result.get("is_smiling", False),
                "confidence": result.get("confidence", 0),
                "nervousness": result.get("nervousness", 0),
                "posture_score": result.get("posture_score", 0),
                "eye_score": result.get("eye_score", 0),
                "hand_gesture": result.get("hand_gesture"),
                "hand_score": result.get("hand_score", 0),
                "blink_rate": result.get("blink_rate", 0),
                "blink_score": result.get("blink_score", 0),
                "emotion_score": result.get("emotion_score", 0),
                "composite_score": result.get("composite_score", 0),
                "coaching_tip": result.get("coaching_tip"),
                "status": result.get("status"),
            })

    except WebSocketDisconnect:
        print("Client disconnected. Generating session report...")
        report = generate_session_report(session_data)
        if report and session_id:
            await post_body_language_to_llm(session_id, report)
        elif report and not session_id:
            print("WARNING: sessionId unknown — body-language report was NOT forwarded.")
    except Exception as e:
        print(f"Error in websocket loop: {e}")
        try:
            await websocket.close()
        except:
            pass
