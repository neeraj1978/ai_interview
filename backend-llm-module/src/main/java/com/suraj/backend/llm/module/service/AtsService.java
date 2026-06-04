package com.suraj.backend.llm.module.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Service;

/**
 * ATS (Applicant Tracking System) Resume Checker service.
 * Uses the existing Groq-backed ChatClient to analyze resumes
 * against job descriptions and provide structured ATS feedback.
 */
@Service
public class AtsService {

    private static final Logger log = LoggerFactory.getLogger(AtsService.class);
    private final ChatClient atsClient;

    public AtsService(ChatClient.Builder chatClientBuilder) {
        this.atsClient = chatClientBuilder.build();
    }

    /**
     * Analyzes a resume against an optional job description and returns
     * structured ATS feedback as a JSON string.
     *
     * @param resumeText     the plain-text content of the resume
     * @param jobDescription optional job description to match against
     * @return JSON string containing ATS analysis results
     */
    public String analyzeResume(String resumeText, String jobDescription) {
        if (resumeText == null || resumeText.isBlank()) {
            return "{\"error\": \"Resume text is empty.\"}";
        }

        String jd = (jobDescription != null && !jobDescription.isBlank())
                ? jobDescription
                : "General software engineering role at a tech company";

        String systemPrompt = buildAtsPrompt();
        String userPrompt = buildUserPrompt(resumeText, jd);

        log.info("[ATS] Analyzing resume ({} chars) against JD ({} chars)",
                resumeText.length(), jd.length());

        try {
            String response = atsClient.prompt()
                    .system(systemPrompt)
                    .user(userPrompt)
                    .options(org.springframework.ai.openai.OpenAiChatOptions.builder()
                            .maxTokens(4000)
                            .temperature(0.3)
                            .build())
                    .call()
                    .content();

            log.info("[ATS] Analysis complete. Response length={}", response != null ? response.length() : 0);

            // Strip markdown fences if present
            if (response != null) {
                String clean = response.trim();
                if (clean.startsWith("```")) {
                    clean = clean.replaceAll("^```(?:json)?\\s*", "").replaceAll("\\s*```$", "");
                }
                return clean;
            }
            return response;

        } catch (Exception e) {
            log.error("[ATS] Analysis failed: {}", e.getMessage());
            String safeMsg = e.getMessage() != null ? e.getMessage().replace("\"", "\\\"").replace("\n", " ") : "Unknown error";
            return "{\"error\": \"ATS analysis failed: " + safeMsg + "\"}";
        }
    }

    private String buildAtsPrompt() {
        return """
                ### SYSTEM ROLE
                You are an expert ATS (Applicant Tracking System) Resume Analyzer. \
                You evaluate resumes against job descriptions to provide actionable feedback \
                that helps candidates optimize their resumes for ATS systems and human reviewers.
                
                ### EVALUATION CRITERIA
                1. **Keyword Match**: Identify keywords from the job description found/missing in the resume
                2. **Formatting**: Check for ATS-friendly formatting (no tables, images, headers/footers)
                3. **Content Quality**: Evaluate action verbs, quantified achievements, relevance
                4. **Section Coverage**: Check for essential sections (Summary, Experience, Skills, Education)
                5. **Overall ATS Score**: 0-100 based on how well the resume would pass ATS screening
                
                ### SCORING GUIDE
                - 90-100: Excellent — strong keyword match, clean formatting, quantified achievements
                - 70-89: Good — most keywords present, minor formatting issues
                - 50-69: Needs Work — missing key terms, some formatting problems
                - Below 50: Poor — major gaps in keywords, formatting, or content
                
                ### OUTPUT FORMAT (STRICT JSON — no markdown, no explanatory text)
                CRITICAL INSTRUCTION: You MUST return ONLY valid, parseable JSON. Do NOT include any unquoted text inside arrays or anywhere else. Every string value must be wrapped in double quotes. Never use trailing commas.
                ### EXAMPLE VALID OUTPUT
                {
                  "ats_score": 85,
                  "summary": "This is a great resume with strong matching keywords.",
                  "keyword_analysis": {
                    "matched": ["React", "Java"],
                    "missing": ["Node.js"],
                    "match_percentage": 80
                  },
                  "section_analysis": {
                    "present": ["Experience", "Education"],
                    "missing": ["Summary"],
                    "feedback": "Add a summary section."
                  },
                  "formatting_issues": ["No bullet points used"],
                  "strengths": ["Strong technical background"],
                  "improvements": [
                    {
                      "category": "Keywords",
                      "issue": "Missing backend framework",
                      "suggestion": "Include Node.js if you have experience with it."
                    }
                  ],
                  "action_verbs": {
                    "strong_verbs_found": ["Developed"],
                    "weak_verbs_to_replace": [
                      {"current": "Worked on", "suggested": "Architected"}
                    ]
                  }
                }
                """;
    }

    private String buildUserPrompt(String resumeText, String jobDescription) {
        return """
                Analyze the following resume against the job description.
                
                === RESUME ===
                %s
                
                === JOB DESCRIPTION ===
                %s
                
                Provide your analysis as strict JSON following the output format.
                CRITICAL: Ensure the output is valid JSON. Escape all double quotes inside strings. Do NOT use literal newlines inside strings; use \\n instead. Never truncate the JSON.
                """.formatted(resumeText, jobDescription);
    }
}
