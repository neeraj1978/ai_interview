package com.suraj.user_service.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

/**
 * Sends transactional emails via the Resend API.
 */
@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);
    private static final String RESEND_API_URL = "https://api.resend.com/emails";

    @Value("${app.resend.api-key}")
    private String apiKey;

    @Value("${app.resend.from-email}")
    private String fromEmail;

    @Value("${app.frontend.url}")
    private String frontendUrl;

    private final RestTemplate restTemplate = new RestTemplate();

    /**
     * Sends a password reset email with a tokenized link.
     */
    public void sendPasswordResetEmail(String toEmail, String fullName, String token) {
        String resetLink = frontendUrl + "/reset-password?token=" + token;

        String htmlBody = """
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 24px;">
                  <div style="text-align: center; margin-bottom: 32px;">
                    <h1 style="font-size: 24px; font-weight: 700; color: #1e293b; margin: 0;">AI Interviewer</h1>
                  </div>
                  <div style="background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 24px rgba(0,0,0,0.04);">
                    <h2 style="font-size: 20px; font-weight: 600; color: #1e293b; margin: 0 0 8px 0;">Reset your password</h2>
                    <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
                      Hi <strong style="color: #1e293b;">%s</strong>, we received a request to reset your password.
                      Click the button below to choose a new one. This link expires in <strong>15 minutes</strong>.
                    </p>
                    <div style="text-align: center; margin: 24px 0;">
                      <a href="%s"
                         style="display: inline-block; background: #1e293b; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 999px;">
                        Reset Password
                      </a>
                    </div>
                    <p style="color: #94a3b8; font-size: 12px; line-height: 1.6; margin: 24px 0 0 0;">
                      If you didn't request this, you can safely ignore this email. Your password will not change.
                    </p>
                    <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
                    <p style="color: #cbd5e1; font-size: 11px; text-align: center; margin: 0;">
                      If the button doesn't work, copy and paste this link into your browser:<br/>
                      <a href="%s" style="color: #6366f1; word-break: break-all;">%s</a>
                    </p>
                  </div>
                </div>
                """.formatted(fullName, resetLink, resetLink, resetLink);

        Map<String, Object> payload = Map.of(
                "from", fromEmail,
                "to", List.of(toEmail),
                "subject", "Reset your password — AI Interviewer",
                "html", htmlBody
        );

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);

        try {
            ResponseEntity<String> response = restTemplate.exchange(
                    RESEND_API_URL,
                    HttpMethod.POST,
                    new HttpEntity<>(payload, headers),
                    String.class
            );
            log.info("Password reset email sent to {} — Resend status: {}", toEmail, response.getStatusCode());
        } catch (Exception e) {
            log.error("Failed to send password reset email to {}: {}", toEmail, e.getMessage());
            throw new RuntimeException("Failed to send email. Please try again later.");
        }
    }

    /**
     * Sends a registration verification OTP email.
     */
    public void sendVerificationOtpEmail(String toEmail, String otp) {
        String htmlBody = """
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 24px; background-color: #f8fafc;">
                  <div style="background: #ffffff; border-radius: 24px; border: 1px solid #e2e8f0; padding: 0; box-shadow: 0 10px 40px -10px rgba(0,0,0,0.08); overflow: hidden;">
                    
                    <!-- Beautiful Image Header -->
                    <div style="background: #f8fafc; text-align: center; padding: 40px 20px; border-bottom: 1px solid #f1f5f9;">
                        <img src="https://files.catbox.moe/uvepaf.png" alt="Verification Mail" style="width: 140px; height: auto; display: block; margin: 0 auto;" />
                        <h1 style="font-size: 24px; font-weight: 700; color: #1e293b; margin: 24px 0 0 0; letter-spacing: -0.5px;">AI Interviewer</h1>
                    </div>
                    
                    <div style="padding: 40px 32px;">
                        <h2 style="font-size: 20px; font-weight: 600; color: #1e293b; margin: 0 0 8px 0; text-align: center;">Verify your email address</h2>
                        <p style="color: #64748b; font-size: 15px; line-height: 1.6; margin: 0 0 32px 0; text-align: center;">
                          Use the verification code below to complete your registration. This code expires in <strong style="color: #1e293b;">5 minutes</strong>.
                        </p>
                        
                        <div style="text-align: center; margin: 32px 0;">
                          <div style="display: inline-block; background: #f1f5f9; border-radius: 16px; padding: 24px 48px; letter-spacing: 12px; font-size: 40px; font-weight: 800; color: #0f172a; font-family: 'Courier New', Courier, monospace; border: 2px dashed #cbd5e1;">
                            %s
                          </div>
                        </div>
                        
                        <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 32px 0 0 0; text-align: center;">
                          If you didn't request this code, you can safely ignore this email.
                        </p>
                    </div>
                  </div>
                </div>
                """.formatted(otp);

        Map<String, Object> payload = Map.of(
                "from", fromEmail,
                "to", List.of(toEmail),
                "subject", "Verify your email — AI Interviewer",
                "html", htmlBody
        );

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);

        try {
            ResponseEntity<String> response = restTemplate.exchange(
                    RESEND_API_URL,
                    HttpMethod.POST,
                    new HttpEntity<>(payload, headers),
                    String.class
            );
            log.info("Verification OTP email sent to {} — Resend status: {}", toEmail, response.getStatusCode());
        } catch (Exception e) {
            log.error("Failed to send verification OTP email to {}: {}", toEmail, e.getMessage());
            throw new RuntimeException("Failed to send verification email. Please try again later.");
        }
    }
}
