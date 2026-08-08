package com.networktracker.controller;

import com.networktracker.dto.ApiDtos;
import com.networktracker.service.CongestionServiceClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Congestion controller — proxies requests to the FastAPI congestion service.
 */
@RestController
@RequestMapping("/api/congestion")
public class CongestionController {

    private static final Logger log = LoggerFactory.getLogger(CongestionController.class);
    private final CongestionServiceClient congestionServiceClient;

    public CongestionController(CongestionServiceClient congestionServiceClient) {
        this.congestionServiceClient = congestionServiceClient;
    }

    @GetMapping("/status")
    public ResponseEntity<ApiDtos.CongestionStatus> getCongestionStatus() {
        log.info("Congestion status request received");
        ApiDtos.CongestionStatus status = congestionServiceClient.getStatus();
        return ResponseEntity.ok(status);
    }

    @GetMapping("/alerts")
    public ResponseEntity<ApiDtos.AlertsListResponse> getRecentAlerts(
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(required = false) String severity) {
        log.info("Congestion alerts request received, limit: {}, severity: {}", limit, severity);
        ApiDtos.AlertsListResponse alerts = congestionServiceClient.getRecentAlerts(limit, severity);
        return ResponseEntity.ok(alerts);
    }
}
