import { useState, useEffect } from 'react';
import { PortfolioView } from './components/PortfolioView';
import { useAuth } from './AuthContext';
import { AuthView } from './components/AuthView';
import { PortfolioProvider } from './context/PortfolioContext';

// In local dev, backend runs on port 8000. In production, it's served on the same origin.
const rawApiUrl = import.meta.env.VITE_API_BASE_URL || 
  ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:8000'
    : window.location.origin);

const API_BASE_URL = rawApiUrl.replace(/\/$/, "");

function App() {
  const { user, loading: authLoading, recoveryMode, signOut } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get('invite');
    if (inviteToken) {
      localStorage.setItem('pending_portfolio_invite', inviteToken);
      // Clean up URL parameter to keep it neat
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
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
        <div className="pulse" style={{ fontSize: '1.2rem' }}>Establishing secure connection...</div>
      </div>
    );
  }

  if (!user || recoveryMode) {
    return <AuthView />;
  }

  return (
    <PortfolioProvider apiBaseUrl={API_BASE_URL}>
      <PortfolioView 
        apiBaseUrl={API_BASE_URL} 
        signOut={signOut}
      />
    </PortfolioProvider>
  );
}

export default App;
