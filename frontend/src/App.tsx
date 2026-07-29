import { useState, useEffect, lazy, Suspense } from 'react';
import { useAuth } from './AuthContext';
import { AuthView } from './components/AuthView';
import { PortfolioProvider } from './context/PortfolioContext';
import { useTranslation } from 'react-i18next';

const lazyWithRetry = (componentImport: () => Promise<any>) =>
  lazy(async () => {
    const pageHasBeenRefreshed = JSON.parse(
      window.sessionStorage.getItem('page_has_been_refreshed') || 'false'
    );
    try {
      const component = await componentImport();
      window.sessionStorage.setItem('page_has_been_refreshed', 'false');
      return component;
    } catch (error: any) {
      if (!pageHasBeenRefreshed) {
        window.sessionStorage.setItem('page_has_been_refreshed', 'true');
        window.location.reload();
      }
      throw error;
    }
  });

const PortfolioView = lazyWithRetry(() => import('./components/PortfolioView').then(module => ({ default: module.PortfolioView })));

// In local dev, backend runs on port 8000. In production, it's served on the same origin.
const rawApiUrl = import.meta.env.VITE_API_BASE_URL || 
  ((window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' || 
    window.location.hostname.match(/^(?:192\.168\.|10\.|172\.(?:1[6-9]|2[0-9]|3[0-1])\.)/) ||
    window.location.hostname.endsWith('.local'))
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : window.location.origin);

const API_BASE_URL = rawApiUrl.replace(/\/$/, "");

function App() {
  const { user, loading: authLoading, recoveryMode, signOut } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    const handleChunkError = (e: PromiseRejectionEvent) => {
      const reason = e.reason?.message || String(e.reason || '');
      if (/Failed to fetch dynamically imported module|Importing a module script failed/i.test(reason)) {
        const pageHasBeenRefreshed = JSON.parse(window.sessionStorage.getItem('page_has_been_refreshed') || 'false');
        if (!pageHasBeenRefreshed) {
          window.sessionStorage.setItem('page_has_been_refreshed', 'true');
          window.location.reload();
        }
      }
    };

    window.addEventListener('unhandledrejection', handleChunkError);

    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get('invite');
    if (inviteToken) {
      localStorage.setItem('pending_portfolio_invite', inviteToken);
      // Clean up URL parameter to keep it neat
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }

    return () => window.removeEventListener('unhandledrejection', handleChunkError);
  }, []);

  const [lowPerf, setLowPerf] = useState(() => {
    return localStorage.getItem('settings_low_perf_mode') === 'true';
  });

  useEffect(() => {
    const syncPreferences = () => {
      const isLowPerf = localStorage.getItem('settings_low_perf_mode') === 'true';
      setLowPerf(isLowPerf);

      if (isLowPerf) {
        document.body.classList.add('low-perf');
      } else {
        document.body.classList.remove('low-perf');
      }

      const density = localStorage.getItem('settings_row_density') || 'comfortable';
      document.body.classList.remove('density-comfortable', 'density-compact');
      document.body.classList.add(`density-${density}`);
    };

    // Run once on mount
    syncPreferences();

    window.addEventListener('app-settings-changed', syncPreferences);
    return () => {
      window.removeEventListener('app-settings-changed', syncPreferences);
    };
  }, []);

  useEffect(() => {
    if (lowPerf) return;

    const handleMouseMove = (e: MouseEvent) => {
      const card = (e.target as HTMLElement).closest('.glass-panel, .glow-card') as HTMLElement;
      if (card) {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        card.style.setProperty('--mouse-x', `${x}px`);
        card.style.setProperty('--mouse-y', `${y}px`);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [lowPerf]);

  if (authLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: 'var(--text-secondary)' }}>
        <div className="pulse" style={{ fontSize: '1.2rem' }}>{t('app.establishing_connection', 'Establishing secure connection...')}</div>
      </div>
    );
  }

  if (!user || recoveryMode) {
    return <AuthView />;
  }

  return (
    <PortfolioProvider apiBaseUrl={API_BASE_URL}>
      <Suspense fallback={
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: 'var(--text-secondary)' }}>
          <div className="pulse" style={{ fontSize: '1.2rem' }}>{t('app.loading', 'Loading application...')}</div>
        </div>
      }>
        <PortfolioView 
          apiBaseUrl={API_BASE_URL} 
          signOut={signOut}
        />
      </Suspense>
    </PortfolioProvider>
  );
}

export default App;
