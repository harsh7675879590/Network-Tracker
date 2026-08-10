/**
 * NetworkTracker — Forecast View
 * Full-page traffic forecasting with metric selection and interactive charts.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import apiClient from '../api/client';

// ── Granularity config: interval, window sizes, label format ──
const GRAN_CONFIG = {
  '1m':  { intervalMs: 60_000,       historyPts: 120, futurePts: 60,  label: (t) => `${t.getHours()}:${String(t.getMinutes()).padStart(2,'0')}` },
  '5m':  { intervalMs: 300_000,      historyPts: 72,  futurePts: 36,  label: (t) => `${t.getHours()}:${String(t.getMinutes()).padStart(2,'0')}` },
  '15m': { intervalMs: 900_000,      historyPts: 48,  futurePts: 24,  label: (t) => `${t.getHours()}:${String(t.getMinutes()).padStart(2,'0')}` },
  '1h':  { intervalMs: 3_600_000,    historyPts: 24,  futurePts: 24,  label: (t) => `${t.getMonth()+1}/${t.getDate()} ${t.getHours()}:00` },
  '1d':  { intervalMs: 86_400_000,   historyPts: 30,  futurePts: 7,   label: (t) => `${t.getMonth()+1}/${t.getDate()}` },
};

// ── Synthetic fallback: realistic diurnal data at any granularity ──
function generateSyntheticHistory(metric, granularity = '1h') {
  const bases = { bandwidth: 500, latency: 25, connections: 200, packets: 10000 };
  const base = bases[metric] || 100;
  const cfg = GRAN_CONFIG[granularity] || GRAN_CONFIG['1h'];
  const now = new Date();
  return Array.from({ length: cfg.historyPts }, (_, i) => {
    const t = new Date(now.getTime() - (cfg.historyPts - i) * cfg.intervalMs);
    const hour = t.getHours() + t.getMinutes() / 60;
    const diurnal = 1 + 0.4 * Math.sin(Math.PI * (hour - 6) / 12);
    const noise = (Math.random() - 0.5) * base * 0.12;
    return {
      time: cfg.label(t),
      fullTime: t,
      value: Math.round(Math.max(0, base * diurnal + noise)),
    };
  });
}

// ── Format history + predictions into unified chart array ──
function formatChartData(history, predictions, metric = 'bandwidth', granularity = '1h') {
  const bases = { bandwidth: 500, latency: 25, connections: 200, packets: 10000 };
  const cfg = GRAN_CONFIG[granularity] || GRAN_CONFIG['1h'];
  const now = new Date();
  const data = [];

  // Use real history if available, otherwise generate synthetic demo data
  const historyPoints =
    history?.data && history.data.length > 0
      ? history.data.map(p => ({
          time: cfg.label(new Date(p.timestamp)),
          fullTime: new Date(p.timestamp),
          value: Math.round(p.value),
        }))
      : generateSyntheticHistory(metric, granularity);

  historyPoints.forEach(p => {
    data.push({
      time: p.time,
      fullTime: p.fullTime,
      actual: p.value,
      predicted: null,
      lower: null,
      upper: null,
      isPrediction: false,
    });
  });

  if (predictions?.predictions) {
    predictions.predictions.forEach(p => {
      const t = new Date(p.timestamp);
      data.push({
        time: cfg.label(t),
        fullTime: t,
        actual: null,
        predicted: Math.round(p.value),
        lower: Math.round(p.lower_bound || 0),
        upper: Math.round(p.upper_bound || 0),
        isPrediction: true,
      });
    });
  } else {
    // Synthetic SMA predictions at the same granularity interval
    const tail = historyPoints.slice(-10).map(p => p.value);
    const ma = tail.reduce((s, v) => s + v, 0) / (tail.length || 1);
    const std = (bases[metric] || 100) * 0.15;
    for (let i = 1; i <= cfg.futurePts; i++) {
      const t = new Date(now.getTime() + i * cfg.intervalMs);
      const noise = (Math.random() - 0.5) * std * 0.2;
      const val = Math.round(Math.max(0, ma + noise));
      data.push({
        time: cfg.label(t),
        fullTime: t,
        actual: null,
        predicted: val,
        lower: Math.round(Math.max(0, val - std)),
        upper: Math.round(val + std),
        isPrediction: true,
      });
    }
  }

  data.sort((a, b) => a.fullTime - b.fullTime);
  return data;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(17, 24, 39, 0.95)',
      border: '1px solid rgba(59, 130, 246, 0.2)',
      borderRadius: '8px',
      padding: '12px 16px',
      backdropFilter: 'blur(8px)',
    }}>
      <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: 4 }}>{label}</p>
      {payload.filter(p => p.value !== null).map((p, i) => (
        <p key={i} style={{ color: p.color, fontSize: '13px', fontWeight: 600 }}>
          {p.name}: {p.value?.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

import { useMemo } from 'react';

export default function ForecastView() {
  const [metric, setMetric] = useState('bandwidth');
  const [granularity, setGranularity] = useState('1h');

  const metrics = [
    { id: 'bandwidth', label: 'Bandwidth', unit: 'Mbps', icon: '📶' },
    { id: 'packets', label: 'Packets', unit: 'p/s', icon: '📦' },
    { id: 'latency', label: 'Latency', unit: 'ms', icon: '⏱️' },
    { id: 'connections', label: 'Connections', unit: 'active', icon: '🔗' },
  ];

  const granularities = ['1m', '5m', '15m', '1h', '1d'];
  
  const now = new Date();
  const past24h = new Date(now.getTime() - 24 * 3600000);
  const future24h = new Date(now.getTime() + 24 * 3600000);

  const { data: historyResponse } = useQuery({
    queryKey: ['forecast-history', metric, granularity],
    queryFn: () => apiClient.getTrafficHistory({
      metric,
      start_time: past24h.toISOString(),
      end_time: now.toISOString(),
      granularity
    }),
    refetchInterval: 60000,
  });

  const { data: forecastResponse } = useQuery({
    queryKey: ['forecast-predict', metric, granularity],
    queryFn: () => apiClient.requestForecast({
      metric,
      time_range: {
        start: now.toISOString(),
        end: future24h.toISOString()
      },
      granularity
    }),
    refetchInterval: 60000,
  });

  const chartData = useMemo(() => {
    return formatChartData(historyResponse, forecastResponse, metric, granularity);
  }, [historyResponse, forecastResponse, metric, granularity]);

  const getAvgValue = (mId) => {
    if (metric === mId && historyResponse?.data && historyResponse.data.length > 0) {
      const sum = historyResponse.data.reduce((a, b) => a + b.value, 0);
      return Math.round(sum / historyResponse.data.length);
    }
    const bases = { bandwidth: 500, latency: 25, connections: 200, packets: 10000 };
    return bases[mId] || 0;
  };

  const currentMetric = metrics.find(m => m.id === metric);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">📈 Traffic Forecast</h1>
          <p className="page-subtitle">AI-powered network traffic predictions</p>
        </div>
        <span className="severity-badge low">Model: SMA v1</span>
      </div>

      {/* Metric Selection */}
      <div className="dashboard-grid" style={{ marginBottom: 'var(--spacing-xl)' }}>
        {metrics.map((m) => (
          <div
            key={m.id}
            className={`card stat-card ${metric === m.id ? 'blue' : ''}`}
            onClick={() => setMetric(m.id)}
            style={{
              cursor: 'pointer',
              borderColor: metric === m.id ? 'rgba(59, 130, 246, 0.3)' : undefined,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 24 }}>{m.icon}</span>
              <div>
                <div className="stat-label">{m.label}</div>
                <div className="stat-value" style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  {getAvgValue(m.id).toLocaleString()}
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>{m.unit}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Granularity Selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--spacing-lg)' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: '14px', alignSelf: 'center', marginRight: 8 }}>
          Granularity:
        </span>
        {granularities.map((g) => (
          <button
            key={g}
            className={granularity === g ? 'btn btn-primary' : 'btn btn-ghost'}
            onClick={() => setGranularity(g)}
            style={{ padding: '4px 16px' }}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Main Chart */}
      <div className="card" style={{ marginBottom: 'var(--spacing-xl)' }}>
        <div className="card-header">
          <div>
            <div className="card-title">{currentMetric.icon} {currentMetric.label} Forecast</div>
            <div className="card-subtitle">Historical (24h) + Predicted (24h) — {currentMetric.unit}</div>
          </div>
        </div>
        <div className="chart-container" style={{ height: 400 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradPred" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradConfidence" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.08} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="time" stroke="#64748b" fontSize={11} interval={3} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              {/* Confidence interval band */}
              <Area
                type="monotone" dataKey="upper" name="Upper Bound"
                stroke="none" fill="url(#gradConfidence)"
                connectNulls={false}
              />
              <Area
                type="monotone" dataKey="lower" name="Lower Bound"
                stroke="none" fill="url(#gradConfidence)"
                connectNulls={false}
              />
              {/* Actual data */}
              <Area
                type="monotone" dataKey="actual" name="Actual"
                stroke="#3b82f6" strokeWidth={2}
                fill="url(#gradActual)" connectNulls={false}
              />
              {/* Predicted data */}
              <Area
                type="monotone" dataKey="predicted" name="Predicted"
                stroke="#8b5cf6" strokeWidth={2} strokeDasharray="6 3"
                fill="url(#gradPred)" connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Model Info */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Model Information</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--spacing-lg)' }}>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: 4 }}>Active Model</div>
            <div style={{ fontWeight: 600 }}>Simple Moving Average (v1)</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: 4 }}>Next Upgrade</div>
            <div style={{ fontWeight: 600 }}>Temporal Fusion Transformer (v2)</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: 4 }}>API Contract</div>
            <div style={{ fontWeight: 600 }}>Zero-change swap — same endpoints</div>
          </div>
        </div>
      </div>
    </div>
  );
}
