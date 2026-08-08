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

// ── Generate demo data per metric ──
function generateMetricData(metric) {
  const data = [];
  const now = new Date();
  const bases = { bandwidth: 500, packets: 10000, latency: 25, connections: 200 };
  const base = bases[metric] || 100;

  for (let i = -24; i < 24; i++) {
    const time = new Date(now.getTime() + i * 3600000);
    const hour = time.getHours();
    const diurnal = 1 + 0.5 * Math.sin(Math.PI * (hour - 6) / 12);
    const actual = base * diurnal + (Math.random() - 0.5) * base * 0.15;
    const predicted = base * diurnal + (Math.random() - 0.5) * base * 0.1 + base * 0.03;
    const std = base * 0.15;

    data.push({
      time: `${time.getMonth() + 1}/${time.getDate()} ${hour}:00`,
      actual: i < 0 ? Math.round(actual) : null,
      predicted: i >= 0 ? Math.round(predicted) : null,
      lower: i >= 0 ? Math.round(predicted - 2 * std) : null,
      upper: i >= 0 ? Math.round(predicted + 2 * std) : null,
      isPrediction: i >= 0,
    });
  }
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
  const chartData = generateMetricData(metric);
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
                <div className="stat-value" style={{ fontSize: '1.2rem' }}>{m.unit}</div>
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
