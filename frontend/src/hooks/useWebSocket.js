/**
 * NetworkTracker — WebSocket Hook
 * Connects to the Spring Boot STOMP WebSocket endpoint and feeds
 * congestion alerts into the Zustand alert store in real-time.
 */

import { useEffect, useRef } from 'react';
import { Client } from '@stomp/stompjs';
import { useAlertStore } from '../stores/alertStore';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8081/ws/alerts';

export function useWebSocket() {
  const clientRef = useRef(null);
  const addAlert = useAlertStore((state) => state.addAlert);
  const setConnectionStatus = useAlertStore((state) => state.setConnectionStatus);

  useEffect(() => {
    const client = new Client({
      brokerURL: WS_URL,
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,

      onConnect: () => {
        console.log('[WebSocket] Connected to alert stream');
        setConnectionStatus('connected');

        client.subscribe('/topic/alerts', (message) => {
          try {
            const alert = JSON.parse(message.body);
            console.log('[WebSocket] Alert received:', alert);
            addAlert(alert);
          } catch (err) {
            console.error('[WebSocket] Failed to parse alert:', err);
          }
        });
      },

      onDisconnect: () => {
        console.log('[WebSocket] Disconnected');
        setConnectionStatus('disconnected');
      },

      onStompError: (frame) => {
        console.error('[WebSocket] STOMP error:', frame);
        setConnectionStatus('error');
      },
    });

    client.activate();
    clientRef.current = client;

    return () => {
      if (clientRef.current) {
        clientRef.current.deactivate();
      }
    };
  }, [addAlert, setConnectionStatus]);

  return clientRef;
}
