package com.suraj.backend.llm.module.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

/**
 * AI-driven profiling service that analyzes candidate answers
 * to derive their target role, preferred domain, skill level, etc.
 * Uses the existing Groq-backed ChatClient.
 */
@Service
public class ProfileAnalysisService {

    private static final Logger log = LoggerFactory.getLogger(ProfileAnalysisService.class);
    private final ChatClient profileClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ProfileAnalysisService(ChatClient.Builder chatClientBuilder) {
        this.profileClient = chatClientBuilder.build();
    }

    /**
     * Analyzes a candidate's profiling answer and returns either
     * a follow-up question or the completed derived profile.
     */
    public Map<String, Object> analyzeProfile(String answerText, int turnNumber,
                                               String previousContext, String targetRole) {
        if (answerText == null || answerText.isBlank()) {
            return buildFallback(turnNumber, targetRole);
        }

        String systemPrompt = "You analyze candidate profiling answers and return JSON only.";
        String userPrompt = buildUserPrompt(answerText, turnNumber, previousContext, targetRole);

        log.info("[Profile] Analyzing turn {} answer ({} chars)", turnNumber, answerText.length());

        try {
            String response = profileClient.prompt()
                    .system(systemPrompt)
                    .user(userPrompt)
                    .options(org.springframework.ai.openai.OpenAiChatOptions.builder()
                            .maxTokens(1000)
                            .temperature(0.4)
                            .build())
                    .call()
                    .content();

            log.info("[Profile] LLM response received. Length={}", response != null ? response.length() : 0);

            // Strip markdown fences if present
            if (response != null) {
                String clean = response.trim();
                if (clean.startsWith("```")) {
                    clean = clean.replaceAll("^```(?:json)?\\s*", "").replaceAll("\\s*```$", "");
                }
                return parseResponse(clean, turnNumber, targetRole);
            }

            return buildFallback(turnNumber, targetRole);

        } catch (Exception e) {
            log.error("[Profile] Analysis failed: {}", e.getMessage());
            return buildFallback(turnNumber, targetRole);
        }
    }

    private Map<String, Object> parseResponse(String jsonString, int turnNumber, String targetRole) {
        try {
            JsonNode root = objectMapper.readTree(jsonString);

            boolean profileComplete = root.path("profile_complete").asBoolean(false)
                    || root.path("profileComplete").asBoolean(false)
                    || turnNumber >= 3;

            if (profileComplete) {
                Map<String, String> derivedProfile = new HashMap<>();
                derivedProfile.put("targetRole", getField(root, "target_role", "targetRole", targetRole != null ? targetRole : "unknown"));
                derivedProfile.put("preferredDomain", getField(root, "preferred_domain", "preferredDomain", "unknown"));
                derivedProfile.put("preferredSubdomain", getField(root, "preferred_subdomain", "preferredSubdomain", "unknown"));
                derivedProfile.put("inferredLevel", getField(root, "inferred_level", "inferredLevel", "easy"));
                derivedProfile.put("summary", getField(root, "summary", "summary", ""));

                Map<String, Object> result = new HashMap<>();
                result.put("nextQuestion", "");
                result.put("turnNumber", turnNumber);
                result.put("completed", true);
                result.put("derivedProfile", derivedProfile);
                return result;
            }

            String nextQuestion = getField(root, "next_question", "nextQuestion",
                    "Tell me which domain and subdomain you want the interview to focus on.");

            Map<String, Object> result = new HashMap<>();
            result.put("nextQuestion", nextQuestion);
            result.put("turnNumber", turnNumber + 1);
            result.put("completed", false);
            result.put("derivedProfile", null);
            return result;

        } catch (Exception e) {
            log.warn("[Profile] Failed to parse LLM JSON: {}", e.getMessage());
            return buildFallback(turnNumber, targetRole);
        }
    }

    private String getField(JsonNode root, String snakeCase, String camelCase, String defaultVal) {
        if (root.has(snakeCase) && !root.get(snakeCase).isNull()) {
            return root.get(snakeCase).asText(defaultVal);
        }
        if (root.has(camelCase) && !root.get(camelCase).isNull()) {
            return root.get(camelCase).asText(defaultVal);
        }
        return defaultVal;
    }

    private Map<String, Object> buildFallback(int turnNumber, String targetRole) {
        if (turnNumber >= 3) {
            Map<String, String> derivedProfile = new HashMap<>();
            derivedProfile.put("targetRole", targetRole != null ? targetRole : "unknown");
            derivedProfile.put("preferredDomain", "unknown");
            derivedProfile.put("preferredSubdomain", "unknown");
            derivedProfile.put("inferredLevel", "easy");
            derivedProfile.put("summary", "Profile derived from limited responses.");

            Map<String, Object> result = new HashMap<>();
            result.put("nextQuestion", "");
            result.put("turnNumber", turnNumber);
            result.put("completed", true);
            result.put("derivedProfile", derivedProfile);
            return result;
        }

        Map<String, Object> result = new HashMap<>();
        result.put("nextQuestion", "Tell me which domain and subdomain you want the interview to focus on.");
        result.put("turnNumber", turnNumber + 1);
        result.put("completed", false);
        result.put("derivedProfile", null);
        return result;
    }

    private String buildUserPrompt(String answerText, int turnNumber,
                                    String previousContext, String targetRole) {
        String contextBlock = "";
        if (previousContext != null && !previousContext.isBlank()) {
            contextBlock = """
                    
                    Previous conversation:
                    %s
                    """.formatted(previousContext);
        }

        String roleBlock = "";
        if (targetRole != null && !targetRole.isBlank()) {
            roleBlock = "\nTarget role mentioned: " + targetRole;
        }

        return """
                You are building a candidate profile for an interview platform.
                
                Analyze the candidate answer and return valid JSON with this exact shape:
                {
                  "summary": "short summary of the candidate's background and goals",
                  "preferred_domain": "string or unknown",
                  "preferred_subdomain": "string or unknown",
                  "target_role": "string or unknown",
                  "inferred_level": "easy|intermediate|advanced",
                  "next_question": "next profiling question",
                  "profile_complete": false
                }
                
                Rule for next_question:
                Dynamically adapt to the user's answers. If they mention a specific technical area \
                (like ML, Web Dev, DevOps etc.), ask a natural, personalized follow-up question to \
                determine their target role or level in that specific area. Do NOT restrict them to \
                a predefined list. Let the conversation flow naturally based on what they provide.
                
                Turn number: %d of 3. If this is turn 3 or you have gathered enough information, \
                set profile_complete to true.
                %s%s
                
                Candidate answer:
                %s
                """.formatted(turnNumber, contextBlock, roleBlock, answerText);
    }
}
