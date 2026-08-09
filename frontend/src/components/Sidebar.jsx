/**
 * Netbarriers — Sidebar Component
 */

import { useState } from 'react';

export default function Sidebar({ activeView, onViewChange }) {
  return (
    <aside className="sidebar">
      <div className="logo" style={{ display: 'flex', alignItems: 'center', margin: '-10px 0' }}>
        <img src="/logo-wide.svg" alt="Netbarriers Logo" className="logo-icon" style={{ width: '100%', height: 'auto', borderRadius: 0, background: 'transparent', boxShadow: 'none' }} />
      </div>

      <nav>
        <div className="nav-section">
          <div className="nav-section-title">Overview</div>
          <div
            className={`nav-item ${activeView === 'dashboard' ? 'active' : ''}`}
            onClick={() => onViewChange('dashboard')}
          >
            <span className="nav-icon">📊</span>
            Dashboard
          </div>
        </div>

        <div className="nav-section">
          <div className="nav-section-title">Analytics</div>
          <div
            className={`nav-item ${activeView === 'forecast' ? 'active' : ''}`}
            onClick={() => onViewChange('forecast')}
          >
            <span className="nav-icon">📈</span>
            Traffic Forecast
          </div>
          <div
            className={`nav-item ${activeView === 'alerts' ? 'active' : ''}`}
            onClick={() => onViewChange('alerts')}
          >
            <span className="nav-icon">🔔</span>
            Congestion Alerts
          </div>
        </div>

        <div className="nav-section">
          <div className="nav-section-title">AI Assistant</div>
          <div
            className={`nav-item ${activeView === 'chat' ? 'active' : ''}`}
            onClick={() => onViewChange('chat')}
          >
            <span className="nav-icon">🤖</span>
            Network Chat
          </div>
        </div>

        <div className="nav-section" style={{ marginTop: 'auto' }}>
          <div className="nav-section-title">System</div>
          <div
            className={`nav-item ${activeView === 'settings' ? 'active' : ''}`}
            onClick={() => onViewChange('settings')}
          >
            <span className="nav-icon">⚙️</span>
            Settings
          </div>
        </div>
      </nav>
    </aside>
  );
}
