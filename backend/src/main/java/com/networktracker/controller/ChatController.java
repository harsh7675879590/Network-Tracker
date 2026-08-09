package com.networktracker.controller;

import com.networktracker.dto.ApiDtos;
import com.networktracker.service.RagServiceClient;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;

/**
 * Chat controller — proxies natural-language queries to the FastAPI RAG service.
 */
@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private static final Logger log = LoggerFactory.getLogger(ChatController.class);
    private final RagServiceClient ragServiceClient;

    public ChatController(RagServiceClient ragServiceClient) {
        this.ragServiceClient = ragServiceClient;
    }

    @PostMapping("/query")
    public ResponseEntity<ApiDtos.ChatResponse> chatQuery(
            @Valid @RequestBody ApiDtos.ChatRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        String user = (jwt != null) ? jwt.getSubject() : "anonymous";
        log.info("Chat query from user {}: {}", user, request.getQuestion());
        ApiDtos.ChatResponse response = ragServiceClient.query(request);
        return ResponseEntity.ok(response);
    }

    // TODO: Implement chat history persistence in PostgreSQL
    @GetMapping("/history")
    public ResponseEntity<ApiDtos.ChatHistoryResponse> getChatHistory(
            @RequestParam(defaultValue = "20") int limit,
            @AuthenticationPrincipal Jwt jwt) {
        String user = (jwt != null) ? jwt.getSubject() : "anonymous";
        log.info("Chat history request from user {}", user);
        return ResponseEntity.ok(ApiDtos.ChatHistoryResponse.builder()
                .messages(Collections.emptyList())
                .build());
    }
}
