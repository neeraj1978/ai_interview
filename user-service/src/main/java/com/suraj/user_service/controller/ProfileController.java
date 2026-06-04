package com.suraj.user_service.controller;

import com.suraj.user_service.dto.ProfileResponse;
import com.suraj.user_service.dto.ProfileUpsertRequest;
import com.suraj.user_service.entity.User;
import com.suraj.user_service.service.ProfileService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/profile")
public class ProfileController {

    private final ProfileService profileService;

    public ProfileController(ProfileService profileService) {
        this.profileService = profileService;
    }

    @GetMapping("/me")
    public ResponseEntity<ProfileResponse> getProfile(@AuthenticationPrincipal User user) {
        ProfileResponse profile = profileService.getProfile(user.getId());
        if (profile == null) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.ok(profile);
    }

    @PutMapping("/me")
    public ResponseEntity<ProfileResponse> upsertProfile(@AuthenticationPrincipal User user,
                                                          @RequestBody ProfileUpsertRequest request) {
        ProfileResponse profile = profileService.upsertProfile(user.getId(), request);
        return ResponseEntity.ok(profile);
    }
}
