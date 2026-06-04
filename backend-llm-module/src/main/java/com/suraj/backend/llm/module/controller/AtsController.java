package com.suraj.backend.llm.module.controller;

import com.suraj.backend.llm.module.service.AtsService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * REST controller for the ATS Resume Checker feature.
 * Provides a single endpoint to analyze resumes against job descriptions
 * using the existing Groq LLM infrastructure.
 *
 * POST /api/ats/analyze
 * Body: { "resumeText": "...", "jobDescription": "..." }
 */
@RestController
@RequestMapping("/api/ats")
@CrossOrigin(origins = "*")
public class AtsController {

    private static final Logger log = LoggerFactory.getLogger(AtsController.class);

    private final AtsService atsService;

    public AtsController(AtsService atsService) {
        this.atsService = atsService;
    }

    /**
     * Analyzes a resume against an optional job description.
     *
     * @param request map containing "resumeText" (required) and "jobDescription" (optional)
     * @return JSON string with the ATS analysis results
     */
    @PostMapping("/analyze")
    public ResponseEntity<String> analyzeResume(@RequestBody Map<String, String> request) {
        String resumeText = request.get("resumeText");
        String jobDescription = request.get("jobDescription");

        if (resumeText == null || resumeText.isBlank()) {
            return ResponseEntity.badRequest().body("{\"error\": \"resumeText is required\"}");
        }

        log.info("[ATS] Received analysis request — resume length={}, JD length={}",
                resumeText.length(),
                jobDescription != null ? jobDescription.length() : 0);

        String result = atsService.analyzeResume(resumeText, jobDescription);
        return ResponseEntity.ok(result);
    }
}
