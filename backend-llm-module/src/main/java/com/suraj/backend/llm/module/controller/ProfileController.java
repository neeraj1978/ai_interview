package com.suraj.backend.llm.module.controller;

import com.suraj.backend.llm.module.service.ProfileAnalysisService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * REST controller for AI-powered user profiling.
 * Analyzes candidate answers to derive their profile
 * (target role, preferred domain, skill level).
 *
 * POST /api/profile/analyze
 */
@RestController
@RequestMapping("/api/profile")
@CrossOrigin(origins = "*")
public class ProfileController {

    private static final Logger log = LoggerFactory.getLogger(ProfileController.class);

    private final ProfileAnalysisService profileAnalysisService;

    public ProfileController(ProfileAnalysisService profileAnalysisService) {
        this.profileAnalysisService = profileAnalysisService;
    }

    @PostMapping("/analyze")
    public ResponseEntity<Map<String, Object>> analyzeProfile(@RequestBody Map<String, Object> request) {
        String answerText = (String) request.get("answerText");
        int turnNumber = request.get("turnNumber") != null
                ? ((Number) request.get("turnNumber")).intValue()
                : 1;
        String previousContext = (String) request.get("previousContext");
        String targetRole = (String) request.get("targetRole");

        if (answerText == null || answerText.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "answerText is required"));
        }

        log.info("[Profile] Received analysis request — turn={}, answer length={}",
                turnNumber, answerText.length());

        Map<String, Object> result = profileAnalysisService.analyzeProfile(
                answerText, turnNumber, previousContext, targetRole);

        return ResponseEntity.ok(result);
    }
}
