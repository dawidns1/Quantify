import { useState, useEffect } from 'react';
import { PortfolioView } from './components/PortfolioView';
import { Settings, LogOut } from 'lucide-react';
import { useAuth } from './AuthContext';
import { AuthView } from './components/AuthView';

// In local dev, backend runs on port 8000. In production, it's served on the same origin.
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:8000'
  : window.location.origin;

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

  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);

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
    <div className="app-container">
      {/* Header Widget */}
      <header className="glass-panel header">
        <div className="logo-section" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img 
            src="/favicon.png" 
            alt="Quantify Logo" 
            style={{ 
              width: '36px', 
              height: '36px', 
              borderRadius: '8px', 
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 0 12px rgba(6, 182, 212, 0.3)' 
            }} 
          />
          <div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', lineHeight: '1.1' }}>
              Quant<span className="gradient-text">ify</span>
            </h1>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>Multi-Currency Collaborative Portfolio Tracker</p>
          </div>
        </div>

        {/* Controls / User Stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {/* Settings panel Gear menu */}
          <div className="settings-container" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button 
              className={`settings-btn ${showSettingsDropdown ? 'active' : ''}`}
              onClick={() => setShowSettingsDropdown(!showSettingsDropdown)}
              title="Open Settings"
            >
              <Settings size={18} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', borderLeft: '1px solid var(--panel-border)', paddingLeft: '1rem', marginLeft: '0.5rem' }}>
            <div style={{ textAlign: 'right', fontSize: '0.75rem' }}>
              <div style={{ color: 'var(--text-muted)' }}>Logged in as</div>
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={user?.email || ''}>
                {user?.email}
              </div>
            </div>
            
            <button 
              className="glow-btn"
              style={{ 
                padding: '0.4rem', 
                background: 'rgba(239, 68, 68, 0.08)', 
                color: 'var(--color-red)', 
                borderColor: 'rgba(239, 68, 68, 0.2)',
                boxShadow: 'none', 
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              onClick={() => signOut()}
              title="Sign Out"
            >
              <LogOut size={14} />
            </button>
          </div>
            
          {showSettingsDropdown && (
            <div className="settings-panel glass-panel">
              <h3>App Settings</h3>
              
              {/* Performance mode toggle */}
              <div className="settings-row">
                <div className="settings-label">
                  <span>Performance Mode</span>
                  <small>Disables blurs & animations for speed</small>
                </div>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={settings.lowPerformanceMode}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setSettings(prev => {
                        const next = { ...prev, lowPerformanceMode: val };
                        localStorage.setItem('settings_low_perf_mode', String(val));
                        return next;
                      });
                    }}
                  />
                  <span className="slider"></span>
                </label>
              </div>
              
              {/* Theme toggle placeholder */}
              <div className="settings-row">
                <div className="settings-label">
                  <span>App Theme</span>
                  <small>Configure visual skin</small>
                </div>
                <select className="settings-select" disabled>
                  <option>Quantum Dark</option>
                  <option>Classic Light (Locked)</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main View: Render PortfolioView directly */}
      <PortfolioView apiBaseUrl={API_BASE_URL} />
    </div>
  );
}

export default App;
