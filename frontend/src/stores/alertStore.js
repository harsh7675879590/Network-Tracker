/**
 * NetworkTracker — Alert Store (Zustand)
 * Lightweight store for real-time WebSocket-driven congestion alerts.
 * The WebSocket hook feeds into this store; dashboard components subscribe to it.
 */

import { create } from 'zustand';

export const useAlertStore = create((set, get) => ({
  // ── State ──
  alerts: [],
  connectionStatus: 'disconnected', // 'connected' | 'disconnected' | 'error'
  overallStatus: 'normal', // 'normal' | 'elevated' | 'congested' | 'critical'
  activeAnomalies: 0,
  unreadCount: 0,

  // ── Actions ──
  addAlert: (alert) => set((state) => {
    const newAlerts = [alert, ...state.alerts].slice(0, 200); // keep last 200
    const activeCount = newAlerts.filter(
      a => a.severity === 'high' || a.severity === 'critical'
    ).length;

    let status = 'normal';
    if (activeCount > 5) status = 'critical';
    else if (activeCount > 2) status = 'congested';
    else if (activeCount > 0) status = 'elevated';

    return {
      alerts: newAlerts,
      activeAnomalies: activeCount,
      overallStatus: status,
      unreadCount: state.unreadCount + 1,
    };
  }),

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  clearUnread: () => set({ unreadCount: 0 }),

  clearAlerts: () => set({
    alerts: [],
    activeAnomalies: 0,
    overallStatus: 'normal',
    unreadCount: 0,
  }),
}));
