import { useState, useEffect } from 'react';
import { X, Activity, Copy, Check, Trash2, ShieldAlert, Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { telemetry, type TelemetryLogEvent } from '../../utils/telemetry';

interface TelemetryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TelemetryModal({ isOpen, onClose }: TelemetryModalProps) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<TelemetryLogEvent[]>([]);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<'all' | 'performance' | 'error'>('all');

  const refreshLogs = () => {
    setLogs(telemetry.getLogs());
  };

  useEffect(() => {
    if (isOpen) {
      refreshLogs();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredLogs = logs.filter(log => {
    if (filter === 'performance') return log.eventType === 'performance';
    if (filter === 'error') return log.eventType === 'error' || log.status === 'error';
    return true;
  });

  const handleCopyLogs = () => {
    const logSummary = JSON.stringify(logs, null, 2);
    navigator.clipboard.writeText(logSummary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClearLogs = () => {
    telemetry.clearLogs();
    setLogs([]);
  };

  const formatDuration = (ms?: number) => {
    if (ms === undefined) return null;
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
    return `${Math.round(ms)} ms`;
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div 
        className="glass-panel" 
        style={{
          width: '90%',
          maxWidth: '680px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, rgba(10, 15, 28, 0.95) 0%, rgba(18, 24, 38, 0.98) 100%)',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.6), 0 0 24px rgba(6, 182, 212, 0.15)',
          borderRadius: '16px',
          overflow: 'hidden',
          padding: 0
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Activity size={18} className="gradient-text" style={{ flexShrink: 0 }} />
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'white' }}>
              {t('telemetry.title', 'System Telemetry & Performance Inspector')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'white'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            <X size={16} />
          </button>
        </div>

        {/* Action Controls & Filters Bar */}
        <div style={{
          padding: '0.75rem 1.25rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          background: 'rgba(0, 0, 0, 0.2)'
        }}>
          {/* Segmented Filter Pills */}
          <div style={{ display: 'flex', gap: '0.4rem', background: 'rgba(255, 255, 255, 0.04)', padding: '3px', borderRadius: '8px' }}>
            {(['all', 'performance', 'error'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilter(mode)}
                style={{
                  background: filter === mode ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                  border: filter === mode ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid transparent',
                  color: filter === mode ? '#06b6d4' : 'var(--text-muted)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'all 0.2s'
                }}
              >
                {mode}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={refreshLogs}
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'var(--text-secondary)',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
              title="Refresh Logs"
            >
              <RefreshCw size={12} />
            </button>
            <button
              type="button"
              onClick={handleCopyLogs}
              style={{
                background: copied ? 'rgba(16, 185, 129, 0.15)' : 'rgba(6, 182, 212, 0.15)',
                border: copied ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(6, 182, 212, 0.4)',
                color: copied ? 'var(--color-green)' : '#06b6d4',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                transition: 'all 0.2s'
              }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              <span>{copied ? t('telemetry.copied', 'Copied for AI!') : t('telemetry.copy_logs', 'Copy Log for AI')}</span>
            </button>
            <button
              type="button"
              onClick={handleClearLogs}
              style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: 'var(--color-red)',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
              title="Clear Logs"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Logs List Feed */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {filteredLogs.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Clock size={36} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
              <p style={{ margin: 0, fontSize: '0.88rem' }}>{t('telemetry.no_logs', 'No telemetry events recorded yet.')}</p>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.78rem' }}>{t('telemetry.no_logs_desc', 'Interact with the app or refresh to generate real-time metrics.')}</p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isErr = log.status === 'error' || log.eventType === 'error';
              return (
                <div
                  key={log.id}
                  style={{
                    background: isErr ? 'rgba(239, 68, 68, 0.04)' : 'rgba(255, 255, 255, 0.02)',
                    border: isErr ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '8px',
                    padding: '0.65rem 0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {isErr ? (
                        <ShieldAlert size={14} style={{ color: 'var(--color-red)' }} />
                      ) : (
                        <Activity size={14} style={{ color: '#06b6d4' }} />
                      )}
                      <span style={{ fontWeight: 700, fontSize: '0.84rem', color: 'white' }}>
                        {log.actionName}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      {log.durationMs !== undefined && (
                        <span style={{
                          fontSize: '0.72rem',
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: log.durationMs < 1000 ? 'rgba(16, 185, 129, 0.12)' : log.durationMs < 3500 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                          color: log.durationMs < 1000 ? 'var(--color-green)' : log.durationMs < 3500 ? '#f59e0b' : 'var(--color-red)',
                          border: log.durationMs < 1000 ? '1px solid rgba(16, 185, 129, 0.3)' : log.durationMs < 3500 ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)'
                        }}>
                          ⏱️ {formatDuration(log.durationMs)}
                        </span>
                      )}
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>

                  {log.errorMessage && (
                    <div style={{
                      fontSize: '0.75rem',
                      color: 'var(--color-red)',
                      fontFamily: 'monospace',
                      background: 'rgba(239, 68, 68, 0.08)',
                      padding: '0.35rem 0.6rem',
                      borderRadius: '4px',
                      marginTop: '0.2rem',
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
                      whiteSpace: 'pre-wrap'
                    }}>
                      <AlertTriangle size={12} style={{ display: 'inline', marginRight: '4px', flexShrink: 0 }} />
                      {log.errorMessage}
                    </div>
                  )}

                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <div style={{ 
                      fontSize: '0.68rem', 
                      color: 'var(--text-muted)', 
                      fontFamily: 'monospace',
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
                      whiteSpace: 'pre-wrap'
                    }}>
                      {JSON.stringify(log.metadata)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
