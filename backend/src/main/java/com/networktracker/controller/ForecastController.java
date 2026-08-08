package com.networktracker.controller;

import com.networktracker.dto.ApiDtos;
import com.networktracker.service.ForecastServiceClient;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Forecast controller — proxies requests to the FastAPI forecasting service.
 */
@RestController
@RequestMapping("/api/forecast")
public class ForecastController {

    private static final Logger log = LoggerFactory.getLogger(ForecastController.class);
    private final ForecastServiceClient forecastServiceClient;

    public ForecastController(ForecastServiceClient forecastServiceClient) {
        this.forecastServiceClient = forecastServiceClient;
    }

    @PostMapping("/predict")
    public ResponseEntity<ApiDtos.ForecastResponse> requestForecast(
            @Valid @RequestBody ApiDtos.ForecastRequest request) {
        log.info("Forecast request received for metric: {}", request.getMetric());
        ApiDtos.ForecastResponse response = forecastServiceClient.predict(request);
        return ResponseEntity.ok(response);
    }

    // TODO: Phase 2 — implement getTrafficHistory reading from TimescaleDB
    @GetMapping("/history")
    public ResponseEntity<ApiDtos.TrafficHistoryResponse> getTrafficHistory(
            @RequestParam String metric,
            @RequestParam String start_time,
            @RequestParam String end_time,
            @RequestParam(defaultValue = "5m") String granularity) {
        log.info("Traffic history request for metric: {}, granularity: {}", metric, granularity);
        // Placeholder — will query TimescaleDB in Phase 5 integration
        return ResponseEntity.ok(ApiDtos.TrafficHistoryResponse.builder()
                .metric(metric)
                .data(java.util.Collections.emptyList())
                .build());
    }
}
