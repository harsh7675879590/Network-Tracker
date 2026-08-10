"""
NetworkTracker — Network Data Simulator

Generates synthetic network traffic data at a configurable rate and publishes
it to the Kafka topic 'network.traffic.raw'. Built so it can be swapped out
for a real data ingestion pipeline later without touching any downstream service.

The simulator produces realistic-looking traffic data with:
- Diurnal patterns (higher traffic during "business hours")
- Random noise
- Occasional anomalous spikes (for triggering congestion detection)
"""

import json
import logging
import math
import random
import time
from datetime import datetime, timezone

from pydantic_settings import BaseSettings

# ── Configuration ──────────────────────────────────────────────

class Settings(BaseSettings):
    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_topic: str = "network.traffic.raw"
    rate_per_second: int = 10
    anomaly_probability: float = 0.05  # 5% chance of anomalous data point
    log_level: str = "INFO"

    class Config:
        env_prefix = "SIMULATOR_"


settings = Settings()

# ── Logging ────────────────────────────────────────────────────

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format='{"timestamp":"%(asctime)s","level":"%(levelname)s","service":"data-simulator","message":"%(message)s"}',
)
logger = logging.getLogger("data-simulator")

# ── Synthetic Data Generation ─────────────────────────────────

METRICS = ["bandwidth", "packets", "latency", "connections"]

BASE_VALUES = {
    "bandwidth": 500.0,     # Mbps
    "packets": 10000.0,     # packets/s
    "latency": 25.0,        # ms
    "connections": 200.0,   # active connections
}

NOISE_SCALE = {
    "bandwidth": 50.0,
    "packets": 1000.0,
    "latency": 5.0,
    "connections": 30.0,
}

SOURCE_IPS = [
    "192.168.1.10",
    "192.168.1.20",
    "192.168.1.30",
    "192.168.1.40",
    "192.168.1.50",
    "10.0.0.5",
    "10.0.0.10",
    "10.0.0.15",
    "172.16.0.100",
    "172.16.0.200",
]

PROTOCOLS = ["TCP", "UDP", "HTTP", "HTTPS", "DNS"]

INTERFACES = ["eth0", "eth1", "wlan0"]


def generate_data_point() -> dict:
    """Generate a single synthetic network traffic data point."""
    now = datetime.now(timezone.utc)
    hour = now.hour

    # Diurnal pattern: higher traffic during business hours (9-17)
    diurnal_factor = 1.0 + 0.5 * math.sin(math.pi * (hour - 6) / 12) if 6 <= hour <= 18 else 0.7

    metric = random.choice(METRICS)
    base = BASE_VALUES[metric] * diurnal_factor
    noise = random.gauss(0, NOISE_SCALE[metric])
    source_ip = random.choice(SOURCE_IPS)

    # Event type & Anomaly injection
    is_anomaly = random.random() < settings.anomaly_probability
    is_reject = random.random() < 0.05
    event_type = "TRAFFIC"

    if is_anomaly:
        event_type = "ANOMALY"
        # Spike: 3-8x the base value
        multiplier = random.uniform(3.0, 8.0)
        value = base * multiplier + noise
        logger.debug(f"Injecting anomaly: {metric}={value:.2f} (multiplier: {multiplier:.1f}x)")
    elif is_reject:
        event_type = "REJECT"
        value = 0 # No traffic transferred on block
        logger.debug(f"Injecting reject event for {source_ip}")
    else:
        value = max(0, base + noise)

    return {
        "timestamp": now.isoformat(),
        "event_type": event_type,
        "metric": metric,
        "value": round(value, 4),
        "source_ip": source_ip,
        "metadata": {
            "interface": random.choice(INTERFACES),
            "protocol": random.choice(PROTOCOLS),
            "destination_ip": f"10.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}",
            "bytes_transferred": random.randint(100, 100000) if metric == "bandwidth" else None,
            "is_synthetic": True,
        },
    }


# ── Main Loop ─────────────────────────────────────────────────

def main():
    """Main loop: generate data and publish to Kafka."""
    logger.info(
        f"Starting Network Data Simulator "
        f"(rate: {settings.rate_per_second}/s, anomaly_prob: {settings.anomaly_probability})"
    )

    try:
        # pyrefly: ignore [missing-import]
        from confluent_kafka import Producer

        producer_conf = {
            "bootstrap.servers": settings.kafka_bootstrap_servers,
            "queue.buffering.max.messages": 10000,
            "queue.buffering.max.ms": 100,
        }
        producer = Producer(producer_conf)

        logger.info(f"Connected to Kafka at {settings.kafka_bootstrap_servers}")
        logger.info(f"Publishing to topic: {settings.kafka_topic}")

        total_sent = 0
        interval = 1.0 / settings.rate_per_second

        while True:
            start = time.time()

            data_point = generate_data_point()
            message = json.dumps(data_point)

            producer.produce(
                settings.kafka_topic,
                value=message.encode("utf-8"),
                key=data_point["source_ip"].encode("utf-8"),
            )

            total_sent += 1

            if total_sent % 100 == 0:
                producer.flush()
                logger.info(f"Published {total_sent} data points")

            # Maintain the target rate
            elapsed = time.time() - start
            sleep_time = max(0, interval - elapsed)
            if sleep_time > 0:
                time.sleep(sleep_time)

    except ImportError:
        logger.error("confluent-kafka not installed. Install with: pip install confluent-kafka")
        raise
    except KeyboardInterrupt:
        logger.info(f"Simulator stopped. Total data points published: {total_sent}")
        producer.flush()
    except Exception as e:
        logger.error(f"Simulator error: {e}")
        raise


if __name__ == "__main__":
    main()
