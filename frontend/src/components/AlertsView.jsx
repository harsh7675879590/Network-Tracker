/**
 * NetworkTracker — Alerts View
 * Full-page congestion alerts panel with severity filtering.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAlertStore } from '../stores/alertStore';
import apiClient from '../api/client';

export default function AlertsView() {
  const [severityFilter, setSeverityFilter] = useState('all');
  const { alerts: liveAlerts, overallStatus, activeAnomalies, connectionStatus } = useAlertStore();

  // Fetch historical alerts from API
  const { data: historicalAlerts, isLoading } = useQuery({
    queryKey: ['alerts', severityFilter],
    queryFn: () => apiClient.getRecentAlerts({
      limit: 100,
      ...(severityFilter !== 'all' && { severity: severityFilter }),
    }),
    refetchInterval: 30000,
    placeholderData: { alerts: [], total: 0 },
  });

  // Merge live + historical, deduplicate by alert_id
  const allAlerts = [...liveAlerts];
  if (historicalAlerts?.alerts) {
    for (const alert of historicalAlerts.alerts) {
      if (!allAlerts.find(a => a.alert_id === alert.alert_id)) {
        allAlerts.push(alert);
      }
    }
  }

  const filteredAlerts = severityFilter === 'all'
    ? allAlerts
    : allAlerts.filter(a => a.severity === severityFilter);

  const severities = ['all', 'critical', 'high', 'medium', 'low'];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">🔔 Congestion Alerts</h1>
          <p className="page-subtitle">Real-time and historical anomaly detection</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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

      {/* Summary Cards */}
      <div className="dashboard-grid" style={{ marginBottom: 'var(--spacing-xl)' }}>
        <div className="card stat-card blue">
          <div className="stat-label">Total Alerts</div>
          <div className="stat-value">{allAlerts.length}</div>
        </div>
        <div className="card stat-card orange">
          <div className="stat-label">Active (High/Critical)</div>
          <div className="stat-value">{activeAnomalies}</div>
        </div>
        <div className="card stat-card green">
          <div className="stat-label">Network Status</div>
          <div className="stat-value" style={{ fontSize: '1.2rem' }}>{overallStatus.toUpperCase()}</div>
        </div>
        <div className="card stat-card purple">
          <div className="stat-label">Detection Method</div>
          <div className="stat-value" style={{ fontSize: '1.2rem' }}>Z-Score / IQR</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--spacing-lg)' }}>
        {severities.map((sev) => (
          <button
            key={sev}
            className={severityFilter === sev ? 'btn btn-primary' : 'btn btn-ghost'}
            onClick={() => setSeverityFilter(sev)}
            style={{ textTransform: 'capitalize' }}
          >
            {sev}
          </button>
        ))}
      </div>

      {/* Alert List */}
      <div className="card">
        <div className="alert-list" style={{ maxHeight: '600px' }}>
          {filteredAlerts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🛡️</div>
              <p>No alerts matching this filter</p>
              <p style={{ fontSize: '12px', marginTop: 4 }}>
                {connectionStatus === 'connected'
                  ? 'Monitoring for anomalies...'
                  : 'WebSocket disconnected — alerts may be delayed'}
              </p>
            </div>
          ) : (
            filteredAlerts.map((alert, idx) => (
              <div
                key={alert.alert_id || idx}
                className="alert-item"
                style={{ animation: `fadeIn 0.3s ease ${idx * 0.03}s forwards`, opacity: 0 }}
              >
                <span className={`severity-badge ${alert.severity}`}>
                  {alert.severity}
                </span>
                <div className="alert-meta">
                  <div className="alert-message">
                    {alert.message || `${alert.metric} anomaly detected from ${alert.source_ip}`}
                  </div>
                  <div className="alert-details">
                    <span>📍 {alert.source_ip}</span>
                    <span>📊 {alert.metric}</span>
                    <span>Threshold: {alert.threshold?.toFixed(2)}</span>
                    <span>Actual: {alert.actual_value?.toFixed(2)}</span>
                    {alert.detection_method && (
                      <span>Method: {alert.detection_method}</span>
                    )}
                  </div>
                </div>
                <span className="alert-time">
                  {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : '—'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
