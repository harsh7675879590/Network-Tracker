/**
 * NetworkTracker — Chat Interface Component
 * RAG chatbot for querying network logs in natural language.
 * Uses TanStack Query for API calls with loading/error states.
 */

import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import apiClient from '../api/client';

export default function ChatInterface() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hello! I\'m your network AI assistant. Ask me anything about your network — traffic patterns, rejected IPs, anomalies, or any log data. For example:\n\n• "Which IPs were rejected today?"\n• "Show me traffic anomalies from the last hour"\n• "What\'s the average latency for subnet 192.168.1.x?"',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const queryMutation = useMutation({
    mutationFn: (question) => apiClient.chatQuery({ question }),
    onSuccess: (data) => {
      const assistantMessage = {
        role: 'assistant',
        content: data.answer,
        sources: data.sources,
        confidence: data.confidence,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    },
    onError: (error) => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `I encountered an error: ${error.message}. The AI service may be temporarily unavailable. Please try again.`,
          timestamp: new Date().toISOString(),
        },
      ]);
    },
  });

  const handleSend = () => {
    const question = input.trim();
    if (!question || queryMutation.isPending) return;

    const userMessage = {
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');

    queryMutation.mutate(question);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">🤖 Network Chat</h1>
          <p className="page-subtitle">Ask questions about your network in plain English</p>
        </div>
      </div>

      <div className="card chat-container">
        <div className="chat-messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`chat-message ${msg.role}`}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>

              {/* Source citations */}
              {msg.sources && msg.sources.length > 0 && (
                <div style={{
                  marginTop: '12px',
                  paddingTop: '8px',
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                }}>
                  <strong style={{ color: 'var(--text-secondary)' }}>Sources:</strong>
                  {msg.sources.map((src, i) => (
                    <div key={i} style={{ marginTop: 4 }}>
                      📄 {src.content_snippet || src.log_reference}
                      {src.relevance_score && (
                        <span style={{
                          marginLeft: 8,
                          background: 'rgba(59, 130, 246, 0.12)',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          color: 'var(--text-accent)',
                        }}>
                          {(src.relevance_score * 100).toFixed(0)}% match
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Confidence indicator */}
              {msg.confidence !== undefined && (
                <div style={{
                  marginTop: 8,
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                }}>
                  Confidence: {(msg.confidence * 100).toFixed(0)}%
                </div>
              )}
            </div>
          ))}

          {/* Loading indicator */}
          {queryMutation.isPending && (
            <div className="chat-message assistant">
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ animation: 'blink 1s infinite 0s' }}>●</span>
                <span style={{ animation: 'blink 1s infinite 0.2s' }}>●</span>
                <span style={{ animation: 'blink 1s infinite 0.4s' }}>●</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-container">
          <input
            className="chat-input"
            type="text"
            placeholder="Ask about your network..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={queryMutation.isPending}
          />
          <button
            className="btn btn-primary"
            onClick={handleSend}
            disabled={!input.trim() || queryMutation.isPending}
          >
            {queryMutation.isPending ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
