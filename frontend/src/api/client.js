/**
 * NetworkTracker — API Client
 * Centralized HTTP client for all REST calls to the Spring Boot gateway.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8081';

class ApiClient {
  constructor() {
    this.baseUrl = API_BASE_URL;
    this.token = null;
  }

  setToken(token) {
    this.token = token;
  }

  async request(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `API error: ${response.status}`);
    }

    return response.json();
  }

  // ── Auth ──
  getUserInfo() {
    return this.request('/api/auth/userinfo');
  }

  // ── Forecast ──
  requestForecast(data) {
    return this.request('/api/forecast/predict', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  getTrafficHistory(params) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/api/forecast/history?${qs}`);
  }

  // ── Congestion ──
  getCongestionStatus() {
    return this.request('/api/congestion/status');
  }

  getRecentAlerts(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/api/congestion/alerts?${qs}`);
  }

  // ── Chat ──
  chatQuery(data) {
    return this.request('/api/chat/query', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  getChatHistory(limit = 20) {
    return this.request(`/api/chat/history?limit=${limit}`);
  }
}

export const apiClient = new ApiClient();
export default apiClient;
