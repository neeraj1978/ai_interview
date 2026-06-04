package com.suraj.user_service.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
@AllArgsConstructor
public class ProfileResponse {
    private String targetRole;
    private String preferredDomain;
    private String preferredSubdomain;
    private String inferredLevel;
    private String summary;
    private String updatedAt;
}
