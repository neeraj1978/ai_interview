package com.suraj.user_service.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
@AllArgsConstructor
public class ReportResponse {
    private Long id;
    private String sessionId;
    private String subject;
    private String subtopic;
    private String difficulty;
    private Integer durationMinutes;
    private Double overallScore;
    private String skillLevel;
    private String hireRecommendation;
    private Object reportJson;
    private LocalDateTime createdAt;
}
