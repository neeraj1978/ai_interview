package com.suraj.user_service.service;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.suraj.user_service.dto.DashboardStats;
import com.suraj.user_service.dto.ReportRequest;
import com.suraj.user_service.dto.ReportResponse;
import com.suraj.user_service.entity.InterviewReport;
import com.suraj.user_service.entity.User;
import com.suraj.user_service.exception.ResourceNotFoundException;
import com.suraj.user_service.repository.InterviewReportRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class ReportService {

    private static final Logger log = LoggerFactory.getLogger(ReportService.class);
    private final InterviewReportRepository reportRepository;
    private final ObjectMapper objectMapper;

    public ReportService(InterviewReportRepository reportRepository, ObjectMapper objectMapper) {
        this.reportRepository = reportRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * Saves a new interview report. Extracts promoted fields (overallScore,
     * skillLevel, hireRecommendation) from the raw JSON for efficient queries.
     */
    public ReportResponse saveReport(User user, ReportRequest request) {
        // Convert reportJson (Object) to a JSON string for JSONB storage
        String jsonString;
        try {
            jsonString = request.getReportJson() instanceof String
                    ? (String) request.getReportJson()
                    : objectMapper.writeValueAsString(request.getReportJson());
        } catch (JacksonException e) {
            log.warn("Failed to serialize reportJson, storing as-is: {}", e.getMessage());
            jsonString = String.valueOf(request.getReportJson());
        }

        // Extract promoted fields from JSON
        Double overallScore = null;
        String skillLevel = null;
        String hireRecommendation = null;

        try {
            JsonNode root = objectMapper.readTree(jsonString);

            // Handle both snake_case (LLM output) and camelCase
            overallScore = extractDouble(root, "overall_score", "overallScore");
            skillLevel = extractString(root, "final_verdict", "finalVerdict", "skill_level", "skillLevel");
            hireRecommendation = extractString(root, "final_verdict", "finalVerdict", "hire_recommendation", "hireRecommendation");
        } catch (Exception e) {
            log.warn("Failed to extract promoted fields from reportJson: {}", e.getMessage());
        }

        InterviewReport report = InterviewReport.builder()
                .user(user)
                .sessionId(request.getSessionId())
                .subject(request.getSubject())
                .subtopic(request.getSubtopic())
                .difficulty(request.getDifficulty())
                .durationMinutes(request.getDurationMinutes())
                .overallScore(overallScore)
                .skillLevel(skillLevel)
                .hireRecommendation(hireRecommendation)
                .reportJson(jsonString)
                .build();

        report = reportRepository.save(report);
        log.info("Report saved: session={}, user={}, score={}", report.getSessionId(), user.getEmail(), overallScore);

        return toResponse(report);
    }

    /**
     * Returns all reports for the given user, ordered by most recent first.
     */
    public List<ReportResponse> getReports(Long userId) {
        return reportRepository.findByUserIdOrderByCreatedAtDesc(userId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    /**
     * Returns a single report by ID, with ownership validation.
     */
    public ReportResponse getReport(Long userId, Long reportId) {
        InterviewReport report = reportRepository.findByIdAndUserId(reportId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Report not found: " + reportId));
        return toResponse(report);
    }

    /**
     * Computes dashboard statistics: total interviews, avg score,
     * per-subject breakdown, and last 5 reports.
     */
    public DashboardStats getStats(Long userId) {
        long totalInterviews = reportRepository.countByUserId(userId);
        Double averageScore = reportRepository.findAverageScoreByUserId(userId);

        List<InterviewReport> allReports = reportRepository.findByUserIdOrderByCreatedAtDesc(userId);

        // Per-subject breakdown
        Map<String, DashboardStats.SubjectStats> subjectBreakdown = new LinkedHashMap<>();
        for (InterviewReport r : allReports) {
            String subject = r.getSubject() != null ? r.getSubject() : "Unknown";
            subjectBreakdown.compute(subject, (key, existing) -> {
                if (existing == null) {
                    return DashboardStats.SubjectStats.builder()
                            .count(1)
                            .averageScore(r.getOverallScore() != null ? r.getOverallScore() : 0.0)
                            .build();
                }
                long newCount = existing.getCount() + 1;
                double newAvg = r.getOverallScore() != null
                        ? ((existing.getAverageScore() * existing.getCount()) + r.getOverallScore()) / newCount
                        : existing.getAverageScore();
                return DashboardStats.SubjectStats.builder()
                        .count(newCount)
                        .averageScore(Math.round(newAvg * 100.0) / 100.0)
                        .build();
            });
        }

        // Last 5 reports (without full JSON for bandwidth)
        List<ReportResponse> recentReports = allReports.stream()
                .limit(5)
                .map(this::toSummaryResponse)
                .toList();

        return DashboardStats.builder()
                .totalInterviews(totalInterviews)
                .averageScore(averageScore != null ? Math.round(averageScore * 100.0) / 100.0 : null)
                .subjectBreakdown(subjectBreakdown)
                .recentReports(recentReports)
                .build();
    }

    // ── Mapping helpers ──

    private ReportResponse toResponse(InterviewReport report) {
        Object parsedJson = null;
        try {
            parsedJson = objectMapper.readTree(report.getReportJson());
        } catch (Exception e) {
            parsedJson = report.getReportJson();
        }

        return ReportResponse.builder()
                .id(report.getId())
                .sessionId(report.getSessionId())
                .subject(report.getSubject())
                .subtopic(report.getSubtopic())
                .difficulty(report.getDifficulty())
                .durationMinutes(report.getDurationMinutes())
                .overallScore(report.getOverallScore())
                .skillLevel(report.getSkillLevel())
                .hireRecommendation(report.getHireRecommendation())
                .reportJson(parsedJson)
                .createdAt(report.getCreatedAt())
                .build();
    }

    private ReportResponse toSummaryResponse(InterviewReport report) {
        return ReportResponse.builder()
                .id(report.getId())
                .sessionId(report.getSessionId())
                .subject(report.getSubject())
                .subtopic(report.getSubtopic())
                .difficulty(report.getDifficulty())
                .durationMinutes(report.getDurationMinutes())
                .overallScore(report.getOverallScore())
                .skillLevel(report.getSkillLevel())
                .hireRecommendation(report.getHireRecommendation())
                .reportJson(null) // Omit full JSON in summary
                .createdAt(report.getCreatedAt())
                .build();
    }

    // ── JSON extraction helpers (handles both snake_case and camelCase) ──

    private Double extractDouble(JsonNode root, String... keys) {
        for (String key : keys) {
            if (root.has(key) && root.get(key).isNumber()) {
                return root.get(key).asDouble();
            }
        }
        return null;
    }

    private String extractString(JsonNode root,
                                 String nestedKey1, String nestedKey2,
                                 String fieldKey1, String fieldKey2) {
        JsonNode nested = root.has(nestedKey1) ? root.get(nestedKey1)
                : root.has(nestedKey2) ? root.get(nestedKey2) : null;
        if (nested != null) {
            if (nested.has(fieldKey1)) return nested.get(fieldKey1).asText();
            if (nested.has(fieldKey2)) return nested.get(fieldKey2).asText();
        }
        return null;
    }
}
