package com.suraj.user_service.service;

import com.suraj.user_service.dto.*;
import com.suraj.user_service.entity.EmailVerificationOtp;
import com.suraj.user_service.entity.PasswordResetToken;
import com.suraj.user_service.entity.User;
import com.suraj.user_service.exception.DuplicateEmailException;
import com.suraj.user_service.exception.ResourceNotFoundException;
import com.suraj.user_service.repository.EmailVerificationOtpRepository;
import com.suraj.user_service.repository.PasswordResetTokenRepository;
import com.suraj.user_service.repository.UserProfileRepository;
import com.suraj.user_service.repository.UserRepository;
import com.suraj.user_service.security.JwtService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;
    private final PasswordResetTokenRepository resetTokenRepository;
    private final EmailService emailService;
    private final EmailVerificationOtpRepository otpRepository;
    private final UserProfileRepository userProfileRepository;

    public AuthService(UserRepository userRepository,
                       PasswordEncoder passwordEncoder,
                       JwtService jwtService,
                       AuthenticationManager authenticationManager,
                       PasswordResetTokenRepository resetTokenRepository,
                       EmailService emailService,
                       EmailVerificationOtpRepository otpRepository,
                       UserProfileRepository userProfileRepository) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.authenticationManager = authenticationManager;
        this.resetTokenRepository = resetTokenRepository;
        this.emailService = emailService;
        this.otpRepository = otpRepository;
        this.userProfileRepository = userProfileRepository;
    }

    // ── Email OTP Verification ──

    /**
     * Sends a 6-digit OTP to the given email for registration verification.
     * Throws DuplicateEmailException if the email is already registered.
     */
    @Transactional
    public void sendRegistrationOtp(String email) {
        String normalizedEmail = email.toLowerCase().trim();
        if (userRepository.existsByEmail(normalizedEmail)) {
            throw new DuplicateEmailException(normalizedEmail);
        }

        // Delete any existing OTPs for this email
        otpRepository.deleteByEmail(normalizedEmail);

        // Generate a random 6-digit OTP
        SecureRandom random = new SecureRandom();
        String otp = String.valueOf(100000 + random.nextInt(900000));

        // Save to DB with 5-minute expiry
        EmailVerificationOtp entity = EmailVerificationOtp.builder()
                .email(normalizedEmail)
                .otp(otp)
                .expiresAt(Instant.now().plusSeconds(5 * 60))
                .used(false)
                .build();
        otpRepository.save(entity);

        log.info("Registration OTP generated for: {}", normalizedEmail);

        // Send OTP via email
        emailService.sendVerificationOtpEmail(normalizedEmail, otp);
    }

    /**
     * Registers a new user. Validates email uniqueness, verifies the OTP,
     * hashes the password, persists the user, and returns a JWT.
     */
    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String normalizedEmail = request.getEmail().toLowerCase().trim();

        if (userRepository.existsByEmail(normalizedEmail)) {
            throw new DuplicateEmailException(normalizedEmail);
        }

        // Verify the OTP
        EmailVerificationOtp otpEntity = otpRepository.findByEmailAndOtp(normalizedEmail, request.getOtp())
                .orElseThrow(() -> new RuntimeException("Invalid OTP. Please check and try again."));

        if (!otpEntity.isValid()) {
            throw new RuntimeException("OTP has expired. Please request a new one.");
        }

        // Mark OTP as used
        otpEntity.setUsed(true);
        otpRepository.save(otpEntity);

        User user = User.builder()
                .email(normalizedEmail)
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .fullName(request.getFullName().trim())
                .build();

        userRepository.save(user);
        log.info("User registered: {}", user.getEmail());

        String token = jwtService.generateToken(user);
        return AuthResponse.builder()
                .token(token)
                .email(user.getEmail())
                .fullName(user.getFullName())
                .profileComplete(false)
                .build();
    }

    /**
     * Authenticates a user with email/password and returns a JWT.
     */
    public AuthResponse login(LoginRequest request) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                        request.getEmail().toLowerCase().trim(),
                        request.getPassword()
                )
        );

        User user = userRepository.findByEmail(request.getEmail().toLowerCase().trim())
                .orElseThrow(); // Should not happen after successful auth

        log.info("User logged in: {}", user.getEmail());

        String token = jwtService.generateToken(user);
        boolean hasProfile = userProfileRepository.existsByUserId(user.getId());
        return AuthResponse.builder()
                .token(token)
                .email(user.getEmail())
                .fullName(user.getFullName())
                .profileComplete(hasProfile)
                .build();
    }

    // ── Password Reset ──

    /**
     * Generates a password reset token and sends a reset email.
     * Always returns success to prevent email enumeration attacks.
     */
    @Transactional
    public void forgotPassword(ForgotPasswordRequest request) {
        String email = request.getEmail().toLowerCase().trim();
        userRepository.findByEmail(email).ifPresent(user -> {
            // Invalidate any existing unused tokens for this user
            resetTokenRepository.deleteByUserIdAndUsedFalse(user.getId());

            // Create a new token (valid for 15 minutes)
            PasswordResetToken resetToken = PasswordResetToken.create(user, 15);
            resetTokenRepository.save(resetToken);

            log.info("Password reset token generated for: {}", email);

            // Send email via Resend
            emailService.sendPasswordResetEmail(email, user.getFullName(), resetToken.getToken());
        });
        // Silently succeed even if user not found (security best practice)
    }

    /**
     * Validates a reset token. Returns true if valid, throws if not.
     */
    public boolean verifyResetToken(String token) {
        PasswordResetToken resetToken = resetTokenRepository.findByToken(token)
                .orElseThrow(() -> new ResourceNotFoundException("Invalid or expired reset link."));

        if (!resetToken.isValid()) {
            throw new ResourceNotFoundException("This reset link has expired or has already been used.");
        }

        return true;
    }

    /**
     * Resets the user's password using a valid token.
     */
    @Transactional
    public void resetPassword(ResetPasswordRequest request) {
        PasswordResetToken resetToken = resetTokenRepository.findByToken(request.getToken())
                .orElseThrow(() -> new ResourceNotFoundException("Invalid or expired reset link."));

        if (!resetToken.isValid()) {
            throw new ResourceNotFoundException("This reset link has expired or has already been used.");
        }

        User user = resetToken.getUser();
        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);

        // Mark token as used
        resetToken.setUsed(true);
        resetTokenRepository.save(resetToken);

        log.info("Password reset completed for: {}", user.getEmail());
    }
}
