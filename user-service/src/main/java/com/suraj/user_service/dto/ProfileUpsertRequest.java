package com.suraj.user_service.dto;

import lombok.Data;

@Data
public class ProfileUpsertRequest {
    private String targetRole;
    private String preferredDomain;
    private String preferredSubdomain;
    private String inferredLevel;
    private String summary;
}
