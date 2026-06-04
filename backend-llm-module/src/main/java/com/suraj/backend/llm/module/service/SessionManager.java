package com.suraj.backend.llm.module.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.suraj.backend.llm.module.model.GuidanceSession;
import com.suraj.backend.llm.module.model.InterviewSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

/**
 * Manages active {@link InterviewSession} instances.
 *
 * BUG-9 FIX: Uses a Caffeine cache with a 2-hour write-expiry TTL instead of
 * a plain ConcurrentHashMap. Sessions that are abandoned or not cleaned up
 * within 2 hours are automatically evicted, preventing an unbounded memory leak
 * under prolonged or heavy use.
 */
@Service
public class SessionManager {

    private static final Logger log = LoggerFactory.getLogger(SessionManager.class);

    private final Cache<String, InterviewSession> sessions = Caffeine.newBuilder()
            .expireAfterWrite(2, TimeUnit.HOURS)
            .removalListener((sessionId, session, cause) ->
                log.info("Session [{}] evicted from cache. Cause: {}", sessionId, cause))
            .build();

    public InterviewSession getOrCreateSession(String sessionId) {
        return sessions.get(sessionId, InterviewSession::new);
    }

    public InterviewSession getSession(String sessionId) {
        return sessions.getIfPresent(sessionId);
    }

    // ── Guidance Sessions ──

    private final Cache<String, GuidanceSession> guidanceSessions = Caffeine.newBuilder()
            .expireAfterWrite(2, TimeUnit.HOURS)
            .removalListener((sessionId, session, cause) ->
                log.info("Guidance session [{}] evicted. Cause: {}", sessionId, cause))
            .build();

    public GuidanceSession getOrCreateGuidanceSession(String sessionId) {
        return guidanceSessions.get(sessionId, GuidanceSession::new);
    }

    public GuidanceSession getGuidanceSession(String sessionId) {
        return guidanceSessions.getIfPresent(sessionId);
    }
}

