package com.suraj.user_service.service;

import com.lowagie.text.*;
import com.lowagie.text.Font;
import com.lowagie.text.pdf.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Iterator;

/**
 * Generates a styled PDF report from the interview evaluation JSON.
 * Uses OpenPDF (lightweight, LGPL-licensed iText fork).
 */
@Service
public class PdfReportService {

    private static final Logger log = LoggerFactory.getLogger(PdfReportService.class);
    private final ObjectMapper objectMapper;

    // ── Brand Colors ──
    private static final Color PRIMARY     = new Color(30, 41, 59);    // slate-800
    private static final Color ACCENT      = new Color(79, 70, 229);   // indigo-600
    private static final Color SUCCESS     = new Color(16, 185, 129);  // emerald-500
    private static final Color WARNING     = new Color(245, 158, 11);  // amber-500
    private static final Color DANGER      = new Color(239, 68, 68);   // red-500
    private static final Color MUTED       = new Color(100, 116, 139); // slate-500
    private static final Color LIGHT_BG    = new Color(248, 250, 252); // slate-50
    private static final Color BORDER      = new Color(226, 232, 240); // slate-200

    // ── Fonts ──
    private static final Font TITLE_FONT   = new Font(Font.HELVETICA, 22, Font.BOLD, Color.WHITE);
    private static final Font SUBTITLE     = new Font(Font.HELVETICA, 10, Font.NORMAL, new Color(191, 219, 254));
    private static final Font H2_FONT      = new Font(Font.HELVETICA, 14, Font.BOLD, PRIMARY);
    private static final Font H3_FONT      = new Font(Font.HELVETICA, 11, Font.BOLD, PRIMARY);
    private static final Font BODY         = new Font(Font.HELVETICA, 9.5f, Font.NORMAL, new Color(51, 65, 85));
    private static final Font BODY_BOLD    = new Font(Font.HELVETICA, 9.5f, Font.BOLD, new Color(51, 65, 85));
    private static final Font SCORE_FONT   = new Font(Font.HELVETICA, 36, Font.BOLD, Color.WHITE);
    private static final Font SCORE_LABEL  = new Font(Font.HELVETICA, 10, Font.NORMAL, new Color(191, 219, 254));
    private static final Font BADGE_FONT   = new Font(Font.HELVETICA, 8, Font.BOLD);
    private static final Font SMALL        = new Font(Font.HELVETICA, 8, Font.NORMAL, MUTED);

    public PdfReportService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * Generates a PDF byte array from the stored report JSON and metadata.
     */
    public byte[] generatePdf(String reportJson, String subject, String subtopic,
                               String difficulty, Integer durationMinutes,
                               LocalDateTime createdAt) {
        try {
            JsonNode root = objectMapper.readTree(reportJson);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            Document doc = new Document(PageSize.A4, 40, 40, 30, 40);
            PdfWriter.getInstance(doc, baos);
            doc.open();

            addHeader(doc, root, subject, subtopic, difficulty, durationMinutes, createdAt);
            addScoresSection(doc, root);
            addFeedbackSection(doc, root);
            addQuestionAnalysis(doc, root);
            addStudyPlan(doc, root);
            addFooter(doc);

            doc.close();
            return baos.toByteArray();
        } catch (Exception e) {
            log.error("Failed to generate PDF report: {}", e.getMessage(), e);
            throw new RuntimeException("PDF generation failed", e);
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  HEADER
    // ──────────────────────────────────────────────────────────────

    private void addHeader(Document doc, JsonNode root, String subject, String subtopic,
                           String difficulty, Integer durationMinutes, LocalDateTime createdAt)
            throws DocumentException {

        double overallScore = getDouble(root, "overall_score", "overallScore");

        PdfPTable header = new PdfPTable(2);
        header.setWidthPercentage(100);
        header.setWidths(new float[]{65, 35});

        // Left: title
        PdfPCell titleCell = new PdfPCell();
        titleCell.setBackgroundColor(PRIMARY);
        titleCell.setPadding(20);
        titleCell.setBorder(0);
        titleCell.setVerticalAlignment(Element.ALIGN_MIDDLE);

        Paragraph title = new Paragraph("Interview Evaluation", TITLE_FONT);
        titleCell.addElement(title);

        String meta = String.format("%s — %s | %s | %d min",
                subject != null ? subject : "General",
                subtopic != null ? subtopic : "",
                difficulty != null ? difficulty : "Medium",
                durationMinutes != null ? durationMinutes : 0);
        titleCell.addElement(new Paragraph(meta, SUBTITLE));

        if (createdAt != null) {
            titleCell.addElement(new Paragraph(
                    createdAt.format(DateTimeFormatter.ofPattern("dd MMM yyyy, HH:mm")), SUBTITLE));
        }

        header.addCell(titleCell);

        // Right: score
        PdfPCell scoreCell = new PdfPCell();
        scoreCell.setBackgroundColor(ACCENT);
        scoreCell.setPadding(20);
        scoreCell.setBorder(0);
        scoreCell.setHorizontalAlignment(Element.ALIGN_CENTER);
        scoreCell.setVerticalAlignment(Element.ALIGN_MIDDLE);

        scoreCell.addElement(centerParagraph(String.format("%.1f", overallScore), SCORE_FONT));
        scoreCell.addElement(centerParagraph("/ 100", SCORE_LABEL));

        header.addCell(scoreCell);
        doc.add(header);
        doc.add(spacer(12));

        // Verdict banner
        JsonNode verdict = getNode(root, "final_verdict", "finalVerdict");
        if (verdict != null) {
            String skillLevel = getText(verdict, "skill_level", "skillLevel");
            String hire = getText(verdict, "hire_recommendation", "hireRecommendation");
            String summary = getText(verdict, "summary", "summary");

            PdfPTable verdictTable = new PdfPTable(1);
            verdictTable.setWidthPercentage(100);
            PdfPCell verdictCell = new PdfPCell();
            verdictCell.setBackgroundColor(LIGHT_BG);
            verdictCell.setBorderColor(BORDER);
            verdictCell.setPadding(12);

            Paragraph badges = new Paragraph();
            badges.add(badge(skillLevel, ACCENT));
            badges.add(new Chunk("  "));
            badges.add(badge(hire,
                    "Yes".equals(hire) ? SUCCESS : "No".equals(hire) ? DANGER : WARNING));
            verdictCell.addElement(badges);

            if (summary != null) {
                Paragraph sumP = new Paragraph(summary, BODY);
                sumP.setSpacingBefore(6);
                verdictCell.addElement(sumP);
            }
            verdictTable.addCell(verdictCell);
            doc.add(verdictTable);
            doc.add(spacer(10));
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  SCORES
    // ──────────────────────────────────────────────────────────────

    private void addScoresSection(Document doc, JsonNode root) throws DocumentException {
        doc.add(sectionTitle("Technical & Communication Scores"));

        PdfPTable table = new PdfPTable(3);
        table.setWidthPercentage(100);
        table.setWidths(new float[]{40, 30, 30});

        // Headers
        for (String h : new String[]{"Parameter", "Score", "Rating"}) {
            PdfPCell cell = new PdfPCell(new Phrase(h, BODY_BOLD));
            cell.setBackgroundColor(LIGHT_BG);
            cell.setBorderColor(BORDER);
            cell.setPadding(8);
            table.addCell(cell);
        }

        JsonNode tech = getNode(root, "technical_scores", "technicalScores");
        if (tech != null) {
            addScoreRow(table, "Technical Accuracy", getDouble(tech, "accuracy", "accuracy"));
            addScoreRow(table, "Depth of Knowledge", getDouble(tech, "depth", "depth"));
            addScoreRow(table, "Problem Solving", getDouble(tech, "problem_solving", "problemSolving"));
        }

        JsonNode comm = getNode(root, "communication_scores", "communicationScores");
        if (comm != null) {
            addScoreRow(table, "Clarity", getDouble(comm, "clarity", "clarity"));
            addScoreRow(table, "Presence & Confidence", getDouble(comm, "confidence", "confidence"));
        }

        doc.add(table);
        doc.add(spacer(10));
    }

    private void addScoreRow(PdfPTable table, String label, double score) {
        PdfPCell labelCell = new PdfPCell(new Phrase(label, BODY));
        labelCell.setBorderColor(BORDER);
        labelCell.setPadding(7);
        table.addCell(labelCell);

        PdfPCell scoreCell = new PdfPCell(new Phrase(String.format("%.1f / 10", score), BODY_BOLD));
        scoreCell.setBorderColor(BORDER);
        scoreCell.setPadding(7);
        scoreCell.setHorizontalAlignment(Element.ALIGN_CENTER);
        table.addCell(scoreCell);

        Color ratingColor = score >= 8 ? SUCCESS : score >= 6 ? WARNING : DANGER;
        String ratingText = score >= 8 ? "Strong" : score >= 6 ? "Adequate" : "Needs Work";
        PdfPCell ratingCell = new PdfPCell(badge(ratingText, ratingColor));
        ratingCell.setBorderColor(BORDER);
        ratingCell.setPadding(7);
        ratingCell.setHorizontalAlignment(Element.ALIGN_CENTER);
        ratingCell.setVerticalAlignment(Element.ALIGN_MIDDLE);
        table.addCell(ratingCell);
    }

    // ──────────────────────────────────────────────────────────────
    //  FEEDBACK
    // ──────────────────────────────────────────────────────────────

    private void addFeedbackSection(Document doc, JsonNode root) throws DocumentException {
        PdfPTable grid = new PdfPTable(2);
        grid.setWidthPercentage(100);
        grid.setWidths(new float[]{50, 50});

        // Strengths
        PdfPCell strengthsCell = feedbackCell("✓ Strengths",
                getArray(root, "strengths"), SUCCESS);
        grid.addCell(strengthsCell);

        // Weaknesses
        PdfPCell weaknessesCell = feedbackCell("△ Areas for Improvement",
                getArray(root, "weaknesses"), WARNING);
        grid.addCell(weaknessesCell);

        doc.add(grid);

        // Missed Concepts
        JsonNode missed = getArrayNode(root, "missed_concepts", "missedConcepts");
        if (missed != null && missed.size() > 0) {
            doc.add(spacer(6));
            Paragraph missedP = new Paragraph();
            missedP.add(new Chunk("Missed Concepts: ", BODY_BOLD));
            for (int i = 0; i < missed.size(); i++) {
                if (i > 0) missedP.add(new Chunk(", ", BODY));
                missedP.add(new Chunk(missed.get(i).asText(), new Font(Font.HELVETICA, 9, Font.BOLD, DANGER)));
            }
            doc.add(missedP);
        }
        doc.add(spacer(10));
    }

    private PdfPCell feedbackCell(String title, String[] items, Color accentColor) {
        PdfPCell cell = new PdfPCell();
        cell.setBorder(0);
        cell.setPadding(8);

        Paragraph titleP = new Paragraph(title, H3_FONT);
        titleP.setSpacingAfter(4);
        cell.addElement(titleP);

        for (String item : items) {
            Paragraph bullet = new Paragraph("• " + item, BODY);
            bullet.setSpacingBefore(2);
            cell.addElement(bullet);
        }
        return cell;
    }

    // ──────────────────────────────────────────────────────────────
    //  QUESTION ANALYSIS
    // ──────────────────────────────────────────────────────────────

    private void addQuestionAnalysis(Document doc, JsonNode root) throws DocumentException {
        JsonNode qa = getArrayNode(root, "question_analysis", "questionAnalysis");
        if (qa == null || qa.isEmpty()) return;

        doc.add(sectionTitle("Question-by-Question Analysis"));

        for (int i = 0; i < qa.size(); i++) {
            JsonNode q = qa.get(i);
            String question = getText(q, "question", "question");
            String rating = getText(q, "rating", "rating");
            String justification = getText(q, "justification", "justification");

            PdfPTable card = new PdfPTable(1);
            card.setWidthPercentage(100);
            card.setSpacingBefore(4);

            PdfPCell cardCell = new PdfPCell();
            cardCell.setBackgroundColor(LIGHT_BG);
            cardCell.setBorderColor(BORDER);
            cardCell.setPadding(10);

            Paragraph qLine = new Paragraph();
            qLine.add(new Chunk("Q" + (i + 1) + ": ", new Font(Font.HELVETICA, 10, Font.BOLD, ACCENT)));
            qLine.add(new Chunk(question != null ? question : "", BODY_BOLD));
            qLine.add(new Chunk("  "));
            Color rColor = "Correct".equals(rating) ? SUCCESS : "Partial".equals(rating) ? WARNING : DANGER;
            qLine.add(badge(rating != null ? rating : "N/A", rColor));
            cardCell.addElement(qLine);

            if (justification != null) {
                Paragraph jP = new Paragraph(justification, SMALL);
                jP.setSpacingBefore(4);
                cardCell.addElement(jP);
            }
            card.addCell(cardCell);
            doc.add(card);
        }
        doc.add(spacer(10));
    }

    // ──────────────────────────────────────────────────────────────
    //  STUDY PLAN
    // ──────────────────────────────────────────────────────────────

    private void addStudyPlan(Document doc, JsonNode root) throws DocumentException {
        JsonNode plan = getArrayNode(root, "study_plan", "studyPlan");
        if (plan == null || plan.isEmpty()) return;

        doc.add(sectionTitle("7-Day Study Plan"));

        PdfPTable table = new PdfPTable(3);
        table.setWidthPercentage(100);
        table.setWidths(new float[]{12, 25, 63});

        for (String h : new String[]{"Day", "Topic", "Tasks"}) {
            PdfPCell cell = new PdfPCell(new Phrase(h, BODY_BOLD));
            cell.setBackgroundColor(ACCENT);
            cell.setBorderColor(ACCENT);
            cell.setPadding(8);
            Font whiteFont = new Font(Font.HELVETICA, 9.5f, Font.BOLD, Color.WHITE);
            cell = new PdfPCell(new Phrase(h, whiteFont));
            cell.setBackgroundColor(ACCENT);
            cell.setBorderColor(ACCENT);
            cell.setPadding(8);
            table.addCell(cell);
        }

        for (int i = 0; i < plan.size(); i++) {
            JsonNode day = plan.get(i);
            int dayNum = day.has("day") ? day.get("day").asInt() : i + 1;
            String topic = getText(day, "topic", "topic");
            String focus = getText(day, "focus", "focus");

            Color rowBg = i % 2 == 0 ? Color.WHITE : LIGHT_BG;

            PdfPCell dayCell = new PdfPCell(new Phrase("Day " + dayNum, BODY_BOLD));
            dayCell.setBackgroundColor(rowBg);
            dayCell.setBorderColor(BORDER);
            dayCell.setPadding(7);
            dayCell.setVerticalAlignment(Element.ALIGN_TOP);
            table.addCell(dayCell);

            PdfPCell topicCell = new PdfPCell();
            topicCell.setBackgroundColor(rowBg);
            topicCell.setBorderColor(BORDER);
            topicCell.setPadding(7);
            topicCell.addElement(new Phrase(topic != null ? topic : "", BODY_BOLD));
            if (focus != null) {
                topicCell.addElement(new Phrase(focus, SMALL));
            }
            table.addCell(topicCell);

            PdfPCell tasksCell = new PdfPCell();
            tasksCell.setBackgroundColor(rowBg);
            tasksCell.setBorderColor(BORDER);
            tasksCell.setPadding(7);
            JsonNode tasks = day.has("tasks") ? day.get("tasks") : null;
            if (tasks != null && tasks.isArray()) {
                for (int j = 0; j < tasks.size(); j++) {
                    Paragraph taskP = new Paragraph("• " + tasks.get(j).asText(), BODY);
                    taskP.setSpacingBefore(j > 0 ? 2 : 0);
                    tasksCell.addElement(taskP);
                }
            }
            table.addCell(tasksCell);
        }

        doc.add(table);
        doc.add(spacer(10));
    }

    // ──────────────────────────────────────────────────────────────
    //  FOOTER
    // ──────────────────────────────────────────────────────────────

    private void addFooter(Document doc) throws DocumentException {
        Paragraph footer = new Paragraph(
                "Generated by AI Interviewer • This report is AI-assisted and should be used as a guide.",
                SMALL);
        footer.setAlignment(Element.ALIGN_CENTER);
        footer.setSpacingBefore(20);
        doc.add(footer);
    }

    // ──────────────────────────────────────────────────────────────
    //  UTILITIES
    // ──────────────────────────────────────────────────────────────

    private Paragraph sectionTitle(String text) {
        Paragraph p = new Paragraph(text, H2_FONT);
        p.setSpacingBefore(6);
        p.setSpacingAfter(8);
        return p;
    }

    private Paragraph spacer(float height) {
        Paragraph p = new Paragraph(" ");
        p.setSpacingAfter(height);
        return p;
    }

    private Paragraph centerParagraph(String text, Font font) {
        Paragraph p = new Paragraph(text, font);
        p.setAlignment(Element.ALIGN_CENTER);
        return p;
    }

    private Phrase badge(String text, Color color) {
        Font f = new Font(Font.HELVETICA, 8, Font.BOLD, color);
        Chunk c = new Chunk(" " + (text != null ? text : "N/A") + " ", f);
        c.setBackground(new Color(
                Math.min(255, color.getRed() + 200),
                Math.min(255, color.getGreen() + 200),
                Math.min(255, color.getBlue() + 200)
        ), 3, 2, 3, 2);
        return new Phrase(c);
    }

    // ── JSON helpers ──

    private JsonNode getNode(JsonNode root, String snakeKey, String camelKey) {
        if (root.has(snakeKey)) return root.get(snakeKey);
        if (root.has(camelKey)) return root.get(camelKey);
        return null;
    }

    private JsonNode getArrayNode(JsonNode root, String snakeKey, String camelKey) {
        JsonNode n = getNode(root, snakeKey, camelKey);
        return n != null && n.isArray() ? n : null;
    }

    private String getText(JsonNode node, String snakeKey, String camelKey) {
        if (node == null) return null;
        if (node.has(snakeKey)) return node.get(snakeKey).asText();
        if (node.has(camelKey)) return node.get(camelKey).asText();
        return null;
    }

    private double getDouble(JsonNode node, String snakeKey, String camelKey) {
        if (node == null) return 0;
        if (node.has(snakeKey) && node.get(snakeKey).isNumber()) return node.get(snakeKey).asDouble();
        if (node.has(camelKey) && node.get(camelKey).isNumber()) return node.get(camelKey).asDouble();
        return 0;
    }

    private String[] getArray(JsonNode root, String key) {
        JsonNode arr = root.has(key) ? root.get(key) : null;
        if (arr == null || !arr.isArray()) return new String[0];
        String[] result = new String[arr.size()];
        for (int i = 0; i < arr.size(); i++) {
            result[i] = arr.get(i).asText();
        }
        return result;
    }
}
