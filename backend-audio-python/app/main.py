from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from app.deepgram_manager import deepgram_manager
from app.guidance_session import GuidanceBridgeSession
from app.session import AudioBridgeSession
from app.timer_sync import timer_sync


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start persistent Deepgram STT + TTS connections before the first request.
    # Both connections will be alive and ready by the time any interview begins,
    # eliminating the per-session WebSocket handshake delay.
    await deepgram_manager.start()
    yield
    # (connections are kept alive until the process exits)


app = FastAPI(title="Python Audio Bridge", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.websocket("/ws/audio-bridge")
async def audio_bridge(websocket: WebSocket):
    session = AudioBridgeSession(websocket)
    await session.run()


@app.websocket("/ws/timer")
async def timer_ws(websocket: WebSocket):
    """
    Dedicated channel for server-driven interview countdown.
    The frontend connects here at interview start and receives:
      {"type": "timer_tick",    "remaining": N}  — every second
      {"type": "timer_expired"}                  — when N reaches 0
      {"type": "timer_reset"}                    — when session ends early
    This keeps the frontend and backend timers perfectly in sync.
    """
    await timer_sync.connect(websocket)


@app.websocket("/ws/guidance-bridge")
async def guidance_bridge(websocket: WebSocket):
    """
    WebSocket endpoint for Guidance (Teacher) mode.
    Frontend connects here for voice-based Q&A with the AI teacher.
    """
    session = GuidanceBridgeSession(websocket)
    await session.run()



