package com.suraj.user_service.controller;

import com.suraj.user_service.dto.DashboardStats;
import com.suraj.user_service.dto.ReportRequest;
import com.suraj.user_service.dto.ReportResponse;
import com.suraj.user_service.entity.User;
import com.suraj.user_service.service.PdfReportService;
import com.suraj.user_service.service.ReportService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/reports")
public class ReportController {

    private final ReportService reportService;
    private final PdfReportService pdfReportService;

    public ReportController(ReportService reportService, PdfReportService pdfReportService) {
        this.reportService = reportService;
        this.pdfReportService = pdfReportService;
    }

    /**
     * Save an interview report for the authenticated user.
     */
    @PostMapping
    public ResponseEntity<ReportResponse> saveReport(@AuthenticationPrincipal User user,
                                                     @Valid @RequestBody ReportRequest request) {
        ReportResponse response = reportService.saveReport(user, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * List all interview reports for the authenticated user (most recent first).
     */
    @GetMapping
    public ResponseEntity<List<ReportResponse>> getReports(@AuthenticationPrincipal User user) {
        List<ReportResponse> reports = reportService.getReports(user.getId());
        return ResponseEntity.ok(reports);
    }

    /**
     * Get a single interview report by ID (ownership-validated).
     */
    @GetMapping("/{id}")
    public ResponseEntity<ReportResponse> getReport(@AuthenticationPrincipal User user,
                                                    @PathVariable Long id) {
        ReportResponse report = reportService.getReport(user.getId(), id);
        return ResponseEntity.ok(report);
    }

    /**
     * Download a PDF version of an interview report.
     */
    @GetMapping("/{id}/pdf")
    public ResponseEntity<byte[]> downloadPdf(@AuthenticationPrincipal User user,
                                               @PathVariable Long id) {
        ReportResponse report = reportService.getReport(user.getId(), id);
        String reportJson = report.getReportJson() instanceof String
                ? (String) report.getReportJson()
                : report.getReportJson().toString();

        byte[] pdf = pdfReportService.generatePdf(
                reportJson,
                report.getSubject(),
                report.getSubtopic(),
                report.getDifficulty(),
                report.getDurationMinutes(),
                report.getCreatedAt()
        );

        String filename = String.format("interview-report-%s-%s.pdf",
                report.getSubject() != null ? report.getSubject().toLowerCase().replace(" ", "-") : "general",
                report.getId());

        return ResponseEntity.ok()
                .header("Content-Type", "application/pdf")
                .header("Content-Disposition", "attachment; filename=\"" + filename + "\"")
                .body(pdf);
    }

    /**
     * Get dashboard statistics: totals, averages, per-subject breakdown, recent reports.
     */
    @GetMapping("/stats")
    public ResponseEntity<DashboardStats> getStats(@AuthenticationPrincipal User user) {
        DashboardStats stats = reportService.getStats(user.getId());
        return ResponseEntity.ok(stats);
    }
}
