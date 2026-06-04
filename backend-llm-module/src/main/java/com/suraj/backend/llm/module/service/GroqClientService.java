package com.suraj.backend.llm.module.service;

import com.suraj.backend.llm.module.model.EvaluationReportDTO;
import com.suraj.backend.llm.module.model.GuidanceSession;
import com.suraj.backend.llm.module.model.InterviewSession;
import org.springframework.ai.chat.client.ChatClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;

/**
 * Groq-backed LLM service for interview simulation and evaluation.
 * Uses Spring AI ChatClient pointed at Groq's OpenAI-compatible endpoint.
 * Model is configured via spring.ai.openai.chat.options.model in application.properties.
 *
 * All template variables ({SUBJECT}, {SUBTOPIC}, {DIFFICULTY_LEVEL}, etc.)
 * are injected from InterviewSession metadata, which will be populated
 * by an external API in the future.
 */
@Service
public class GroqClientService {

    private static final Logger log = LoggerFactory.getLogger(GroqClientService.class);
    private final ChatClient.Builder chatClientBuilder;
    private final ChatClient simulationClient;

    public GroqClientService(ChatClient.Builder chatClientBuilder) {
        this.chatClientBuilder = chatClientBuilder;
        this.simulationClient = chatClientBuilder.build();
    }

    // ──────────────────────────────────────────────────────────────
    //  SIMULATION PHASE — Streaming Interview Chat
    // ──────────────────────────────────────────────────────────────

    /**
     * Streams the next interviewer turn based on current session state.
     * Uses the Refined Simulator Template with all placeholders resolved.
     */
    public Flux<String> streamChat(InterviewSession session) {
        String systemPrompt = buildSimulatorPrompt(session);
        String userPrompt = buildConversationContext(session);

        log.info("[streamChat] Mode={}, Turns={}, UserPrompt length={}",
                session.getMode(), session.getTranscript().size(), userPrompt.length());
        log.info("[streamChat] UserPrompt:\n{}", userPrompt);

        return simulationClient.prompt()
                .system(systemPrompt)
                .user(userPrompt)
                .options(org.springframework.ai.openai.OpenAiChatOptions.builder()
                        .maxTokens(500)   // Override global 300 — ensures the model has room to complete
                        .build())
                .stream()
                .content()
                // If the model returns zero tokens, retry once automatically
                .switchIfEmpty(reactor.core.publisher.Flux.defer(() -> {
                    log.warn("[streamChat] Empty response from Groq — retrying once.");
                    return simulationClient.prompt()
                            .system(systemPrompt)
                            .user(userPrompt + "\n\nIMPORTANT: You MUST respond with a complete question. Do not output an empty response.")
                            .options(org.springframework.ai.openai.OpenAiChatOptions.builder()
                                    .maxTokens(500)
                                    .build())
                            .stream()
                            .content();
                }))
                .doOnSubscribe(s -> log.info("[streamChat] Groq streaming started."))
                .doOnComplete(() -> log.info("[streamChat] Groq streaming completed."))
                .doOnError(e -> log.error("[streamChat] Groq streaming error: {}", e.getMessage()));
    }

    /**
     * Generates the closing statement when the timer expires.
     * This is a non-streaming, deterministic response.
     */
    public String generateClosingStatement(InterviewSession session) {
        String subject = resolveVar(session.getSubject(), "the topic");

        String prompt = "You are a Senior Technical Interviewer. The interview timer has expired. " +
                "Deliver a brief, warm, and professional closing statement thanking the candidate " +
                "for their time discussing " + subject + ". Keep it under 30 words. " +
                "Do NOT ask any more questions. Stay in character.";

        return simulationClient.prompt()
                .system(prompt)
                .user("The interview has ended. Provide your closing remark now.")
                .call()
                .content();
    }

    // ──────────────────────────────────────────────────────────────
    //  EVALUATION PHASE — Non-Streaming Grading
    // ──────────────────────────────────────────────────────────────

    /**
     * Evaluates the full interview transcript and returns a strict JSON report.
     * Uses the Refined Evaluator Template with BeanOutputConverter for schema enforcement.
     *
     * <p><strong>Score Computation:</strong> After receiving the LLM's raw evaluation
     * (which contains only the 5 sub-scores), this method computes the deterministic
     * {@code overall_score} and {@code score_breakdown} using
     * {@link EvaluationReportDTO#computeOverallScore()} and injects them into the
     * returned JSON.</p>
     */
    public String getEvaluation(InterviewSession session) {
        String systemPrompt = buildEvaluatorPrompt(session);

        // Build a fresh instance specifically for evaluation
        ChatClient evaluationClient = chatClientBuilder.build();

        // NOTE: We do NOT use BeanOutputConverter here. The system prompt already
        // defines the exact snake_case JSON schema. Appending BeanOutputConverter's
        // camelCase schema creates conflicting instructions that confuse the LLM,
        // causing malformed output where sub-scores deserialize as 0.
        String userPrompt = "Evaluate the transcript now. Output ONLY the JSON object as specified in the OUTPUT FORMAT above. No markdown, no code fences, no extra text.";

        log.info("[getEvaluation] System prompt length={}, User prompt length={}",
                systemPrompt.length(), userPrompt.length());

        String response = evaluationClient.prompt()
                .system(systemPrompt)
                .user(userPrompt)
                .options(org.springframework.ai.openai.OpenAiChatOptions.builder()
                        .maxTokens(4096)   // Evaluation reports with 7-day study plans need ample room
                        .temperature(0.3)  // Lower temperature for structured output
                        .build())
                .call()
                .content();

        log.info("[getEvaluation] Raw LLM response length={}", response != null ? response.length() : 0);

        // ── Compute deterministic overall_score and inject score_breakdown ──
        return enrichWithComputedScore(response);
    }

    /**
     * Parses the raw LLM evaluation JSON, computes the deterministic overall score
     * using the weighted-average formula, and returns the enriched JSON with
     * {@code overall_score} and {@code score_breakdown} injected.
     *
     * Falls back to the raw response if parsing/enrichment fails.
     */
    private String enrichWithComputedScore(String rawJson) {
        if (rawJson == null || rawJson.isBlank()) {
            log.warn("[enrichWithComputedScore] Raw JSON is null/empty, returning as-is.");
            return rawJson;
        }

        try {
            // Strip markdown code fences if the LLM wrapped the JSON
            String cleanJson = rawJson.trim();
            if (cleanJson.startsWith("```")) {
                cleanJson = cleanJson.replaceAll("^```(?:json)?\\s*", "").replaceAll("\\s*```$", "");
            }

            log.info("[enrichWithComputedScore] Cleaned JSON (first 500 chars): {}",
                    cleanJson.substring(0, Math.min(500, cleanJson.length())));

            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            mapper.configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

            // Our evaluator prompt instructs SNAKE_CASE output (e.g. technical_scores,
            // problem_solving). Try snake_case deserialization FIRST — this is the
            // expected format now that we removed the conflicting BeanOutputConverter schema.
            mapper.setPropertyNamingStrategy(com.fasterxml.jackson.databind.PropertyNamingStrategies.SNAKE_CASE);
            EvaluationReportDTO dto = mapper.readValue(cleanJson, EvaluationReportDTO.class);

            // If snake_case yielded null nested objects, the LLM may have used camelCase — retry
            if (dto.getTechnicalScores() == null && dto.getCommunicationScores() == null) {
                log.info("[enrichWithComputedScore] SNAKE_CASE deserialization yielded null nested objects — retrying with camelCase.");
                com.fasterxml.jackson.databind.ObjectMapper camelMapper = new com.fasterxml.jackson.databind.ObjectMapper();
                camelMapper.configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
                dto = camelMapper.readValue(cleanJson, EvaluationReportDTO.class);
            }

            // Log the raw sub-scores for debugging
            log.info("[enrichWithComputedScore] Parsed sub-scores: accuracy={}, depth={}, problemSolving={}, clarity={}, confidence={}",
                    dto.getTechnicalScores() != null ? dto.getTechnicalScores().getAccuracy() : "null",
                    dto.getTechnicalScores() != null ? dto.getTechnicalScores().getDepth() : "null",
                    dto.getTechnicalScores() != null ? dto.getTechnicalScores().getProblemSolving() : "null",
                    dto.getCommunicationScores() != null ? dto.getCommunicationScores().getClarity() : "null",
                    dto.getCommunicationScores() != null ? dto.getCommunicationScores().getConfidence() : "null");

            // Compute the deterministic weighted score (populates overallScore + scoreBreakdown)
            double computedScore = dto.computeOverallScore();
            log.info("[enrichWithComputedScore] Computed overall score: {} / 100", computedScore);

            // Always serialize output as snake_case for consistency
            com.fasterxml.jackson.databind.ObjectMapper writeMapper = new com.fasterxml.jackson.databind.ObjectMapper();
            writeMapper.setPropertyNamingStrategy(com.fasterxml.jackson.databind.PropertyNamingStrategies.SNAKE_CASE);
            String enrichedJson = writeMapper.writeValueAsString(dto);
            log.info("[enrichWithComputedScore] Enriched JSON length={}", enrichedJson.length());
            return enrichedJson;

        } catch (Exception e) {
            log.warn("[enrichWithComputedScore] Failed to parse/enrich LLM response. " +
                     "Returning raw JSON. Error: {}", e.getMessage());
            // Attempt to repair truncated JSON so the frontend can still display partial data
            return repairTruncatedJson(rawJson);
        }
    }

    /**
     * Attempts to repair truncated JSON by closing open brackets/braces.
     * This handles the common case where the LLM output was cut off mid-stream
     * due to maxTokens limits.
     */
    private String repairTruncatedJson(String json) {
        if (json == null || json.isBlank()) return "{}";

        String clean = json.trim();
        // Strip markdown fences if present
        if (clean.startsWith("```")) {
            clean = clean.replaceAll("^```(?:json)?\\s*", "").replaceAll("\\s*```$", "");
        }

        // Remove any trailing incomplete string value (cut off mid-word)
        // e.g., '"tasks": ["Solve 3 Leet' → '"tasks": ['
        clean = clean.replaceAll(",\\s*$", "");  // trailing comma
        clean = clean.replaceAll("\"[^\"]*$", "");  // incomplete string at end
        clean = clean.replaceAll(",\\s*$", "");  // trailing comma after removal

        // Count and close unclosed brackets
        int openBraces = 0, openBrackets = 0;
        boolean inString = false;
        char prev = 0;
        for (int i = 0; i < clean.length(); i++) {
            char c = clean.charAt(i);
            if (c == '"' && prev != '\\') {
                inString = !inString;
            } else if (!inString) {
                if (c == '{') openBraces++;
                else if (c == '}') openBraces--;
                else if (c == '[') openBrackets++;
                else if (c == ']') openBrackets--;
            }
            prev = c;
        }

        StringBuilder sb = new StringBuilder(clean);
        for (int i = 0; i < openBrackets; i++) sb.append("]");
        for (int i = 0; i < openBraces; i++) sb.append("}");

        String repaired = sb.toString();
        log.info("[repairTruncatedJson] Repaired JSON (closed {} braces, {} brackets). Length={}",
                openBraces, openBrackets, repaired.length());

        // Validate the repair actually produces valid JSON
        try {
            new com.fasterxml.jackson.databind.ObjectMapper().readTree(repaired);
            return repaired;
        } catch (Exception ex) {
            log.warn("[repairTruncatedJson] Repair failed, returning raw: {}", ex.getMessage());
            return json;  // last resort: return the original
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  PROMPT BUILDERS
    // ══════════════════════════════════════════════════════════════

    /**
     * Builds the full Simulator System Prompt with all placeholders resolved.
     */
    private String buildSimulatorPrompt(InterviewSession session) {
        String name = resolveVar(session.getCandidateName(), "there");
        String subject = resolveVar(session.getSubject(), "General Programming");
        String subtopic = resolveVar(session.getSubtopic(), "Fundamentals");
        String difficulty = resolveVar(session.getDifficulty(), "Intermediate");

        return String.format("""
        ### SYSTEM ROLE
        You are a Senior Technical Interviewer at a top-tier tech company conducting a \
        LIVE VOICE interview with a candidate named %s. You speak naturally, like a real \
        person — warm but rigorous. You never break character or reveal you are an AI.
        
        ### INTERVIEW CONFIGURATION
        - Candidate: %s
        - Subject: %s
        - Subtopic: %s
        - Difficulty: %s
        
        ---
        
        ### TOPIC SCOPING (HARD RULES)
        1. VALID STACKS: Java (Core/Spring/Spring Boot), Python (Core/Scikit-learn/Django/TensorFlow), \
        JS (Core/Node/React/Next), Database (SQL/NoSQL/Redis/Cassandra).
        2. NEVER CROSS SCOPES: If Subtopic is "Core Java", NEVER mention Spring. \
        If "Python/Django", NEVER mention TensorFlow. Stay laser-focused.
        
        ---
        
        ### DIFFICULTY CALIBRATION
        - EASY: Definitions, syntax, "What is X?", "Explain Y". No scenarios or design questions.
        - INTERMEDIATE: Application, trade-offs, "Compare X vs Y", "When would you use X?", moderate problem-solving.
        - ADVANCED: System design, architectural trade-offs, performance, edge cases, "Design a solution for X".
        
        ---
        
        ### INTERVIEW FLOW
        
        **PHASE 1 — WARM-UP & ANCHORING (First Turn Only)**
        - **MANDATORY:** You MUST start your very first sentence by saying "Hello %s." Then, ask for a brief background on their experience with %s.
        - **STRICT PRIORITY:** Listen for mentions of "projects", "apps", or "work experience". \
        If the candidate mentions a specific project, your VERY NEXT question MUST be about that project.
        
        **PHASE 2 — ADAPTIVE TECHNICAL DEEP-DIVE**
        - **RULE 0: CONDUCT VIOLATION (TOP PRIORITY):** If the candidate uses profanity, insults you, \
        or is unprofessional, do NOT "pivot." Call out the behavior firmly but professionally \
        (e.g., "Let's maintain a professional tone for this interview.") and immediately pivot \
        to a significantly HARDER technical question as an escalation.
        - **RULE 1: PROJECT FIRST:** If the candidate mentioned a project or hands-on experience, \
        probe that context immediately (e.g., "Tell me about the architecture of that backend you mentioned."). \
        Do NOT jump to abstract definitions while a real project is on the table.
        - **RULE 2: EVALUATE & BRIDGE:** If the context is theoretical, analyze the response:
            - **If partial/shallow:** Stay on the SAME topic. Use a neutral bridge and probe deeper.
            - **If "I don't know" or "No":** Say "No problem, let's pivot," and move to a new area within %s.
            - **If strong:** Acknowledge ("Spot on", "Exactly") and escalate to a harder concept.
        - **DYNAMICS:** Ask exactly ONE focused question per turn. Never repeat a topic already covered.
        
        **PHASE 3 — CONCLUSION**
        - Trigger only if the timer expires or user requests to end.
        - Respond: "Thanks for the discussion, %s. I have enough for my assessment. Finalizing your report now."
        
        ---
        
        ### VOICE PROTOCOLS (CRITICAL)
        - **RIGOROUS PERSONA:** You have high standards. If a candidate is rude or gives zero effort, \
        your tone should remain professional but become noticeably colder and more demanding.
        - **BREVITY:** Keep responses UNDER 40 WORDS. One brief bridge/correction + one question.
        - **NO RECAPS:** Do not repeat the candidate's answer back to them.
        - **NO AI TELLS:** Stay in character. No "Great question!" or "As an AI."
        - **SENTENCE INTEGRITY:** Every turn must end with a complete question ending in "?".
        """,
                name, name, subject, subtopic, difficulty, name, subject, subtopic, name);
    }

    /**
     * Builds the conversation context (user prompt) based on session state.
     * First turn triggers warm-up; subsequent turns feed the full transcript.
     */
    private String buildConversationContext(InterviewSession session) {
        if (session.isFirstTurn()) {
            return "Begin the interview now. Greet the candidate and ask the PHASE 1 warm-up question.";
        }

        return """
                Here is the interview transcript so far:
                ───────────────────────────────
                %s
                ───────────────────────────────
                
                Continue the interview. Follow the INTERVIEW FLOW rules strictly.
                """.formatted(session.getFormattedTranscript());
    }

    /**
     * Builds the full Evaluator System Prompt with all placeholders resolved.
     */
    private String buildEvaluatorPrompt(InterviewSession session) {
        String subject = resolveVar(session.getSubject(), "General");
        String subtopic = resolveVar(session.getSubtopic(), "General");
        String difficulty = resolveVar(session.getDifficulty(), "Intermediate");
        String transcript = session.getFormattedTranscript();
        String bodyLanguage = resolveVar(session.getBodyLanguageData(), "N/A");

        return """
                ### SYSTEM ROLE
                You are a Senior Technical Interview Evaluator. Your goal is to provide a brutal, honest, and evidence-based assessment of a candidate's performance.
                
                ### INPUT DATA
                - Subject: %s
                - Subtopic: %s
                - Difficulty: %s
                - Transcript:
                %s
                - Behavioral Data: %s
                
                ### EVALUATION PROTOCOLS
                1. EVIDENCE ONLY: Every score must be backed by a quote or specific observation from the transcript.
                2. VAGUENESS PENALTY: If a user uses filler words or avoids specific technical terms, mark as "Partial".
                3. CONFIDENCE GAP: Explicitly flag if the user's verbal confidence does not match their technical accuracy.
                4. JSON INTEGRITY: Output ONLY the JSON object. Do not include introductory text or markdown formatting.
                5. SCORE PRECISION: Each score MUST be a number between 0.0 and 10.0 (inclusive). Use decimals for precision (e.g., 7.5, not just 7).
                
                ### SCORING CRITERIA (0-10 each)
                - Technical Accuracy: Precision of facts/definitions.
                - Depth: Ability to explain "Why" and "How", not just "What".
                - Problem-Solving: How they handled follow-ups or hints.
                - Clarity: Structure of the verbal explanation.
                - Presence: Use Behavioral Data to assess delivery. If data is "N/A", set to 5.0 (Neutral).
                
                NOTE: Do NOT include "overall_score" in your output. The overall score is computed externally using a weighted formula applied to your five sub-scores.
                
                ---
                
                ### OUTPUT FORMAT (STRICT JSON)
                {
                  "technical_scores": {
                    "accuracy": X.X,
                    "depth": X.X,
                    "problem_solving": X.X
                  },
                  "communication_scores": {
                    "clarity": X.X,
                    "confidence": X.X
                  },
                  "behavioral_summary": {
                    "confidence_level": "High/Med/Low",
                    "observations": "Brief summary of delivery"
                  },
                  "strengths": ["string", "string"],
                  "weaknesses": ["string", "string"],
                  "missed_concepts": ["concept name", "concept name"],
                  "question_analysis": [
                    {
                      "question": "string",
                      "rating": "Correct/Partial/Wrong",
                      "justification": "Evidence from transcript"
                    }
                  ],
                  "final_verdict": {
                    "skill_level": "Beginner/Intermediate/Advanced",
                    "hire_recommendation": "Yes/No/Maybe",
                    "summary": "2-sentence professional summary"
                  },
                  "study_plan": [
                    {
                      "day": 1,
                      "topic": "Topic name from missed_concepts or weaknesses",
                      "focus": "What specifically to study about this topic",
                      "tasks": ["Concrete task 1", "Concrete task 2"]
                    }
                  ]
                }
                
                ### STUDY PLAN RULES
                - Generate EXACTLY 7 days (day 1 through 7).
                - Base the plan on the candidate's missed_concepts and weaknesses.
                - Day 1-3: Focus on the weakest areas. Day 4-5: Reinforce partial areas. Day 6-7: Practice and consolidation.
                - Each day must have 2-3 concrete tasks (e.g., "Implement a HashMap from scratch", "Solve 3 LeetCode medium problems on trees").
                - Keep the subject scope to %s / %s.
                """.formatted(subject, subtopic, difficulty, transcript, bodyLanguage, subject, subtopic);
    }

    // ──────────────────────────────────────────────────────────────
    //  GUIDANCE PHASE — Streaming Teacher Chat
    // ──────────────────────────────────────────────────────────────

    /**
     * Streams the next teacher response based on the guidance session state.
     * Uses the Guidance Teacher Prompt with subject/subtopic scoping.
     */
    public Flux<String> streamGuidanceChat(GuidanceSession session) {
        String systemPrompt = buildGuidancePrompt(session);
        String userPrompt = buildGuidanceContext(session);

        log.info("[streamGuidanceChat] Subject={}, Turns={}, UserPrompt length={}",
                session.getSubject(), session.getTranscript().size(), userPrompt.length());

        return simulationClient.prompt()
                .system(systemPrompt)
                .user(userPrompt)
                .options(org.springframework.ai.openai.OpenAiChatOptions.builder()
                        .maxTokens(800)
                        .build())
                .stream()
                .content()
                .switchIfEmpty(reactor.core.publisher.Flux.defer(() -> {
                    log.warn("[streamGuidanceChat] Empty response from Groq — retrying once.");
                    return simulationClient.prompt()
                            .system(systemPrompt)
                            .user(userPrompt + "\n\nIMPORTANT: You MUST respond. Do not output an empty response.")
                            .options(org.springframework.ai.openai.OpenAiChatOptions.builder()
                                    .maxTokens(800)
                                    .build())
                            .stream()
                            .content();
                }))
                .doOnSubscribe(s -> log.info("[streamGuidanceChat] Groq streaming started."))
                .doOnComplete(() -> log.info("[streamGuidanceChat] Groq streaming completed."))
                .doOnError(e -> log.error("[streamGuidanceChat] Groq streaming error: {}", e.getMessage()));
    }

    /**
     * Builds the Guidance Teacher System Prompt.
     */
    private String buildGuidancePrompt(GuidanceSession session) {
        String subject = resolveVar(session.getSubject(), "General Programming");
        String subtopic = resolveVar(session.getSubtopic(), "Fundamentals");

        return String.format("""
        ### SYSTEM ROLE
        You are a patient, knowledgeable, and encouraging Technical Teacher conducting a \
        LIVE VOICE tutoring session. You speak naturally and warmly, like a real mentor. \
        You never break character or reveal you are an AI.

        ### SESSION CONFIGURATION
        - Subject: %s
        - Subtopic: %s

        ---

        ### TEACHING RULES (HARD RULES)

        1. **EXPLAIN, DON'T INTERROGATE:** Your job is to ANSWER the student's questions \
        and clear their doubts. Do NOT quiz them or ask follow-up questions unless you \
        need clarification on what they're asking.

        2. **USE EXAMPLES:** Always include a brief, concrete example or analogy when \
        explaining a concept. Code snippets should be kept short (1-3 lines max for voice).

        3. **STAY SCOPED:** Only discuss topics within %s / %s. If the student asks about \
        something outside scope, briefly redirect: "That's a great question, but let's \
        focus on %s for now."

        4. **PROGRESSIVE DEPTH:** Start with a simple explanation. If the student asks \
        for more detail, go deeper. Match their level.

        5. **ACKNOWLEDGE CONFUSION:** If a student says "I don't understand" or asks \
        the same thing again, rephrase your explanation using a different angle or analogy. \
        Never repeat the exact same explanation.

        6. **NO EVALUATION:** Never grade, score, or judge the student. This is a safe \
        learning space. Use encouraging phrases like "Good question!", "That's a common \
        confusion", "Let me break it down".

        ---

        ### VOICE PROTOCOLS (CRITICAL)
        - **BREVITY:** Keep responses UNDER 80 WORDS. Be concise but complete.
        - **SENTENCE INTEGRITY:** Always finish your sentences. Never leave a thought incomplete.
        - **NO AI TELLS:** Stay in character. No "As an AI" or "I'm a language model."
        - **WARM TONE:** Be approachable, patient, and supportive.
        """,
                subject, subtopic, subject, subtopic, subtopic);
    }

    /**
     * Builds the conversation context for guidance mode.
     */
    private String buildGuidanceContext(GuidanceSession session) {
        if (session.isFirstTurn()) {
            return "Begin the tutoring session. Greet the student warmly as their teacher. " +
                   "Mention that today's session is about " + resolveVar(session.getSubtopic(), "the topic") +
                   " in " + resolveVar(session.getSubject(), "the subject") +
                   ". Then ask the student how you can help — for example, " +
                   "\"What would you like to learn about " + resolveVar(session.getSubtopic(), "this topic") +
                   "?\" or \"Do you have any specific doubts?\". " +
                   "Keep the greeting brief and natural. Do NOT start teaching yet — wait for the student to tell you what they need.";
        }

        return """
                Here is the tutoring conversation so far:
                ───────────────────────────────
                %s
                ───────────────────────────────

                Continue the tutoring session. Answer the student's latest question or doubt clearly.
                """.formatted(session.getFormattedTranscript());
    }

    // ──────────────────────────────────────────────────────────────
    //  UTILITY
    // ──────────────────────────────────────────────────────────────

    /**
     * Resolves a template variable, falling back to defaultValue if null or blank.
     */
    private String resolveVar(String value, String defaultValue) {
        return (value != null && !value.isBlank()) ? value : defaultValue;
    }
}