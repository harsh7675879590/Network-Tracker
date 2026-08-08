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
import java.util.Map;
import java.util.function.Supplier;

/**
 * Client for the FastAPI Forecasting Service.
 * Wraps every call with Resilience4j circuit breaker and retry.
 */
@Service
public class ForecastServiceClient {

    private static final Logger log = LoggerFactory.getLogger(ForecastServiceClient.class);
    private static final String SERVICE_NAME = "forecast-service";

    private final WebClient webClient;
    private final CircuitBreaker circuitBreaker;
    private final Retry retry;

    public ForecastServiceClient(
            @Qualifier("forecastWebClient") WebClient webClient,
            CircuitBreakerRegistry circuitBreakerRegistry,
            RetryRegistry retryRegistry) {
        this.webClient = webClient;
        this.circuitBreaker = circuitBreakerRegistry.circuitBreaker(SERVICE_NAME);
        this.retry = retryRegistry.retry(SERVICE_NAME);
    }

    /**
     * Requests a traffic forecast from the forecasting service.
     * Falls back to an empty prediction set if the service is unavailable.
     */
    public ApiDtos.ForecastResponse predict(ApiDtos.ForecastRequest request) {
        Supplier<ApiDtos.ForecastResponse> supplier = CircuitBreaker.decorateSupplier(circuitBreaker, () ->
            webClient.post()
                .uri("/predict")
                .bodyValue(request)
                .retrieve()
                .bodyToMono(ApiDtos.ForecastResponse.class)
                .block()
        );

        supplier = Retry.decorateSupplier(retry, supplier);

        try {
            return supplier.get();
        } catch (Exception e) {
            log.error("Forecast service call failed, returning fallback response", e);
            return fallbackResponse(request, e);
        }
    }

    private ApiDtos.ForecastResponse fallbackResponse(ApiDtos.ForecastRequest request, Exception e) {
        return ApiDtos.ForecastResponse.builder()
                .predictions(Collections.emptyList())
                .metadata(ApiDtos.ForecastMetadata.builder()
                        .modelVersion("fallback")
                        .metric(request.getMetric())
                        .confidenceInterval(0.0)
                        .generatedAt(OffsetDateTime.now())
                        .build())
                .build();
    }
}
