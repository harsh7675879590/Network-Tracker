package com.networktracker.controller;

import com.networktracker.dto.ApiDtos;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Auth controller — returns the authenticated user's profile from JWT claims.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @GetMapping("/userinfo")
    public ResponseEntity<ApiDtos.UserInfo> getUserInfo(@AuthenticationPrincipal Jwt jwt) {
        @SuppressWarnings("unchecked")
        Map<String, Object> realmAccess = jwt.getClaimAsMap("realm_access");
        List<String> roles = List.of();
        if (realmAccess != null && realmAccess.containsKey("roles")) {
            roles = ((List<String>) realmAccess.get("roles"));
        }

        ApiDtos.UserInfo userInfo = ApiDtos.UserInfo.builder()
                .userId(jwt.getSubject())
                .username(jwt.getClaimAsString("preferred_username"))
                .email(jwt.getClaimAsString("email"))
                .roles(roles)
                .build();

        return ResponseEntity.ok(userInfo);
    }
}
