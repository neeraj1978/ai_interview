package com.suraj.backend.llm.module.model;

import lombok.Data;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;

/**
 * Lightweight session model for Guidance (Teacher) mode.
 *
 * Unlike {@link InterviewSession}, this has:
 * - No timer / timer flags
 * - No evaluation report
 * - No body-language data
 * - No mode transitions (always "Guidance")
 */
@Data
public class GuidanceSession {
    private String sessionId;
    private String subject;
    private String subtopic;

    private final List<Turn> transcript = new CopyOnWriteArrayList<>();
    private boolean initialized = false;

    public GuidanceSession(String sessionId) {
        this.sessionId = sessionId;
    }

    /**
     * Initializes session metadata from the first GuidanceMessage.
     */
    public void initialize(String subject, String subtopic) {
        this.subject = subject;
        this.subtopic = subtopic;
        this.initialized = true;
    }

    public void addTurn(String role, String text) {
        transcript.add(new Turn(role, text));
    }

    /**
     * Returns true if this is the very first turn (no teacher turns yet).
     */
    public boolean isFirstTurn() {
        return transcript.stream().noneMatch(t -> "Teacher".equals(t.role()));
    }

    /**
     * Returns the full transcript formatted as:
     *   Teacher: [text]
     *   Student: [text]
     */
    public String getFormattedTranscript() {
        return transcript.stream()
                .map(Turn::getFormatted)
                .collect(Collectors.joining("\n"));
    }
}
