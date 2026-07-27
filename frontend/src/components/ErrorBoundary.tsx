import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { APP_VERSION } from './portfolio/BetaInfoModal';

interface Props {
  children: ReactNode;
  apiBaseUrl?: string;
  onOpenFeedback?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  reported: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      reported: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    this.reportErrorToBackend(error, errorInfo);
  }

  componentDidMount() {
    window.addEventListener('error', this.handleGlobalError);
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.handleGlobalError);
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  handleGlobalError = (event: ErrorEvent) => {
    if (event.error) {
      this.reportErrorToBackend(event.error);
    }
  };

  handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason || 'Unhandled Promise Rejection'));
    this.reportErrorToBackend(error);
  };

  reportErrorToBackend = async (error: Error, errorInfo?: ErrorInfo) => {
    if (this.state.reported) return;
    try {
      const rawApiUrl = import.meta.env.VITE_API_BASE_URL || 
        ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
          ? `${window.location.protocol}//${window.location.hostname}:8000`
          : window.location.origin);
      const apiBaseUrl = this.props.apiBaseUrl || rawApiUrl.replace(/\/$/, "");

      const metadata = {
        appVersion: APP_VERSION,
        userAgent: navigator.userAgent,
        screenResolution: `${window.innerWidth}x${window.innerHeight}`,
        currentRoute: window.location.href,
        componentStack: errorInfo?.componentStack || null,
        timestamp: new Date().toISOString(),
      };

      await fetch(`${apiBaseUrl}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'uncaught_crash',
          message: `[AUTOMATIC CRASH REPORT]\nMessage: ${error.message}\nStack: ${error.stack || 'N/A'}`,
          email: null,
          metadata,
        }),
      });

      this.setState({ reported: true });
    } catch (err) {
      console.error('Failed to dispatch automatic error log to backend:', err);
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          background: '#090d16',
          color: '#e2e8f0',
          padding: '1.5rem',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div className="glass-panel" style={{
            maxWidth: '520px',
            width: '100%',
            padding: '2.5rem',
            borderRadius: '16px',
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            boxShadow: '0 0 30px rgba(239, 68, 68, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            textAlign: 'center'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto',
              color: '#ef4444'
            }}>
              <AlertTriangle size={28} />
            </div>

            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#fff' }}>
                Something went wrong
              </h2>
              <p style={{ fontSize: '0.88rem', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                An unexpected error occurred in the application. An automatic crash diagnostic has been submitted to help us fix it.
              </p>
            </div>

            {this.state.error && (
              <div style={{
                textAlign: 'left',
                background: 'rgba(0, 0, 0, 0.4)',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                fontSize: '0.78rem',
                fontFamily: 'monospace',
                color: '#f87171',
                maxHeight: '120px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                {this.state.error.toString()}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  padding: '0.65rem 1.25rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #06b6d4 0%, #0284c7 100%)',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                <RefreshCw size={16} /> Reload App
              </button>
            </div>

            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
              QuantiFi Beta Release ({APP_VERSION})
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
