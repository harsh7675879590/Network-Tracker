-- ============================================================================
-- NetworkTracker — TimescaleDB Init Script
-- Time-series network traffic data with hypertables, retention policies,
-- and continuous aggregates.
-- ============================================================================

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────────
-- Raw Network Traffic Data (Hypertable)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS network_traffic (
    time            TIMESTAMPTZ NOT NULL,
    source_ip       VARCHAR(45) NOT NULL,
    destination_ip  VARCHAR(45),
    metric          VARCHAR(50) NOT NULL,
    value           DOUBLE PRECISION NOT NULL,
    interface       VARCHAR(100),
    protocol        VARCHAR(20),
    bytes_transferred BIGINT,
    metadata        JSONB DEFAULT '{}'
);

-- Convert to hypertable (partitioned by time, 1-hour chunks)
SELECT create_hypertable(
    'network_traffic',
    'time',
    chunk_time_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_traffic_source_ip ON network_traffic (source_ip, time DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_metric ON network_traffic (metric, time DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_metric_source ON network_traffic (metric, source_ip, time DESC);

-- ──────────────────────────────────────────────
-- Continuous Aggregates — 5-minute rollups
-- ──────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS traffic_5min
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('5 minutes', time) AS bucket,
    metric,
    source_ip,
    AVG(value) AS avg_value,
    MIN(value) AS min_value,
    MAX(value) AS max_value,
    COUNT(*) AS sample_count,
    STDDEV(value) AS stddev_value
FROM network_traffic
GROUP BY bucket, metric, source_ip
WITH NO DATA;

-- Refresh policy: keep the 5min aggregate updated every 5 minutes
SELECT add_continuous_aggregate_policy('traffic_5min',
    start_offset    => INTERVAL '1 hour',
    end_offset      => INTERVAL '5 minutes',
    schedule_interval => INTERVAL '5 minutes',
    if_not_exists   => TRUE
);

-- ──────────────────────────────────────────────
-- Continuous Aggregates — 1-hour rollups
-- ──────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS traffic_1hour
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    metric,
    source_ip,
    AVG(value) AS avg_value,
    MIN(value) AS min_value,
    MAX(value) AS max_value,
    COUNT(*) AS sample_count,
    STDDEV(value) AS stddev_value
FROM network_traffic
GROUP BY bucket, metric, source_ip
WITH NO DATA;

-- Refresh policy: keep the 1hr aggregate updated every 30 minutes
SELECT add_continuous_aggregate_policy('traffic_1hour',
    start_offset    => INTERVAL '3 hours',
    end_offset      => INTERVAL '1 hour',
    schedule_interval => INTERVAL '30 minutes',
    if_not_exists   => TRUE
);

-- ──────────────────────────────────────────────
-- Continuous Aggregates — 1-day rollups
-- ──────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS traffic_1day
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    metric,
    source_ip,
    AVG(value) AS avg_value,
    MIN(value) AS min_value,
    MAX(value) AS max_value,
    COUNT(*) AS sample_count,
    STDDEV(value) AS stddev_value
FROM network_traffic
GROUP BY bucket, metric, source_ip
WITH NO DATA;

-- Refresh policy: keep the 1day aggregate updated every 6 hours
SELECT add_continuous_aggregate_policy('traffic_1day',
    start_offset    => INTERVAL '3 days',
    end_offset      => INTERVAL '1 day',
    schedule_interval => INTERVAL '6 hours',
    if_not_exists   => TRUE
);

-- ──────────────────────────────────────────────
-- Retention Policies
-- ──────────────────────────────────────────────
-- Keep raw data for 7 days
SELECT add_retention_policy('network_traffic',
    drop_after => INTERVAL '7 days',
    if_not_exists => TRUE
);

-- Keep 5-minute aggregates for 30 days
SELECT add_retention_policy('traffic_5min',
    drop_after => INTERVAL '30 days',
    if_not_exists => TRUE
);

-- Keep 1-hour aggregates for 90 days
SELECT add_retention_policy('traffic_1hour',
    drop_after => INTERVAL '90 days',
    if_not_exists => TRUE
);

-- Keep 1-day aggregates for 365 days
SELECT add_retention_policy('traffic_1day',
    drop_after => INTERVAL '365 days',
    if_not_exists => TRUE
);
