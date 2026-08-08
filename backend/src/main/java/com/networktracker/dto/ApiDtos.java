package com.networktracker.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * DTOs matching the gateway-api.yaml OpenAPI contract.
 */
public class ApiDtos {

    // ── Auth ──

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UserInfo {
        @JsonProperty("user_id")
        private String userId;
        private String username;
        private String email;
        private List<String> roles;
    }

    // ── Forecast ──

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ForecastRequest {
        private String metric;
        @JsonProperty("time_range")
        private TimeRange timeRange;
        private String granularity;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TimeRange {
        private OffsetDateTime start;
        private OffsetDateTime end;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ForecastResponse {
        private List<PredictionPoint> predictions;
        private ForecastMetadata metadata;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PredictionPoint {
        private OffsetDateTime timestamp;
        private Double value;
        @JsonProperty("lower_bound")
        private Double lowerBound;
        @JsonProperty("upper_bound")
        private Double upperBound;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ForecastMetadata {
        @JsonProperty("model_version")
        private String modelVersion;
        private String metric;
        @JsonProperty("confidence_interval")
        private Double confidenceInterval;
        @JsonProperty("generated_at")
        private OffsetDateTime generatedAt;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TrafficHistoryResponse {
        private String metric;
        private List<DataPoint> data;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DataPoint {
        private OffsetDateTime timestamp;
        private Double value;
    }

    // ── Congestion ──

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CongestionStatus {
        @JsonProperty("overall_status")
        private String overallStatus;
        @JsonProperty("active_anomalies")
        private Integer activeAnomalies;
        @JsonProperty("last_updated")
        private OffsetDateTime lastUpdated;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CongestionAlert {
        @JsonProperty("alert_id")
        private String alertId;
        private String severity;
        @JsonProperty("source_ip")
        private String sourceIp;
        private String metric;
        private Double threshold;
        @JsonProperty("actual_value")
        private Double actualValue;
        private OffsetDateTime timestamp;
        private String message;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AlertsListResponse {
        private List<CongestionAlert> alerts;
        private Integer total;
    }

    // ── Chat ──

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ChatRequest {
        private String question;
        @JsonProperty("context_filters")
        private Map<String, Object> contextFilters;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ChatResponse {
        private String answer;
        private List<SourceCitation> sources;
        private Double confidence;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SourceCitation {
        @JsonProperty("log_reference")
        private String logReference;
        @JsonProperty("content_snippet")
        private String contentSnippet;
        @JsonProperty("relevance_score")
        private Double relevanceScore;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ChatHistoryResponse {
        private List<ChatMessage> messages;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ChatMessage {
        private String role;
        private String content;
        private OffsetDateTime timestamp;
        private List<SourceCitation> sources;
    }

    // ── Errors ──

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ErrorResponse {
        private String error;
        private String message;
        private OffsetDateTime timestamp;
        private Map<String, Object> details;
    }
}
