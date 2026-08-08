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

import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.function.Supplier;

/**
 * Client for the FastAPI Congestion Detection Service.
 * Wraps every call with Resilience4j circuit breaker and retry.
 */
@Service
public class CongestionServiceClient {

    private static final Logger log = LoggerFactory.getLogger(CongestionServiceClient.class);
    private static final String SERVICE_NAME = "congestion-service";

    private final WebClient webClient;
    private final CircuitBreaker circuitBreaker;
    private final Retry retry;

    public CongestionServiceClient(
            @Qualifier("congestionWebClient") WebClient webClient,
            CircuitBreakerRegistry circuitBreakerRegistry,
            RetryRegistry retryRegistry) {
        this.webClient = webClient;
        this.circuitBreaker = circuitBreakerRegistry.circuitBreaker(SERVICE_NAME);
        this.retry = retryRegistry.retry(SERVICE_NAME);
    }

    /**
     * Gets current congestion status from the congestion service.
     */
    public ApiDtos.CongestionStatus getStatus() {
        Supplier<ApiDtos.CongestionStatus> supplier = CircuitBreaker.decorateSupplier(circuitBreaker, () ->
            webClient.get()
                .uri("/status")
                .retrieve()
                .bodyToMono(ApiDtos.CongestionStatus.class)
                .block()
        );

        supplier = Retry.decorateSupplier(retry, supplier);

        try {
            return supplier.get();
        } catch (Exception e) {
            log.error("Congestion service status call failed, returning fallback", e);
            return fallbackStatus(e);
        }
    }

    /**
     * Gets recent congestion alerts from the congestion service.
     */
    public ApiDtos.AlertsListResponse getRecentAlerts(int limit, String severity) {
        Supplier<ApiDtos.AlertsListResponse> supplier = CircuitBreaker.decorateSupplier(circuitBreaker, () -> {
            WebClient.RequestHeadersSpec<?> request = webClient.get()
                .uri(uriBuilder -> {
                    uriBuilder.path("/alerts/recent").queryParam("limit", limit);
                    if (severity != null) {
                        uriBuilder.queryParam("severity", severity);
                    }
                    return uriBuilder.build();
                });
            return request.retrieve()
                .bodyToMono(ApiDtos.AlertsListResponse.class)
                .block();
        });

        supplier = Retry.decorateSupplier(retry, supplier);

        try {
            return supplier.get();
        } catch (Exception e) {
            log.error("Congestion service alerts call failed, returning fallback", e);
            return fallbackAlerts(e);
        }
    }

    private ApiDtos.CongestionStatus fallbackStatus(Exception e) {
        return ApiDtos.CongestionStatus.builder()
                .overallStatus("unknown")
                .activeAnomalies(0)
                .lastUpdated(OffsetDateTime.now())
                .build();
    }

    private ApiDtos.AlertsListResponse fallbackAlerts(Exception e) {
        return ApiDtos.AlertsListResponse.builder()
                .alerts(Collections.emptyList())
                .total(0)
                .build();
    }
}
