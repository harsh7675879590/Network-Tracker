package com.networktracker.service;

import com.networktracker.dto.ApiDtos;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.retry.RetryRegistry;
import io.github.resilience4j.retry.Retry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.Collections;
import java.util.Map;
import java.util.Objects;
import java.util.function.Supplier;

/**
 * Client for the FastAPI RAG Chatbot Service.
 * Wraps every call with Resilience4j circuit breaker and retry.
 */
@Service
public class RagServiceClient {

    private static final Logger log = LoggerFactory.getLogger(RagServiceClient.class);
    private static final String SERVICE_NAME = "rag-service";

    private final WebClient webClient;
    private final CircuitBreaker circuitBreaker;
    private final Retry retry;

    public RagServiceClient(
            @Qualifier("ragWebClient") WebClient webClient,
            CircuitBreakerRegistry circuitBreakerRegistry,
            RetryRegistry retryRegistry) {
        this.webClient = webClient;
        this.circuitBreaker = circuitBreakerRegistry.circuitBreaker(SERVICE_NAME);
        this.retry = retryRegistry.retry(SERVICE_NAME);
    }

    /**
     * Sends a natural-language query to the RAG service.
     * Falls back to a degraded response if the service is unavailable.
     */
    public ApiDtos.ChatResponse query(ApiDtos.ChatRequest request) {
        Supplier<ApiDtos.ChatResponse> supplier = CircuitBreaker.decorateSupplier(circuitBreaker, () ->
            webClient.post()
                .uri("/query")
                .bodyValue(Objects.requireNonNull(Map.of(
                    "question", request.getQuestion(),
                    "context_filters", request.getContextFilters() != null ? request.getContextFilters() : Map.of()
                )))
                .retrieve()
                .bodyToMono(ApiDtos.ChatResponse.class)
                .block()
        );

        supplier = Retry.decorateSupplier(retry, supplier);

        try {
            return supplier.get();
        } catch (Exception e) {
            log.error("RAG service call failed, returning fallback response", e);
            return fallbackResponse(request, e);
        }
    }

    private ApiDtos.ChatResponse fallbackResponse(ApiDtos.ChatRequest request, Exception e) {
        return ApiDtos.ChatResponse.builder()
                .answer("I'm sorry, the AI assistant is temporarily unavailable. Please try again in a moment.")
                .sources(Collections.emptyList())
                .confidence(0.0)
                .build();
    }
}
