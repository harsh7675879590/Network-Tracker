/**
 * NetworkTracker — Dashboard View
 * Main dashboard with stat cards, forecast chart, live alerts, and chat preview.
 */

import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from 'recharts';
import { useAlertStore } from '../stores/alertStore';
import apiClient from '../api/client';

// ── Generate demo forecast data ──
function generateDemoForecastData() {
  const data = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const time = new Date(now.getTime() + i * 3600000);
    const hour = time.getHours();
    const diurnal = 1 + 0.5 * Math.sin(Math.PI * (hour - 6) / 12);
    const base = 500 * diurnal;
    data.push({
      time: `${hour}:00`,
      bandwidth: Math.round(base + Math.random() * 80 - 40),
      predicted: Math.round(base + (Math.random() * 60 - 30) + 20),
      lower: Math.round(base - 100),
      upper: Math.round(base + 100),
    });
  }
  return data;
}

// ── Custom chart tooltip ──
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
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, fontSize: '13px', fontWeight: 600 }}>
          {p.name}: {p.value?.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { alerts, overallStatus, activeAnomalies, connectionStatus } = useAlertStore();
  const demoData = generateDemoForecastData();

  // Fetch congestion status from API (with fallback to store state)
  const { data: congestionData } = useQuery({
    queryKey: ['congestion-status'],
    queryFn: () => apiClient.getCongestionStatus(),
    refetchInterval: 30000,
    retry: 1,
    placeholderData: {
      overall_status: overallStatus,
      active_anomalies: activeAnomalies,
    },
  });

  const stats = [
    {
      label: 'Avg Bandwidth',
      value: '542 Mbps',
      change: '+4.2%',
      positive: true,
      color: 'blue',
    },
    {
      label: 'Active Alerts',
      value: String(activeAnomalies),
      change: activeAnomalies > 0 ? `${activeAnomalies} active` : 'All clear',
      positive: activeAnomalies === 0,
      color: 'orange',
    },
    {
      label: 'Avg Latency',
      value: '24.3 ms',
      change: '-2.1%',
      positive: true,
      color: 'green',
    },
    {
      label: 'Connections',
      value: '1,247',
      change: '+12.8%',
      positive: true,
      color: 'purple',
    },
  ];

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Real-time network monitoring & AI insights</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className={`status-badge ${overallStatus}`}>
            <span className={`status-dot ${overallStatus}`}></span>
            {overallStatus}
          </span>
          <span className={`status-badge ${connectionStatus === 'connected' ? 'normal' : 'elevated'}`}>
            <span className={`status-dot ${connectionStatus === 'connected' ? 'normal' : 'elevated'}`}></span>
            {connectionStatus === 'connected' ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="dashboard-grid">
        {stats.map((stat, idx) => (
          <div key={idx} className={`card stat-card ${stat.color}`} style={{ animationDelay: `${idx * 0.1}s` }}>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value">{stat.value}</div>
            <span className={`stat-change ${stat.positive ? 'positive' : 'negative'}`}>
              {stat.positive ? '↑' : '↓'} {stat.change}
            </span>
          </div>
        ))}
      </div>

      {/* Main Chart + Alerts */}
      <div className="dashboard-main-grid">
        {/* Forecast Chart */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Traffic Forecast</div>
              <div className="card-subtitle">Bandwidth prediction — next 24 hours</div>
            </div>
            <span className="severity-badge low">SMA v1</span>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={demoData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradBandwidth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradPredicted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone" dataKey="bandwidth" name="Actual"
                  stroke="#3b82f6" strokeWidth={2}
                  fill="url(#gradBandwidth)"
                />
                <Area
                  type="monotone" dataKey="predicted" name="Predicted"
                  stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5"
                  fill="url(#gradPredicted)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Live Alerts Panel */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Live Alerts</div>
              <div className="card-subtitle">Real-time via WebSocket</div>
            </div>
            {alerts.length > 0 && (
              <span className="severity-badge critical">{alerts.length}</span>
            )}
          </div>
          <div className="alert-list">
            {alerts.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🛡️</div>
                <p>No active alerts</p>
                <p style={{ fontSize: '12px', marginTop: 4 }}>
                  Monitoring network traffic...
                </p>
              </div>
            ) : (
              alerts.slice(0, 10).map((alert, idx) => (
                <div key={alert.alert_id || idx} className="alert-item animate-slide-in" style={{ animationDelay: `${idx * 0.05}s` }}>
                  <span className={`severity-badge ${alert.severity}`}>
                    {alert.severity}
                  </span>
                  <div className="alert-meta">
                    <div className="alert-message">
                      {alert.message || `${alert.metric} anomaly from ${alert.source_ip}`}
                    </div>
                    <div className="alert-details">
                      <span>📍 {alert.source_ip}</span>
                      <span>📊 {alert.metric}</span>
                      <span>Value: {alert.actual_value?.toFixed(2)}</span>
                    </div>
                  </div>
                  <span className="alert-time">
                    {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : 'now'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom: Metrics Charts */}
      <div className="dashboard-bottom-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Latency Trend</div>
              <div className="card-subtitle">Last 24 hours</div>
            </div>
          </div>
          <div className="chart-container" style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={demoData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone" dataKey="bandwidth" name="Latency (ms)"
                  stroke="#10b981" strokeWidth={2} dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Connection Load</div>
              <div className="card-subtitle">Active connections</div>
            </div>
          </div>
          <div className="chart-container" style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={demoData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradConnections" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone" dataKey="predicted" name="Connections"
                  stroke="#f59e0b" strokeWidth={2}
                  fill="url(#gradConnections)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
