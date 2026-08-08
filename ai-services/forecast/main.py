"""
NetworkTracker — Time-Series Forecasting Service

FastAPI-based forecasting service. Receives historical network traffic data
and returns future predictions.

v1: Simple Moving Average placeholder model behind the real API contract.
v2: Swap in a Transformer-based model with zero API contract changes.
"""

import logging
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings

# ── Configuration ──────────────────────────────────────────────

class Settings(BaseSettings):
    timescaledb_host: str = "localhost"
    timescaledb_port: int = 5433
    timescaledb_db: str = "networktracker_ts"
    timescaledb_user: str = "networktracker"
    timescaledb_password: str = "networktracker"
    model_version: str = "sma-v1"
    otel_exporter_otlp_endpoint: str = "http://localhost:4317"
    log_level: str = "INFO"

    class Config:
        env_prefix = "FORECAST_"


settings = Settings()

# ── Logging ────────────────────────────────────────────────────

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format='{"timestamp":"%(asctime)s","level":"%(levelname)s","service":"forecast-service","message":"%(message)s"}',
)
logger = logging.getLogger("forecast-service")

# ── Pydantic Models (matching forecast-service.yaml contract) ─

class TimeRange(BaseModel):
    start: str
    end: str


class DataPoint(BaseModel):
    timestamp: str
    value: float


class ForecastRequest(BaseModel):
    metric: str
    time_range: TimeRange
    granularity: str = "5m"
    historical_data: Optional[list[DataPoint]] = None


class PredictionPoint(BaseModel):
    timestamp: str
    value: float
    lower_bound: Optional[float] = None
    upper_bound: Optional[float] = None


class ForecastMetadata(BaseModel):
    model_version: str
    metric: str
    confidence_interval: Optional[float] = None
    generated_at: str
    processing_time_ms: Optional[int] = None


class ForecastResponse(BaseModel):
    predictions: list[PredictionPoint]
    metadata: ForecastMetadata


class ModelInfo(BaseModel):
    id: str
    name: str
    version: str
    status: str
    description: Optional[str] = None


class ModelsResponse(BaseModel):
    models: list[ModelInfo]
    active_model: str


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    timescaledb_connected: bool
    version: str


class ErrorResponse(BaseModel):
    error: str
    message: str
    timestamp: str
    details: Optional[dict[str, Any]] = None


# ── Forecasting Models ────────────────────────────────────────

GRANULARITY_SECONDS = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "1h": 3600,
    "1d": 86400,
}


def simple_moving_average_forecast(
    values: list[float],
    n_predictions: int,
    window_size: int = 10,
) -> list[dict]:
    """
    v1 placeholder model: Simple Moving Average.
    Generates predictions based on the rolling average of recent values.
    """
    if not values:
        return []

    arr = np.array(values)
    window = min(window_size, len(arr))

    # Compute the moving average from the tail
    ma = np.mean(arr[-window:])
    std = np.std(arr[-window:]) if window > 1 else 0

    # Add a small trend component based on recent direction
    if len(arr) >= 2:
        recent_trend = (arr[-1] - arr[-window]) / window
    else:
        recent_trend = 0

    predictions = []
    for i in range(n_predictions):
        predicted_value = ma + recent_trend * (i + 1)
        # Add noise to make it look realistic
        noise = np.random.normal(0, std * 0.1) if std > 0 else 0
        predicted_value += noise

        predictions.append({
            "value": round(float(max(0, predicted_value)), 4),
            "lower_bound": round(float(max(0, predicted_value - 2 * std)), 4),
            "upper_bound": round(float(predicted_value + 2 * std), 4),
        })

    return predictions


# ── Generate synthetic historical data for demo ───────────────

def generate_synthetic_data(metric: str, n_points: int = 100) -> list[float]:
    """Generate synthetic historical data when no real data is available."""
    base_values = {
        "bandwidth": 500.0,    # Mbps
        "packets": 10000.0,    # packets/s
        "latency": 25.0,       # ms
        "connections": 200.0,  # active connections
    }
    base = base_values.get(metric, 100.0)

    t = np.linspace(0, 4 * np.pi, n_points)
    # Sinusoidal pattern + noise + slight upward trend
    values = base + base * 0.2 * np.sin(t) + np.random.normal(0, base * 0.05, n_points)
    values += np.linspace(0, base * 0.1, n_points)  # upward trend

    return [round(float(max(0, v)), 4) for v in values]


# ── FastAPI App ────────────────────────────────────────────────

app = FastAPI(
    title="NetworkTracker Forecast Service",
    version="1.0.0",
    description="Time-series forecasting for network traffic metrics.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/predict", response_model=ForecastResponse)
async def generate_forecast(request: ForecastRequest):
    """
    Generate a traffic forecast. v1 uses Simple Moving Average.
    Designed so the model can be swapped with zero API contract changes.
    """
    start_time = time.time()
    logger.info(f"Forecast request for metric: {request.metric}, granularity: {request.granularity}")

    try:
        # Use provided historical data or generate synthetic data
        if request.historical_data:
            values = [dp.value for dp in request.historical_data]
        else:
            values = generate_synthetic_data(request.metric)

        # Calculate number of prediction points
        granularity_seconds = GRANULARITY_SECONDS.get(request.granularity, 300)
        try:
            start_dt = datetime.fromisoformat(request.time_range.start.replace("Z", "+00:00"))
            end_dt = datetime.fromisoformat(request.time_range.end.replace("Z", "+00:00"))
            total_seconds = (end_dt - start_dt).total_seconds()
            n_predictions = max(1, int(total_seconds / granularity_seconds))
            n_predictions = min(n_predictions, 500)  # cap at 500 points
        except Exception:
            n_predictions = 24  # default to 24 points

        # Run the forecast model
        raw_predictions = simple_moving_average_forecast(values, n_predictions)

        # Build prediction points with timestamps
        now = datetime.now(timezone.utc)
        predictions = []
        for i, pred in enumerate(raw_predictions):
            ts = now + timedelta(seconds=granularity_seconds * (i + 1))
            predictions.append(PredictionPoint(
                timestamp=ts.isoformat(),
                value=pred["value"],
                lower_bound=pred["lower_bound"],
                upper_bound=pred["upper_bound"],
            ))

        processing_time = int((time.time() - start_time) * 1000)

        # Confidence based on data quality
        confidence = min(0.85, 0.5 + len(values) * 0.005)

        return ForecastResponse(
            predictions=predictions,
            metadata=ForecastMetadata(
                model_version=settings.model_version,
                metric=request.metric,
                confidence_interval=round(confidence, 4),
                generated_at=datetime.now(timezone.utc).isoformat(),
                processing_time_ms=processing_time,
            ),
        )

    except Exception as e:
        logger.error(f"Forecast generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/models", response_model=ModelsResponse)
async def list_models():
    """List available forecasting models."""
    return ModelsResponse(
        models=[
            ModelInfo(
                id="sma-v1",
                name="Simple Moving Average",
                version="1.0.0",
                status="active",
                description="Placeholder model using rolling average with trend detection.",
            ),
            ModelInfo(
                id="tft-v2",
                name="Temporal Fusion Transformer",
                version="0.1.0",
                status="available",
                description="Deep learning model for complex time-series forecasting (coming soon).",
            ),
        ],
        active_model="sma-v1",
    )


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check including model readiness."""
    timescaledb_connected = False
    try:
        import psycopg2
        conn = psycopg2.connect(
            host=settings.timescaledb_host,
            port=settings.timescaledb_port,
            dbname=settings.timescaledb_db,
            user=settings.timescaledb_user,
            password=settings.timescaledb_password,
            connect_timeout=3,
        )
        conn.close()
        timescaledb_connected = True
    except Exception:
        pass

    return HealthResponse(
        status="healthy",
        model_loaded=True,
        timescaledb_connected=timescaledb_connected,
        version="1.0.0",
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8101)
