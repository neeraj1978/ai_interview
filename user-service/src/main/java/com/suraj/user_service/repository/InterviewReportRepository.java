package com.suraj.user_service.repository;

import com.suraj.user_service.entity.InterviewReport;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface InterviewReportRepository extends JpaRepository<InterviewReport, Long> {

    List<InterviewReport> findByUserIdOrderByCreatedAtDesc(Long userId);

    Optional<InterviewReport> findByIdAndUserId(Long id, Long userId);

    long countByUserId(Long userId);

    boolean existsBySessionId(String sessionId);

    @Query("SELECT AVG(r.overallScore) FROM InterviewReport r WHERE r.user.id = :userId AND r.overallScore IS NOT NULL")
    Double findAverageScoreByUserId(@Param("userId") Long userId);
}
