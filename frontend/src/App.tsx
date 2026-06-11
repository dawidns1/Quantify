import { useState, useEffect } from 'react';
import { PortfolioView } from './components/PortfolioView';
import { useAuth } from './AuthContext';
import { AuthView } from './components/AuthView';

// In local dev, backend runs on port 8000. In production, it's served on the same origin.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
  ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:8000'
    : window.location.origin);

function App() {
  const { user, loading: authLoading, recoveryMode, signOut } = useAuth();

  const [settings, setSettings] = useState<{
    lowPerformanceMode: boolean;
  }>(() => {
    const cachedLowPerf = localStorage.getItem('settings_low_perf_mode');
    return {
      lowPerformanceMode: cachedLowPerf === 'true',
    };
  });

  useEffect(() => {
    if (settings.lowPerformanceMode) {
      document.body.classList.add('low-perf');
    } else {
      document.body.classList.remove('low-perf');
    }
  }, [settings.lowPerformanceMode]);

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
    <PortfolioView 
      apiBaseUrl={API_BASE_URL} 
      signOut={signOut}
      lowPerformanceMode={settings.lowPerformanceMode}
      setLowPerformanceMode={(val: boolean) => {
        setSettings({ lowPerformanceMode: val });
        localStorage.setItem('settings_low_perf_mode', String(val));
      }}
    />
  );
}

export default App;
