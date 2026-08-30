import { useState, useEffect } from 'react';
import { X, Activity, Copy, Check, Trash2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { telemetry, type TelemetryLogEvent } from '../../utils/telemetry';

interface TelemetryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TelemetryModal({ isOpen, onClose }: TelemetryModalProps) {
  const { t, i18n } = useTranslation();
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

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1250, padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div 
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '900px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '1.25rem',
          gap: '1rem',
          background: 'rgba(11, 19, 41, 0.98)',
          border: '1px solid rgba(6, 182, 212, 0.25)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(6, 182, 212, 0.15)',
          borderRadius: '16px'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Activity size={20} style={{ color: 'var(--color-primary)' }} />
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'white' }}>
                {t('telemetry.title', 'System Telemetry & Performance Logs')}
              </h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {t('telemetry.subtitle', 'Live execution traces and API round-trip benchmarks for bug diagnostics.')}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          {/* Filters */}
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {(['all', 'performance', 'error'] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid ' + (filter === f ? 'transparent' : 'var(--panel-border)'),
                  color: filter === f ? 'white' : 'var(--text-secondary)',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {t(`telemetry.filter_${f}`, f)}
              </button>
            ))}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              type="button"
              onClick={refreshLogs}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
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
              title={t('telemetry.refresh_logs', 'Refresh Logs')}
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
              title={t('telemetry.clear_logs', 'Clear Logs')}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Logs List Container */}
        <div 
          className="custom-scrollbar"
          style={{ 
            flex: 1, 
            overflowY: 'auto', 
            background: 'rgba(0, 0, 0, 0.4)', 
            border: '1px solid rgba(255, 255, 255, 0.05)', 
            borderRadius: '8px', 
            padding: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
            fontFamily: 'monospace'
          }}
        >
          {filteredLogs.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 0', fontSize: '0.8rem' }}>
              {t('telemetry.no_logs', 'No telemetry logs recorded yet.')}
            </div>
          ) : (
            filteredLogs.map(log => (
              <div 
                key={log.id} 
                style={{
                  background: log.status === 'error' ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid ' + (log.status === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.04)'),
                  borderRadius: '6px',
                  padding: '0.5rem 0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                  fontSize: '0.75rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ 
                      color: log.status === 'success' ? 'var(--color-green)' : log.status === 'error' ? 'var(--color-red)' : '#f59e0b',
                      fontWeight: 700 
                    }}>
                      {log.status === 'success' ? '●' : log.status === 'error' ? '✖' : '▲'}
                    </span>
                    <strong style={{ color: 'white' }}>{log.actionName}</strong>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: '3px' }}>
                      {log.eventType}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    {log.durationMs !== undefined && (
                      <span style={{ 
                        fontSize: '0.7rem', 
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: log.durationMs < 1000 ? 'rgba(16, 185, 129, 0.12)' : log.durationMs < 3500 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                        color: log.durationMs < 1000 ? 'var(--color-green)' : log.durationMs < 3500 ? '#f59e0b' : 'var(--color-red)',
                        border: log.durationMs < 1000 ? '1px solid rgba(16, 185, 129, 0.3)' : log.durationMs < 3500 ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)'
                      }}>
                        ⏱️ {formatDuration(log.durationMs)}
                      </span>
                    )}
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {new Date(log.timestamp).toLocaleTimeString(i18n.language || 'en')}
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
            ))
          )}
        </div>
      </div>
    </div>
  );
}
