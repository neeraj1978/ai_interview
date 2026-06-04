package com.suraj.backend.llm.module.service;

import com.suraj.backend.llm.module.model.InterviewSession;
import com.suraj.interview.grpc.AiResponse;
import com.suraj.interview.grpc.EvaluationReport;
import com.suraj.interview.grpc.InterviewServiceGrpc;
import com.suraj.interview.grpc.SessionId;
import com.suraj.interview.grpc.UserSpeech;
import io.grpc.stub.StreamObserver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.grpc.server.service.GrpcService;
import reactor.core.Disposable;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * gRPC server implementation for the Interview Service.
 * Handles bidirectional ChatStream and unary GetEvaluation RPCs.
 *
 * Thread-safety notes:
 * - All access to {@code responseObserver} is synchronized on the observer itself.
 * - AI responses are serialized: a new response cannot start until the previous one finishes.
 * - Evaluation generation is guarded by an {@code AtomicBoolean} to prevent double invocation.
 */
@GrpcService
public class InterviewServiceImpl extends InterviewServiceGrpc.InterviewServiceImplBase {

    private static final Logger log = LoggerFactory.getLogger(InterviewServiceImpl.class);

    private final SessionManager sessionManager;
    private final GroqClientService groqClientService;

    public InterviewServiceImpl(SessionManager sessionManager, GroqClientService groqClientService) {
        this.sessionManager = sessionManager;
        this.groqClientService = groqClientService;
    }

    // ──────────────────────────────────────────────────────────────
    //  ChatStream — Bidirectional Streaming RPC
    // ──────────────────────────────────────────────────────────────

    @Override
    public StreamObserver<UserSpeech> chatStream(StreamObserver<AiResponse> responseObserver) {
        return new StreamObserver<UserSpeech>() {
            private String currentSessionId;

            // Gate to serialize AI responses — only one response streams at a time
            private volatile CountDownLatch responseLatch = null;

            // Tracks whether the server response stream has been completed
            private final AtomicBoolean streamCompleted = new AtomicBoolean(false);

            // Tracks whether evaluation has been triggered (exactly-once)
            private final AtomicBoolean evaluationTriggered = new AtomicBoolean(false);

            @Override
            public void onNext(UserSpeech userSpeech) {
                currentSessionId = userSpeech.getSessionId();
                String sessionId = currentSessionId;
                String text = userSpeech.getText();
                InterviewSession session = sessionManager.getOrCreateSession(sessionId);

                // ── Initialize session metadata on first message ──
                if (!session.isInitialized() && !userSpeech.getSubject().isEmpty()) {
                    int timeMinutes = userSpeech.getTimeMinutes() > 0 ? userSpeech.getTimeMinutes() : 10;
                    String candidateName = userSpeech.getCandidateName();
                    session.initialize(
                            userSpeech.getSubject(),
                            userSpeech.getSubtopic(),
                            userSpeech.getDifficulty(),
                            timeMinutes,
                            candidateName
                    );
                    log.info("Session [{}] initialized: {} / {} / {} for {} minutes, candidate={}",
                            sessionId, session.getSubject(), session.getSubtopic(), session.getDifficulty(), timeMinutes, candidateName);

                    // ── Start the live session timer ──
                    long totalSeconds = timeMinutes * 60L;
                    Disposable timerDisposable = reactor.core.publisher.Flux.interval(java.time.Duration.ofSeconds(1))
                            .take(totalSeconds)
                            .doOnNext(sec -> {
                                long remaining = totalSeconds - sec - 1;
                                if (remaining % 30 == 0 || remaining <= 5) {
                                    log.info("Session [{}]: Live Timer - {} seconds remaining.", sessionId, remaining);
                                }
                                // Set the nearingEnd flag with 10 seconds to go so that
                                // onNext() stops asking new questions and sends the closing
                                // acknowledgement on the candidate's next (last) response.
                                if (remaining <= 10 && !session.isNearingEnd()) {
                                    session.setNearingEnd(true);
                                    log.info("Session [{}]: ≤10 s remaining — new questions suppressed.", sessionId);
                                }
                            })
                            .doOnComplete(() -> {
                                log.info("Session [{}]: Server timer expired. Setting timerExpired flag.", sessionId);
                                session.setTimerExpired(true);
                                // No automatic closing statement here. The audio bridge
                                // controls the closing flow: user clicks Done →
                                // _final_answer_then_cleanup sends the last answer →
                                // onNext sees timerExpired=true → sends closing statement.
                            })
                            .subscribe();
                    session.setTimerDisposable(timerDisposable);
                }

                // ── __INTERVIEW_ENDED__ sentinel ──
                // Sent by the audio bridge when the timer expires and there is no
                // pending user transcript. Guarantees the LLM always sends the
                // closing acknowledgement before the gRPC stream closes.
                if ("__INTERVIEW_ENDED__".equals(text)) {
                    log.info("Session [{}]: __INTERVIEW_ENDED__ sentinel received.", sessionId);
                    // C3 FIX: guard against uninitialized session (e.g. sentinel arrived
                    // before the first interview_config message was processed).
                    if (!session.isInitialized()) {
                        log.warn("Session [{}]: __INTERVIEW_ENDED__ on uninitialized session — ignoring.", sessionId);
                        return;
                    }
                    CountDownLatch currentLatch = new CountDownLatch(1);
                    responseLatch = currentLatch;
                    if (!session.isClosingStatementSent()) {
                        CompletableFuture.runAsync(() -> {
                            handleTimerExpired(session, responseObserver, streamCompleted);
                            currentLatch.countDown();
                        });
                    } else {
                        currentLatch.countDown();
                    }
                    return;
                }

                // ── Handle empty text ──
                if (text == null || text.isBlank()) {
                    if (session.isFirstTurn()) {
                        log.info("Session [{}]: First turn — AI will proactively start the interview.", sessionId);
                    } else {
                        log.debug("Session [{}]: Empty text on non-first turn, skipping.", sessionId);
                        return;
                    }
                } else {
                    session.addTurn("Interviewee", text);
                }

                // ── Wait for any previous AI response to finish before processing ──
                if (responseLatch != null) {
                    try {
                        log.debug("Session [{}]: Waiting for previous AI response to complete...", sessionId);
                        boolean finished = responseLatch.await(60, TimeUnit.SECONDS);
                        if (!finished) {
                            log.warn("Session [{}]: Previous AI response timed out (60s), proceeding anyway.", sessionId);
                        }
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        log.warn("Session [{}]: Interrupted while waiting for previous response.", sessionId);
                        return;
                    }
                }

                // ── Transition from Warm-up to Technical after first interviewer turn ──
                long interviewerTurns = session.getTranscript().stream()
                        .filter(t -> "Interviewer".equals(t.role()))
                        .count();
                if ("Warm-up".equals(session.getMode()) && interviewerTurns >= 1) {
                    session.transitionToTechnical();
                    log.info("Session [{}]: Transitioned to Technical mode.", sessionId);
                }

                // ── Create a new latch for this response ──
                CountDownLatch currentLatch = new CountDownLatch(1);
                responseLatch = currentLatch;

                // ── If the timer has expired, send closing statement instead of another question ──
                if (session.isTimerExpired() && !session.isClosingStatementSent()) {
                    log.info("Session [{}]: Timer expired. Sending closing statement after user's last response.", sessionId);
                    // Run off the gRPC executor thread because generateClosingStatement blocks
                    CompletableFuture.runAsync(() -> {
                        handleTimerExpired(session, responseObserver, streamCompleted);
                        currentLatch.countDown();
                    });
                    return;
                }

                // ── If nearing end (≤10 s), suppress new questions ──
                // Record the answer but don't generate a new AI question.
                // Just send [EOT] so the audio bridge knows this turn is done.
                // The closing statement will only be sent after timerExpired=true.
                if (session.isNearingEnd() && !session.isTimerExpired() && !session.isClosingStatementSent()) {
                    log.info("Session [{}]: Nearing end (≤10 s). Recording answer, suppressing new question.", sessionId);
                    synchronized (responseObserver) {
                        if (!streamCompleted.get()) {
                            responseObserver.onNext(AiResponse.newBuilder().setText("[EOT]").build());
                        }
                    }
                    currentLatch.countDown();
                    return;
                }

                // ── If closing statement was already sent, don't stream another question ──
                if (session.isClosingStatementSent()) {
                    log.info("Session [{}]: Closing statement already sent. Ignoring late user response.", sessionId);
                    currentLatch.countDown();
                    return;
                }

                // ── Stream the AI's next interviewer turn ──
                if (streamCompleted.get()) {
                    log.warn("Session [{}]: Response stream already completed, cannot send AI response.", sessionId);
                    currentLatch.countDown();
                    return;
                }

                StringBuilder aiResponseBuilder = new StringBuilder();
                final java.util.concurrent.atomic.AtomicInteger tokenCount = new java.util.concurrent.atomic.AtomicInteger(0);
                groqClientService.streamChat(session)
                        .doOnNext(token -> {
                            if (token != null && !token.isEmpty()) {
                                tokenCount.incrementAndGet();
                                aiResponseBuilder.append(token);
                                synchronized (responseObserver) {
                                    if (!streamCompleted.get()) {
                                        responseObserver.onNext(AiResponse.newBuilder().setText(token).build());
                                    }
                                }
                            }
                        })
                        .doOnComplete(() -> {
                            String fullResponse = aiResponseBuilder.toString().trim();
                            int tokens = tokenCount.get();

                            if (fullResponse.isEmpty()) {
                                log.warn("Session [{}]: AI returned EMPTY response ({} raw tokens). " +
                                         "NOT adding empty turn to transcript.", sessionId, tokens);
                            } else {
                                session.addTurn("Interviewer", fullResponse);
                                log.info("Session [{}]: Interviewer turn recorded ({} chars, {} tokens).",
                                        sessionId, fullResponse.length(), tokens);
                            }

                            // Signal end-of-turn so audio module knows this response is complete
                            synchronized (responseObserver) {
                                if (!streamCompleted.get()) {
                                    responseObserver.onNext(AiResponse.newBuilder().setText("[EOT]").build());
                                }
                            }
                            currentLatch.countDown();
                        })
                        .subscribe(
                                token -> { /* handled by doOnNext */ },
                                error -> {
                                    log.error("Session [{}]: Groq streaming error (subscribe handler).",
                                            sessionId, error);
                                    handleStreamingFailure(
                                            session,
                                            responseObserver,
                                            streamCompleted,
                                            aiResponseBuilder,
                                            tokenCount.get(),
                                            error
                                    );
                                    currentLatch.countDown();
                                }
                        );
            }

            @Override
            public void onError(Throwable t) {
                log.error("ChatStream client error: {}", t.getMessage(), t);
                if (currentSessionId != null) {
                    InterviewSession session = sessionManager.getSession(currentSessionId);
                    cancelTimerIfActive(session);
                    triggerEvaluationAndComplete(session, responseObserver);
                }
            }

            @Override
            public void onCompleted() {
                log.info("ChatStream: Client closed the stream (end_interview).");
                if (currentSessionId != null) {
                    InterviewSession session = sessionManager.getSession(currentSessionId);
                    cancelTimerIfActive(session);

                    // Wait for any in-flight AI response to finish
                    if (responseLatch != null) {
                        try {
                            log.info("Session [{}]: Waiting for in-flight AI response before generating evaluation...",
                                    currentSessionId);
                            responseLatch.await(60, TimeUnit.SECONDS);
                        } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                        }
                    }

                    triggerEvaluationAndComplete(session, responseObserver);
                } else {
                    completeResponseStream(responseObserver);
                }
            }

            /**
             * Cancels the session timer if it is still running.
             */
            private void cancelTimerIfActive(InterviewSession session) {
                if (session == null) return;
                Disposable timer = session.getTimerDisposable();
                if (timer != null && !timer.isDisposed()) {
                    timer.dispose();
                    log.info("Session [{}]: Timer cancelled.", session.getSessionId());
                }
            }

            /**
             * Generates the evaluation report (exactly once) and completes the server stream.
             */
            private void triggerEvaluationAndComplete(InterviewSession session, StreamObserver<AiResponse> observer) {
                if (session == null) {
                    completeResponseStream(observer);
                    return;
                }

                String sessionId = session.getSessionId();

                // Exactly-once guard for evaluation
                if (!evaluationTriggered.compareAndSet(false, true)) {
                    log.info("Session [{}]: Evaluation already triggered, skipping.", sessionId);
                    completeResponseStream(observer);
                    return;
                }

                try {
                    log.info("Session [{}]: Generating evaluation report...", sessionId);

                    // BUG-1 FIX: Wait for body-language data from the analysis-bridge
                    // (sent via POST /api/session/{id}/body-language) before building
                    // the evaluator prompt. Without this, the race between the HTTP POST
                    // path and this gRPC completion path means body-language data is
                    // almost always null when getEvaluation() runs.
                    //
                    // BodyLanguageController.receiveBodyLanguage() calls countDown() after
                    // storing the data. If analysis-bridge is not running or the POST
                    // takes longer than 10 s, we fall through with "N/A" for presence score.
                    boolean bodyLanguageReceived = session.getBodyLanguageLatch().await(10, TimeUnit.SECONDS);
                    if (!bodyLanguageReceived) {
                        log.warn("Session [{}]: Body-language data did not arrive within 10 s. " +
                                 "Evaluating without presence data (Behavioral Data = N/A).", sessionId);
                    } else {
                        log.info("Session [{}]: Body-language data confirmed. Proceeding with full evaluation.", sessionId);
                    }

                    String evaluationJson = groqClientService.getEvaluation(session);
                    session.setEvaluationReportJson(evaluationJson);
                    log.info("Session [{}]: Evaluation report generated successfully.", sessionId);
                    log.info("--- EVALUATION REPORT ---\n{}", evaluationJson);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    log.warn("Session [{}]: Interrupted while awaiting body-language latch. Proceeding with evaluation.", sessionId);
                    try {
                        String evaluationJson = groqClientService.getEvaluation(session);
                        session.setEvaluationReportJson(evaluationJson);
                    } catch (Exception evalEx) {
                        log.error("Session [{}]: Failed to generate evaluation after interrupt.", sessionId, evalEx);
                        session.setEvaluationReportJson("{\"error\": \"Failed to generate evaluation report\"}");
                    }
                } catch (Exception e) {
                    log.error("Session [{}]: Failed to generate evaluation report.", sessionId, e);
                    session.setEvaluationReportJson("{\"error\": \"Failed to generate evaluation report\"}");
                }

                completeResponseStream(observer);
            }

            /**
             * Safely completes the server-side response stream (exactly once).
             */
            private void completeResponseStream(StreamObserver<AiResponse> observer) {
                if (streamCompleted.compareAndSet(false, true)) {
                    synchronized (observer) {
                        try {
                            observer.onCompleted();
                            log.info("gRPC response stream completed.");
                        } catch (Exception e) {
                            log.warn("Error completing response stream: {}", e.getMessage());
                        }
                    }
                }
            }
        };
    }

    /**
     * Handles server-side timer expiry: generates a closing statement and sends it.
     * This method is called from a non-Reactor thread (via CompletableFuture.runAsync)
     * because it makes blocking HTTP calls to the Groq API.
     *
     * Evaluation generation and stream completion are deferred to the onCompleted
     * handler, which fires when the audio module closes the gRPC client stream.
     *
     * @param streamCompleted shared flag from the per-session StreamObserver
     */
    private void handleTimerExpired(InterviewSession session, StreamObserver<AiResponse> responseObserver,
                                    AtomicBoolean streamCompleted) {
        String sessionId = session.getSessionId();

        // Prevent duplicate closing statements (onNext handler vs fallback timer)
        if (session.isClosingStatementSent()) {
            log.info("Session [{}]: Closing statement already sent, skipping.", sessionId);
            return;
        }
        session.setClosingStatementSent(true);

        log.info("Session [{}]: Timer expired handler running on thread [{}].",
                sessionId, Thread.currentThread().getName());

        try {
            String closingText = groqClientService.generateClosingStatement(session);
            session.addTurn("Interviewer", closingText);

            synchronized (responseObserver) {
                if (!streamCompleted.get()) {
                    responseObserver.onNext(AiResponse.newBuilder().setText(closingText).build());
                    responseObserver.onNext(AiResponse.newBuilder().setText("[EOT]").build());
                    log.info("Session [{}]: Closing statement sent.", sessionId);
                } else {
                    log.warn("Session [{}]: Stream already completed, cannot send closing statement.", sessionId);
                }
            }
        } catch (Exception e) {
            log.error("Session [{}]: Failed to generate closing statement on timer expiry.", sessionId, e);
        }
    }

    /**
     * Keeps the bidirectional interview stream usable when the upstream LLM
     * connection drops mid-turn. The audio bridge relies on [EOT] to unblock
     * the current turn, so every failure path must send a complete fallback
     * turn and then the sentinel.
     */
    private void handleStreamingFailure(InterviewSession session,
                                        StreamObserver<AiResponse> responseObserver,
                                        AtomicBoolean streamCompleted,
                                        StringBuilder partialResponseBuilder,
                                        int tokenCount,
                                        Throwable error) {
        String sessionId = session.getSessionId();
        String partialResponse = partialResponseBuilder.toString().trim();
        boolean hasPartialResponse = !partialResponse.isEmpty();

        String fallback = buildFallbackInterviewerTurn(session, hasPartialResponse);
        String recordedTurn = hasPartialResponse ? (partialResponse + fallback).trim() : fallback.trim();

        synchronized (responseObserver) {
            if (!streamCompleted.get()) {
                try {
                    responseObserver.onNext(AiResponse.newBuilder().setText(fallback).build());
                    responseObserver.onNext(AiResponse.newBuilder().setText("[EOT]").build());
                } catch (Exception sendError) {
                    log.warn("Session [{}]: Failed to send fallback after Groq error: {}",
                            sessionId, sendError.getMessage());
                }
            }
        }

        if (!recordedTurn.isBlank()) {
            session.addTurn("Interviewer", recordedTurn);
            log.warn("Session [{}]: Recorded fallback interviewer turn after Groq streaming failure " +
                            "(partial={}, tokens={}, cause={}).",
                    sessionId, hasPartialResponse, tokenCount, error.getMessage());
        }
    }

    private String buildFallbackInterviewerTurn(InterviewSession session, boolean hasPartialResponse) {
        String candidateName = (session.getCandidateName() != null && !session.getCandidateName().isBlank())
                ? session.getCandidateName()
                : "there";
        String subject = (session.getSubject() != null && !session.getSubject().isBlank())
                ? session.getSubject()
                : "this topic";

        if (session.isFirstTurn()) {
            return hasPartialResponse
                    ? " Could you briefly introduce your experience with " + subject + "?"
                    : "Hi " + candidateName + ", welcome. Could you briefly introduce your experience with " + subject + "?";
        }

        return hasPartialResponse
                ? " Could you explain one core concept in " + subject + " that you understand well?"
                : "No problem, let's continue. Could you explain one core concept in " + subject + " that you understand well?";
    }

    // ──────────────────────────────────────────────────────────────
    //  GetEvaluation — Unary RPC
    // ──────────────────────────────────────────────────────────────

    @Override
    public void getEvaluation(SessionId request, StreamObserver<EvaluationReport> responseObserver) {
        String sessionId = request.getId();
        log.info("GetEvaluation requested for session [{}].", sessionId);

        try {
            InterviewSession session = sessionManager.getSession(sessionId);
            if (session == null) {
                log.warn("GetEvaluation: Session [{}] not found.", sessionId);
                responseObserver.onNext(
                        EvaluationReport.newBuilder()
                                .setJsonReport("{\"error\": \"Session not found\"}")
                                .build()
                );
                responseObserver.onCompleted();
                return;
            }

            if (session.getEvaluationReportJson() != null) {
                log.info("GetEvaluation: Returning pre-calculated report for session [{}].", sessionId);
                responseObserver.onNext(
                        EvaluationReport.newBuilder()
                                .setJsonReport(session.getEvaluationReportJson())
                                .build()
                );
                responseObserver.onCompleted();
                return;
            }

            String evaluationJson = groqClientService.getEvaluation(session);
            log.info("GetEvaluation: Report generated on-demand for session [{}] ({} chars).",
                    sessionId, evaluationJson.length());

            responseObserver.onNext(
                    EvaluationReport.newBuilder()
                            .setJsonReport(evaluationJson)
                            .build()
            );
            responseObserver.onCompleted();
        } catch (Exception e) {
            log.error("GetEvaluation: Failed for session [{}].", sessionId, e);
            responseObserver.onError(e);
        }
    }
}
