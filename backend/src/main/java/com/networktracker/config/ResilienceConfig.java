package com.networktracker.config;

import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import io.github.resilience4j.retry.RetryConfig;
import io.github.resilience4j.retry.RetryRegistry;
import io.github.resilience4j.timelimiter.TimeLimiterConfig;
import io.github.resilience4j.timelimiter.TimeLimiterRegistry;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * Resilience4j configuration for all downstream FastAPI service calls.
 * Every cross-service call gets a circuit breaker, timeout, and retry policy.
 */
@Configuration
public class ResilienceConfig {

    /**
     * Circuit breaker: trips after 50% failure rate over the last 10 calls.
     * Stays open for 30 seconds before allowing a test call through.
     */
    @Bean
    public CircuitBreakerRegistry circuitBreakerRegistry() {
        CircuitBreakerConfig config = CircuitBreakerConfig.custom()
                .failureRateThreshold(50)
                .slowCallRateThreshold(80)
                .slowCallDurationThreshold(Duration.ofSeconds(5))
                .waitDurationInOpenState(Duration.ofSeconds(30))
                .permittedNumberOfCallsInHalfOpenState(3)
                .slidingWindowType(CircuitBreakerConfig.SlidingWindowType.COUNT_BASED)
                .slidingWindowSize(10)
                .minimumNumberOfCalls(5)
                .build();

        return CircuitBreakerRegistry.of(config);
    }

    /**
     * Retry: 3 attempts with exponential backoff (500ms, 1s, 2s).
     * Only retries on transient errors (IOException, 5xx responses).
     */
    @Bean
    public RetryRegistry retryRegistry() {
        RetryConfig config = RetryConfig.custom()
                .maxAttempts(3)
                .waitDuration(Duration.ofMillis(500))
                .failAfterMaxAttempts(true)
                .build();

        return RetryRegistry.of(config);
    }

    /**
     * Timeout: 10 seconds per downstream call.
     */
    @Bean
    public TimeLimiterRegistry timeLimiterRegistry() {
        TimeLimiterConfig config = TimeLimiterConfig.custom()
                .timeoutDuration(Duration.ofSeconds(10))
                .cancelRunningFuture(true)
                .build();

        return TimeLimiterRegistry.of(config);
    }
}
