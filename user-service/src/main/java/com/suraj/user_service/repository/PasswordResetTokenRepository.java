package com.suraj.user_service.repository;

import com.suraj.user_service.entity.PasswordResetToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {

    Optional<PasswordResetToken> findByToken(String token);

    /**
     * Invalidate all unused tokens for a user (cleanup when a new one is requested).
     */
    void deleteByUserIdAndUsedFalse(Long userId);
}
