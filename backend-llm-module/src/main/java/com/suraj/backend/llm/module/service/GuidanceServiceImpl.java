package com.suraj.backend.llm.module.service;

import com.suraj.backend.llm.module.model.GuidanceSession;
import com.suraj.interview.grpc.AiResponse;
import com.suraj.interview.grpc.GuidanceMessage;
import com.suraj.interview.grpc.GuidanceServiceGrpc;
import io.grpc.stub.StreamObserver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.grpc.server.service.GrpcService;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * gRPC server implementation for the Guidance (Teacher) Service.
 * Handles bidirectional GuidanceStream RPC.
 *
 * Much simpler than {@link InterviewServiceImpl}:
 * - No timer logic
 * - No evaluation generation
 * - No body-language coordination
 * - No closing statement protocol
 *
 * Thread-safety follows the same patterns: synchronized on responseObserver,
 * CountDownLatch for serialization, AtomicBoolean for stream completion.
 */
@GrpcService
public class GuidanceServiceImpl extends GuidanceServiceGrpc.GuidanceServiceImplBase {

    private static final Logger log = LoggerFactory.getLogger(GuidanceServiceImpl.class);

    private final SessionManager sessionManager;
    private final GroqClientService groqClientService;

    public GuidanceServiceImpl(SessionManager sessionManager, GroqClientService groqClientService) {
        this.sessionManager = sessionManager;
        this.groqClientService = groqClientService;
    }

    @Override
    public StreamObserver<GuidanceMessage> guidanceStream(StreamObserver<AiResponse> responseObserver) {
        return new StreamObserver<GuidanceMessage>() {
            private String currentSessionId;

            // Gate to serialize teacher responses — only one streams at a time
            private volatile CountDownLatch responseLatch = null;

            // Tracks whether the server response stream has been completed
            private final AtomicBoolean streamCompleted = new AtomicBoolean(false);

            @Override
            public void onNext(GuidanceMessage message) {
                currentSessionId = message.getSessionId();
                String sessionId = currentSessionId;
                String text = message.getText();
                GuidanceSession session = sessionManager.getOrCreateGuidanceSession(sessionId);

                // ── Initialize session on first message ──
                if (!session.isInitialized() && !message.getSubject().isEmpty()) {
                    session.initialize(message.getSubject(), message.getSubtopic());
                    log.info("Guidance session [{}] initialized: {} / {}",
                            sessionId, session.getSubject(), session.getSubtopic());
                }

                // ── Handle empty text (first turn → teacher greeting) ──
                if (text == null || text.isBlank()) {
                    if (session.isFirstTurn()) {
                        log.info("Guidance [{}]: First turn — teacher will greet the student.", sessionId);
                    } else {
                        log.debug("Guidance [{}]: Empty text on non-first turn, skipping.", sessionId);
                        return;
                    }
                } else {
                    session.addTurn("Student", text);
                }

                // ── Wait for any previous teacher response to finish ──
                if (responseLatch != null) {
                    try {
                        boolean finished = responseLatch.await(60, TimeUnit.SECONDS);
                        if (!finished) {
                            log.warn("Guidance [{}]: Previous response timed out (60s).", sessionId);
                        }
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                }

                // ── Stream the teacher's response ──
                if (streamCompleted.get()) {
                    log.warn("Guidance [{}]: Stream already completed.", sessionId);
                    return;
                }

                CountDownLatch currentLatch = new CountDownLatch(1);
                responseLatch = currentLatch;

                StringBuilder responseBuilder = new StringBuilder();
                groqClientService.streamGuidanceChat(session)
                        .doOnNext(token -> {
                            if (token != null && !token.isEmpty()) {
                                responseBuilder.append(token);
                                synchronized (responseObserver) {
                                    if (!streamCompleted.get()) {
                                        responseObserver.onNext(
                                                AiResponse.newBuilder().setText(token).build());
                                    }
                                }
                            }
                        })
                        .doOnComplete(() -> {
                            String fullResponse = responseBuilder.toString().trim();
                            if (!fullResponse.isEmpty()) {
                                session.addTurn("Teacher", fullResponse);
                                log.info("Guidance [{}]: Teacher turn recorded ({} chars).",
                                        sessionId, fullResponse.length());
                            }

                            // Signal end-of-turn
                            synchronized (responseObserver) {
                                if (!streamCompleted.get()) {
                                    responseObserver.onNext(
                                            AiResponse.newBuilder().setText("[EOT]").build());
                                }
                            }
                            currentLatch.countDown();
                        })
                        .subscribe(
                                token -> { /* handled by doOnNext */ },
                                error -> {
                                    log.error("Guidance [{}]: Groq streaming error.", sessionId, error);
                                    // Send a fallback response
                                    synchronized (responseObserver) {
                                        if (!streamCompleted.get()) {
                                            responseObserver.onNext(AiResponse.newBuilder()
                                                    .setText("I'm sorry, I had a brief issue. Could you repeat your question?")
                                                    .build());
                                            responseObserver.onNext(AiResponse.newBuilder()
                                                    .setText("[EOT]").build());
                                        }
                                    }
                                    currentLatch.countDown();
                                }
                        );
            }

            @Override
            public void onError(Throwable t) {
                log.error("GuidanceStream client error: {}", t.getMessage(), t);
                completeStream();
            }

            @Override
            public void onCompleted() {
                log.info("GuidanceStream: Client closed the stream (session ended).");

                // Wait for any in-flight response
                if (responseLatch != null) {
                    try {
                        responseLatch.await(30, TimeUnit.SECONDS);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                }

                completeStream();
            }

            private void completeStream() {
                if (streamCompleted.compareAndSet(false, true)) {
                    synchronized (responseObserver) {
                        try {
                            responseObserver.onCompleted();
                            log.info("Guidance gRPC response stream completed.");
                        } catch (Exception e) {
                            log.warn("Error completing guidance stream: {}", e.getMessage());
                        }
                    }
                }
            }
        };
    }
}
