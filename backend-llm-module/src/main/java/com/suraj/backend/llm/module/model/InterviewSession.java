package com.suraj.backend.llm.module.model;

import lombok.Data;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.stream.Collectors;

@Data
public class InterviewSession {
    private String sessionId;
    private String mode = "Warm-up"; // "Warm-up" or "Technical"
    private String subject;          // e.g. "Java", "Python"
    private String subtopic;         // e.g. "Collections Framework"
    private String difficulty;       // "Easy", "Intermediate", "Advanced"
    private int timeMinutes;         // e.g. 10 (Duration of the interview)
    private String candidateName;    // e.g. "Suraj" (Candidate's name)

    /**
     * BUG-6 FIX: volatile ensures the HTTP (Tomcat) thread's write is
     * immediately visible to the gRPC thread that reads it during evaluation.
     */
    private volatile String bodyLanguageData;

    private String evaluationReportJson; // Stored here when timer expires
    private reactor.core.Disposable timerDisposable; // Tracks the active timer

    /**
     * BUG-6 FIX: CopyOnWriteArrayList allows safe concurrent reads (evaluation)
     * while the gRPC onNext / CompletableFuture fallback threads write new turns.
     */
    private final List<Turn> transcript = new CopyOnWriteArrayList<>();

    private boolean initialized = false;
    private volatile boolean timerExpired = false;          // Set when timer hits zero
    private volatile boolean closingStatementSent = false;  // Set after closing statement is delivered

    /**
     * Set to true when ≤10 seconds remain on the server-side timer.
     * Once set, onNext() will not start a new LLM question — instead it sends
     * the closing acknowledgement (handleTimerExpired) immediately after
     * recording the candidate's answer. This prevents the AI from asking a
     * question the candidate has no time to answer.
     */
    private volatile boolean nearingEnd = false;

    /**
     * BUG-1 FIX: Coordinates the race between the analysis-bridge's HTTP POST
     * (which stores body-language data) and the gRPC onCompleted handler (which
     * triggers evaluation). getEvaluation() awaits this latch before building
     * the evaluator prompt, ensuring body-language data is always present.
     *
     * The latch starts at 1. BodyLanguageController.receiveBodyLanguage() calls
     * countDown() after storing the data. If the POST never arrives (analysis-bridge
     * not running), the await in InterviewServiceImpl times out after 10 s and
     * evaluation proceeds with "N/A" for behavioral data.
     */
    private final CountDownLatch bodyLanguageLatch = new CountDownLatch(1);

    public InterviewSession(String sessionId) {
        this.sessionId = sessionId;
    }

    /**
     * Initializes session metadata from the first UserSpeech message.
     */
    public void initialize(String subject, String subtopic, String difficulty, int timeMinutes, String candidateName) {
        this.subject = subject;
        this.subtopic = subtopic;
        this.difficulty = difficulty;
        this.timeMinutes = timeMinutes;
        this.candidateName = candidateName;
        this.initialized = true;
    }

    public void addTurn(String role, String text) {
        transcript.add(new Turn(role, text));
    }

    /**
     * Returns true if this is the very first conversational turn (no interviewer turns yet).
     */
    public boolean isFirstTurn() {
        return transcript.stream().noneMatch(t -> "Interviewer".equals(t.role()));
    }

    /**
     * Transitions the session from Warm-up to Technical mode.
     */
    public void transitionToTechnical() {
        this.mode = "Technical";
    }

    /**
     * Returns the full transcript formatted as:
     *   Interviewer: [text]
     *   Interviewee: [text]
     */
    public String getFormattedTranscript() {
        return transcript.stream()
                .map(Turn::getFormatted)
                .collect(Collectors.joining("\n"));
    }

    /**
     * @deprecated Use {@link #getFormattedTranscript()} instead.
     */
    @Deprecated
    public String getTranscriptString() {
        return getFormattedTranscript();
    }
}
