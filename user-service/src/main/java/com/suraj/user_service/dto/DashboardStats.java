package com.suraj.user_service.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
@Builder
@AllArgsConstructor
public class DashboardStats {

    private long totalInterviews;
    private Double averageScore;
    private Map<String, SubjectStats> subjectBreakdown;
    private List<ReportResponse> recentReports;

    @Data
    @Builder
    @AllArgsConstructor
    public static class SubjectStats {
        private long count;
        private double averageScore;
    }
}
