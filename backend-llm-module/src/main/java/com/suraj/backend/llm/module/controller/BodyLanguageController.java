package com.suraj.backend.llm.module.controller;

import com.suraj.backend.llm.module.model.InterviewSession;
import com.suraj.backend.llm.module.service.SessionManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * REST controller that receives body-language summary data from the analysis-bridge
 * Python service and attaches it to the live InterviewSession.
 *
 * Called once per session — after the frontend timer expires and the analysis-bridge
 * has finished generating its session report.
 *
 * POST /api/session/{sessionId}/body-language
 * Body: { "verdict": "...", "averages": { "confidence": 0.7, ... }, "total_frames": 42 }
 */
@RestController
@RequestMapping("/api/session")
public class BodyLanguageController {

    private static final Logger log = LoggerFactory.getLogger(BodyLanguageController.class);

    private final SessionManager sessionManager;

    public BodyLanguageController(SessionManager sessionManager) {
        this.sessionManager = sessionManager;
    }

    /**
     * Accepts the body-language summary JSON from the analysis-bridge and stores
     * it as a formatted string on the InterviewSession so the evaluator prompt
     * can reference it in the "Behavioral Data" field.
     *
     * @param sessionId  the interview session identifier (path variable)
     * @param payload    the full JSON body sent by analysis-bridge
     * @return 200 OK if the session exists and the data was stored,
     *         404 if the session is not found
     */
    @PostMapping("/{sessionId}/body-language")
    public ResponseEntity<Map<String, String>> receiveBodyLanguage(
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> payload) {

        log.info("[BodyLanguage] Received body-language data for session [{}]: {}", sessionId, payload);

        InterviewSession session = sessionManager.getSession(sessionId);
        if (session == null) {
            log.warn("[BodyLanguage] Session [{}] not found — body-language data discarded.", sessionId);
            return ResponseEntity.notFound().build();
        }

        // Build a concise human-readable summary string to embed in the evaluator prompt.
        // Format mirrors what the prompt expects under "Behavioral Data".
        String bodyLanguageSummary = buildSummaryString(payload);
        session.setBodyLanguageData(bodyLanguageSummary);

        // BUG-1 FIX: Signal the evaluation thread that body-language data is ready.
        // InterviewServiceImpl.triggerEvaluationAndComplete() awaits this latch
        // (up to 10 s) before calling getEvaluation(), ensuring the data is
        // always present in the evaluator prompt.
        session.getBodyLanguageLatch().countDown();

        log.info("[BodyLanguage] Session [{}]: body-language data stored and latch released: {}", sessionId, bodyLanguageSummary);
        return ResponseEntity.ok(Map.of(
                "status", "ok",
                "sessionId", sessionId,
                "stored", bodyLanguageSummary
        ));
    }

    /**
     * Converts the raw JSON payload from analysis-bridge into a compact,
     * human-readable string suitable for embedding in the LLM evaluation prompt.
     *
     * Example output:
     * "Confidence: 0.68, Nervousness: 0.22, Neutral: 0.10 | Verdict: The user maintained a professional baseline."
     */
    @SuppressWarnings("unchecked")
    private String buildSummaryString(Map<String, Object> payload) {
        StringBuilder sb = new StringBuilder();

        Object averagesRaw = payload.get("averages");
        if (averagesRaw instanceof Map<?, ?> averages) {
            sb.append(String.format("Confidence: %.2f, Nervousness: %.2f, Neutral: %.2f",
                    toDouble(averages.get("confidence")),
                    toDouble(averages.get("nervousness")),
                    toDouble(averages.get("neutral"))));

            // Enhanced metrics from posture/hand/blink pipeline
            double posture = toDouble(averages.get("posture"));
            double eye = toDouble(averages.get("eye_contact"));
            double hand = toDouble(averages.get("hand_gesture"));
            double blink = toDouble(averages.get("blink_rate"));
            double composite = toDouble(averages.get("composite"));

            if (posture > 0 || composite > 0) {
                sb.append(String.format(" | Body Language — Posture: %.0f/100, Eye Contact: %.0f/100, Hand Gesture: %.0f/100, Blink: %.0f/100, Composite: %.0f/100",
                        posture, eye, hand, blink, composite));
            }
        }

        Object totalFrames = payload.get("total_frames");
        if (totalFrames != null) {
            sb.append(" | Frames analyzed: ").append(totalFrames);
        }

        Object verdict = payload.get("verdict");
        if (verdict != null && !verdict.toString().isBlank()) {
            sb.append(" | Verdict: ").append(verdict);
        }

        return sb.isEmpty() ? "N/A" : sb.toString();
    }

    private double toDouble(Object value) {
        if (value instanceof Number n) return n.doubleValue();
        if (value instanceof String s) {
            try { return Double.parseDouble(s); } catch (NumberFormatException ignored) {}
        }
        return 0.0;
    }
}
