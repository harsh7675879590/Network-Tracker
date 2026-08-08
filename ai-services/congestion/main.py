"""
NetworkTracker — Congestion Detection Service

FastAPI-based congestion detection service. Consumes real-time traffic data
from Kafka, analyzes for anomalies using statistical methods, and publishes
congestion alert events to the message broker.

v1: Z-score / IQR-based anomaly detection (statistical thresholding).
v2: Upgrade to a trained anomaly-detection model.
"""

import json
import logging
import threading
import time
import uuid
from collections import deque
from datetime import datetime, timezone
from typing import Any, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings

# ── Configuration ──────────────────────────────────────────────

class Settings(BaseSettings):
    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_traffic_topic: str = "network.traffic.raw"
    kafka_alerts_topic: str = "network.congestion.alerts"
    kafka_consumer_group: str = "congestion-detector"
    z_score_threshold: float = 3.0
    iqr_multiplier: float = 1.5
    window_size: int = 100
    severity_low: float = 2.0
    severity_medium: float = 3.0
    severity_high: float = 4.0
    severity_critical: float = 5.0
    otel_exporter_otlp_endpoint: str = "http://localhost:4317"
    log_level: str = "INFO"

    class Config:
        env_prefix = "CONGESTION_"


settings = Settings()

# ── Logging ────────────────────────────────────────────────────

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format='{"timestamp":"%(asctime)s","level":"%(levelname)s","service":"congestion-service","message":"%(message)s"}',
)
logger = logging.getLogger("congestion-service")

# ── Pydantic Models (matching congestion-service.yaml) ────────

class TrafficDataPoint(BaseModel):
    timestamp: str
    metric: str
    value: float
    source_ip: str


class AnalyzeRequest(BaseModel):
    data_points: list[TrafficDataPoint]


class CongestionAlert(BaseModel):
    alert_id: str
    severity: str
    source_ip: str
    metric: str
    threshold: float
    actual_value: float
    timestamp: str
    message: Optional[str] = None
    detection_method: Optional[str] = None


class AnalyzeResponse(BaseModel):
    anomalies: list[CongestionAlert]
    data_points_analyzed: int
    anomaly_count: int
    processing_time_ms: Optional[int] = None


class CongestionStatus(BaseModel):
    overall_status: str
    active_anomalies: int
    metrics_monitored: Optional[list[str]] = None
    last_updated: str
    kafka_consumer_lag: Optional[int] = None


class AlertsListResponse(BaseModel):
    alerts: list[CongestionAlert]
    total: int


class DetectionConfig(BaseModel):
    z_score_threshold: Optional[float] = None
    iqr_multiplier: Optional[float] = None
    window_size: Optional[int] = None
    severity_thresholds: Optional[dict[str, float]] = None
    enabled_metrics: Optional[list[str]] = None


class HealthResponse(BaseModel):
    status: str
    kafka_connected: bool
    consumer_active: bool
    alerts_published: int
    version: str


# ── Anomaly Detection Engine ──────────────────────────────────

class AnomalyDetector:
    """
    v1: Statistical anomaly detection using z-score and IQR methods.
    Maintains a sliding window per metric for baseline computation.
    """

    def __init__(self):
        # Sliding windows per metric
        self.windows: dict[str, deque] = {}
        self.window_size = settings.window_size
        self.recent_alerts: deque = deque(maxlen=200)
        self.total_alerts_published = 0
        self.active_anomaly_count = 0
        self.last_updated = datetime.now(timezone.utc).isoformat()

    def add_data_point(self, metric: str, value: float):
        """Add a data point to the sliding window for the given metric."""
        if metric not in self.windows:
            self.windows[metric] = deque(maxlen=self.window_size)
        self.windows[metric].append(value)

    def detect_zscore(self, metric: str, value: float) -> Optional[dict]:
        """Z-score based anomaly detection."""
        window = self.windows.get(metric)
        if not window or len(window) < 5:
            return None

        arr = np.array(window)
        mean = np.mean(arr)
        std = np.std(arr)

        if std == 0:
            return None

        z_score = abs((value - mean) / std)

        if z_score >= settings.severity_low:
            severity = self._classify_severity(z_score)
            return {
                "severity": severity,
                "threshold": round(float(mean + settings.z_score_threshold * std), 4),
                "z_score": round(float(z_score), 4),
                "detection_method": "z_score",
            }
        return None

    def detect_iqr(self, metric: str, value: float) -> Optional[dict]:
        """IQR-based outlier detection."""
        window = self.windows.get(metric)
        if not window or len(window) < 10:
            return None

        arr = np.array(window)
        q1 = np.percentile(arr, 25)
        q3 = np.percentile(arr, 75)
        iqr = q3 - q1

        if iqr == 0:
            return None

        lower = q1 - settings.iqr_multiplier * iqr
        upper = q3 + settings.iqr_multiplier * iqr

        if value < lower or value > upper:
            deviation = abs(value - np.median(arr)) / iqr
            severity = self._classify_severity(deviation)
            return {
                "severity": severity,
                "threshold": round(float(upper if value > upper else lower), 4),
                "iqr_deviation": round(float(deviation), 4),
                "detection_method": "iqr",
            }
        return None

    def analyze(self, data_point: TrafficDataPoint) -> Optional[CongestionAlert]:
        """Run all detection methods on a data point."""
        self.add_data_point(data_point.metric, data_point.value)
        self.last_updated = datetime.now(timezone.utc).isoformat()

        # Try z-score first, then IQR
        result = self.detect_zscore(data_point.metric, data_point.value)
        if result is None:
            result = self.detect_iqr(data_point.metric, data_point.value)

        if result is None:
            return None

        alert = CongestionAlert(
            alert_id=str(uuid.uuid4()),
            severity=result["severity"],
            source_ip=data_point.source_ip,
            metric=data_point.metric,
            threshold=result["threshold"],
            actual_value=round(data_point.value, 4),
            timestamp=data_point.timestamp or datetime.now(timezone.utc).isoformat(),
            message=f"Anomaly detected on {data_point.metric} from {data_point.source_ip}: "
                    f"value {data_point.value:.2f} exceeds threshold {result['threshold']:.2f} "
                    f"(severity: {result['severity']})",
            detection_method=result["detection_method"],
        )

        self.recent_alerts.append(alert)
        self.total_alerts_published += 1
        self.active_anomaly_count = sum(
            1 for a in self.recent_alerts
            if a.severity in ("high", "critical")
        )

        return alert

    def _classify_severity(self, score: float) -> str:
        if score >= settings.severity_critical:
            return "critical"
        elif score >= settings.severity_high:
            return "high"
        elif score >= settings.severity_medium:
            return "medium"
        else:
            return "low"

    def get_overall_status(self) -> str:
        if self.active_anomaly_count == 0:
            return "normal"
        elif self.active_anomaly_count <= 2:
            return "elevated"
        elif self.active_anomaly_count <= 5:
            return "congested"
        else:
            return "critical"


# ── Global detector instance ──────────────────────────────────

detector = AnomalyDetector()

# ── Kafka Consumer (background thread) ────────────────────────

kafka_connected = False
consumer_active = False


def kafka_consumer_thread():
    """Background thread consuming from Kafka and running anomaly detection."""
    global kafka_connected, consumer_active

    try:
        from confluent_kafka import Consumer, Producer, KafkaError

        consumer_conf = {
            "bootstrap.servers": settings.kafka_bootstrap_servers,
            "group.id": settings.kafka_consumer_group,
            "auto.offset.reset": "latest",
        }
        producer_conf = {
            "bootstrap.servers": settings.kafka_bootstrap_servers,
        }

        consumer = Consumer(consumer_conf)
        producer = Producer(producer_conf)
        consumer.subscribe([settings.kafka_traffic_topic])

        kafka_connected = True
        consumer_active = True
        logger.info(f"Kafka consumer started, subscribed to {settings.kafka_traffic_topic}")

        while True:
            msg = consumer.poll(timeout=1.0)
            if msg is None:
                continue
            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    continue
                logger.error(f"Kafka error: {msg.error()}")
                continue

            try:
                data = json.loads(msg.value().decode("utf-8"))
                data_point = TrafficDataPoint(**data)

                alert = detector.analyze(data_point)
                if alert:
                    # Publish alert to the alerts topic
                    alert_json = alert.model_dump_json()
                    producer.produce(
                        settings.kafka_alerts_topic,
                        value=alert_json.encode("utf-8"),
                        key=alert.alert_id.encode("utf-8"),
                    )
                    producer.flush()
                    logger.info(f"Published alert {alert.alert_id} (severity: {alert.severity})")

            except Exception as e:
                logger.error(f"Error processing Kafka message: {e}")

    except ImportError:
        logger.warning("confluent-kafka not installed, Kafka consumer disabled")
    except Exception as e:
        logger.error(f"Kafka consumer failed: {e}")
        kafka_connected = False
        consumer_active = False


# ── FastAPI App ────────────────────────────────────────────────

app = FastAPI(
    title="NetworkTracker Congestion Detection Service",
    version="1.0.0",
    description="Real-time congestion detection using statistical anomaly detection.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """Start the Kafka consumer in a background thread."""
    thread = threading.Thread(target=kafka_consumer_thread, daemon=True)
    thread.start()
    logger.info("Kafka consumer background thread started")


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_traffic(request: AnalyzeRequest):
    """Analyze a batch of traffic data points for anomalies."""
    start_time = time.time()
    logger.info(f"Analyzing {len(request.data_points)} data points")

    anomalies = []
    for dp in request.data_points:
        alert = detector.analyze(dp)
        if alert:
            anomalies.append(alert)

    processing_time = int((time.time() - start_time) * 1000)

    return AnalyzeResponse(
        anomalies=anomalies,
        data_points_analyzed=len(request.data_points),
        anomaly_count=len(anomalies),
        processing_time_ms=processing_time,
    )


@app.get("/status", response_model=CongestionStatus)
async def get_congestion_status():
    """Get current congestion status."""
    return CongestionStatus(
        overall_status=detector.get_overall_status(),
        active_anomalies=detector.active_anomaly_count,
        metrics_monitored=list(detector.windows.keys()) or ["bandwidth", "packets", "latency", "connections"],
        last_updated=detector.last_updated,
        kafka_consumer_lag=0,
    )


@app.get("/alerts/recent", response_model=AlertsListResponse)
async def get_recent_alerts(limit: int = 50, severity: Optional[str] = None):
    """Get recent congestion alerts."""
    alerts = list(detector.recent_alerts)

    if severity:
        alerts = [a for a in alerts if a.severity == severity]

    # Most recent first
    alerts.reverse()
    alerts = alerts[:limit]

    return AlertsListResponse(
        alerts=alerts,
        total=len(alerts),
    )


@app.get("/config", response_model=DetectionConfig)
async def get_config():
    """Get current detection configuration."""
    return DetectionConfig(
        z_score_threshold=settings.z_score_threshold,
        iqr_multiplier=settings.iqr_multiplier,
        window_size=settings.window_size,
        severity_thresholds={
            "low": settings.severity_low,
            "medium": settings.severity_medium,
            "high": settings.severity_high,
            "critical": settings.severity_critical,
        },
        enabled_metrics=["bandwidth", "packets", "latency", "connections"],
    )


@app.put("/config", response_model=DetectionConfig)
async def update_config(config: DetectionConfig):
    """Update detection configuration at runtime."""
    if config.z_score_threshold is not None:
        settings.z_score_threshold = config.z_score_threshold
    if config.iqr_multiplier is not None:
        settings.iqr_multiplier = config.iqr_multiplier
    if config.window_size is not None:
        settings.window_size = config.window_size
        detector.window_size = config.window_size

    logger.info("Detection config updated")
    return await get_config()


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check including Kafka connectivity."""
    return HealthResponse(
        status="healthy" if kafka_connected else "degraded",
        kafka_connected=kafka_connected,
        consumer_active=consumer_active,
        alerts_published=detector.total_alerts_published,
        version="1.0.0",
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8102)
