package com.suraj.user_service.service;

import com.suraj.user_service.dto.ProfileResponse;
import com.suraj.user_service.dto.ProfileUpsertRequest;
import com.suraj.user_service.entity.User;
import com.suraj.user_service.entity.UserProfile;
import com.suraj.user_service.repository.UserProfileRepository;
import com.suraj.user_service.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProfileService {

    private final UserProfileRepository userProfileRepository;
    private final UserRepository userRepository;

    public ProfileService(UserProfileRepository userProfileRepository,
                          UserRepository userRepository) {
        this.userProfileRepository = userProfileRepository;
        this.userRepository = userRepository;
    }

    public ProfileResponse getProfile(Long userId) {
        return userProfileRepository.findByUserId(userId)
                .map(this::toResponse)
                .orElse(null);
    }

    @Transactional
    public ProfileResponse upsertProfile(Long userId, ProfileUpsertRequest request) {
        UserProfile profile = userProfileRepository.findByUserId(userId)
                .orElseGet(() -> {
                    User user = userRepository.findById(userId)
                            .orElseThrow(() -> new RuntimeException("User not found"));
                    return UserProfile.builder().user(user).build();
                });

        profile.setTargetRole(request.getTargetRole());
        profile.setPreferredDomain(request.getPreferredDomain());
        profile.setPreferredSubdomain(request.getPreferredSubdomain());
        profile.setInferredLevel(request.getInferredLevel());
        profile.setSummary(request.getSummary());

        userProfileRepository.save(profile);
        return toResponse(profile);
    }

    private ProfileResponse toResponse(UserProfile profile) {
        return ProfileResponse.builder()
                .targetRole(profile.getTargetRole())
                .preferredDomain(profile.getPreferredDomain())
                .preferredSubdomain(profile.getPreferredSubdomain())
                .inferredLevel(profile.getInferredLevel())
                .summary(profile.getSummary())
                .updatedAt(profile.getUpdatedAt() != null ? profile.getUpdatedAt().toString() : null)
                .build();
    }
}
