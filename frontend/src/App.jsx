/**
 * NetworkTracker — Main App
 * Wires together the sidebar, views, WebSocket, and auth.
 */

import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ForecastView from './components/ForecastView';
import AlertsView from './components/AlertsView';
import ChatInterface from './components/ChatInterface';
import { useWebSocket } from './hooks/useWebSocket';

function SettingsView() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">⚙️ Settings</h1>
          <p className="page-subtitle">System configuration and preferences</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-lg)' }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 'var(--spacing-md)' }}>Service Status</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { name: 'Spring Boot Gateway', port: 8081, status: 'running' },
              { name: 'RAG Chatbot Service', port: 8100, status: 'running' },
              { name: 'Forecast Service', port: 8101, status: 'running' },
              { name: 'Congestion Detection', port: 8102, status: 'running' },
              { name: 'Data Simulator', port: '—', status: 'running' },
              { name: 'Kafka', port: 9092, status: 'running' },
              { name: 'Keycloak', port: 8080, status: 'running' },
              { name: 'TimescaleDB', port: 5433, status: 'running' },
              { name: 'ChromaDB', port: 8000, status: 'running' },
              { name: 'Elasticsearch', port: 9200, status: 'running' },
              { name: 'Jaeger', port: 16686, status: 'running' },
            ].map((svc, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', borderRadius: '8px',
                background: 'rgba(30, 41, 59, 0.5)',
              }}>
                <span style={{ fontWeight: 500, fontSize: '14px' }}>{svc.name}</span>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>:{svc.port}</span>
                  <span className="status-badge normal" style={{ fontSize: '10px', padding: '2px 8px' }}>
                    <span className="status-dot normal"></span>
                    {svc.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 'var(--spacing-md)' }}>Architecture</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.8 }}>
            <p><strong style={{ color: 'var(--text-primary)' }}>Frontend:</strong> React + Vite + TanStack Query</p>
            <p><strong style={{ color: 'var(--text-primary)' }}>Gateway:</strong> Spring Boot 3.3 + Resilience4j</p>
            <p><strong style={{ color: 'var(--text-primary)' }}>AI Services:</strong> FastAPI (RAG, Forecast, Congestion)</p>
            <p><strong style={{ color: 'var(--text-primary)' }}>Auth:</strong> Keycloak (OAuth2 + OIDC)</p>
            <p><strong style={{ color: 'var(--text-primary)' }}>Streaming:</strong> Apache Kafka</p>
            <p><strong style={{ color: 'var(--text-primary)' }}>Databases:</strong> PostgreSQL + TimescaleDB + ChromaDB</p>
            <p><strong style={{ color: 'var(--text-primary)' }}>Observability:</strong> ELK + Jaeger + OpenTelemetry</p>
            <p><strong style={{ color: 'var(--text-primary)' }}>Real-time:</strong> STOMP WebSocket (no polling)</p>
          </div>

          <div style={{ marginTop: 'var(--spacing-lg)' }}>
            <div className="card-title" style={{ marginBottom: 'var(--spacing-sm)' }}>Quick Links</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { name: 'Keycloak Admin', url: 'http://localhost:8080' },
                { name: 'Kibana (Logs)', url: 'http://localhost:5601' },
                { name: 'Jaeger (Traces)', url: 'http://localhost:16686' },
                { name: 'ChromaDB', url: 'http://localhost:8000' },
              ].map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nav-item"
                  style={{ textDecoration: 'none' }}
                >
                  🔗 {link.name}
                  <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '12px' }}>
                    {link.url}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [activeView, setActiveView] = useState('dashboard');

  // Connect WebSocket for real-time alerts
  useWebSocket();

  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return <Dashboard />;
      case 'forecast': return <ForecastView />;
      case 'alerts': return <AlertsView />;
      case 'chat': return <ChatInterface />;
      case 'settings': return <SettingsView />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="app-layout">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <main className="main-content">
        {renderView()}
      </main>
    </div>
  );
}
