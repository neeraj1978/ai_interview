package com.suraj.backend.llm.module.model;

public record Turn(String role, String text) {
    public String getFormatted() {
        return role + ": " + text;
    }
}
