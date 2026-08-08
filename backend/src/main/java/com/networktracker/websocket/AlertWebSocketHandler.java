package com.networktracker.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.networktracker.dto.ApiDtos;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

/**
 * Kafka consumer that listens to the 'network.congestion.alerts' topic
 * and pushes received congestion alerts to all WebSocket-connected clients
 * via STOMP /topic/alerts.
 *
 * This replaces polling as the mechanism for real-time alerts:
 *   Congestion Service → Kafka → this consumer → WebSocket → React frontend
 */
@Component
public class AlertWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(AlertWebSocketHandler.class);

    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;

    public AlertWebSocketHandler(SimpMessagingTemplate messagingTemplate, ObjectMapper objectMapper) {
        this.messagingTemplate = messagingTemplate;
        this.objectMapper = objectMapper;
    }

    /**
     * Consumes congestion alert events from Kafka and broadcasts them
     * to all WebSocket subscribers on /topic/alerts.
     */
    @KafkaListener(
            topics = "${networktracker.kafka.alerts-topic:network.congestion.alerts}",
            groupId = "networktracker-websocket-relay"
    )
    public void handleCongestionAlert(String alertJson) {
        try {
            log.info("Received congestion alert from Kafka: {}", alertJson);

            // Parse and validate the alert
            ApiDtos.CongestionAlert alert = objectMapper.readValue(alertJson, ApiDtos.CongestionAlert.class);

            // Broadcast to all connected WebSocket clients
            messagingTemplate.convertAndSend("/topic/alerts", alert);

            log.info("Pushed congestion alert {} to WebSocket clients (severity: {})",
                    alert.getAlertId(), alert.getSeverity());

        } catch (Exception e) {
            log.error("Failed to process congestion alert from Kafka", e);
        }
    }
}
