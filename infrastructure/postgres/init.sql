-- ============================================================================
-- NetworkTracker — PostgreSQL Init Script
-- Relational data: user preferences, application metadata, chat history
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────────
-- User Preferences
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_preferences (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    keycloak_user_id VARCHAR(255) NOT NULL UNIQUE,
    username        VARCHAR(255) NOT NULL,
    email           VARCHAR(255),
    dashboard_config JSONB DEFAULT '{}',
    notification_settings JSONB DEFAULT '{
        "congestion_alerts": true,
        "severity_threshold": "medium",
        "email_notifications": false
    }',
    theme           VARCHAR(50) DEFAULT 'dark',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_user_preferences_keycloak_id ON user_preferences(keycloak_user_id);

-- ──────────────────────────────────────────────
-- Chat History
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    keycloak_user_id VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT NOT NULL,
    sources         JSONB DEFAULT '[]',
    confidence      FLOAT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_user ON chat_messages(keycloak_user_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at DESC);

-- ──────────────────────────────────────────────
-- Congestion Alert History (denormalized for fast reads)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS congestion_alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_id        VARCHAR(255) NOT NULL UNIQUE,
    severity        VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    source_ip       VARCHAR(45) NOT NULL,
    metric          VARCHAR(50) NOT NULL,
    threshold       DOUBLE PRECISION NOT NULL,
    actual_value    DOUBLE PRECISION NOT NULL,
    message         TEXT,
    detection_method VARCHAR(50),
    acknowledged    BOOLEAN DEFAULT FALSE,
    acknowledged_by VARCHAR(255),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_congestion_alerts_severity ON congestion_alerts(severity);
CREATE INDEX idx_congestion_alerts_created ON congestion_alerts(created_at DESC);
CREATE INDEX idx_congestion_alerts_source_ip ON congestion_alerts(source_ip);

-- ──────────────────────────────────────────────
-- Application Metadata
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_metadata (
    key             VARCHAR(255) PRIMARY KEY,
    value           JSONB NOT NULL,
    description     TEXT,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed initial metadata
INSERT INTO app_metadata (key, value, description) VALUES
    ('system_version', '"1.0.0"', 'Current system version'),
    ('monitored_metrics', '["bandwidth", "packets", "latency", "connections"]', 'List of metrics the system monitors'),
    ('default_forecast_granularity', '"5m"', 'Default granularity for forecast requests')
ON CONFLICT (key) DO NOTHING;

-- ──────────────────────────────────────────────
-- Auto-update updated_at trigger
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_preferences_updated_at
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_app_metadata_updated_at
    BEFORE UPDATE ON app_metadata
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
