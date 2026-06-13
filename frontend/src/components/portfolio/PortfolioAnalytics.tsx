import { Shield } from 'lucide-react';
import type { AnalyticsData } from '../../context/PortfolioContext';

interface PortfolioAnalyticsProps {
  analytics: AnalyticsData | null;
  loading: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onClose?: () => void;
}

export function PortfolioAnalytics({
  analytics,
  loading,
  onMoveUp,
  onMoveDown,
  onClose
}: PortfolioAnalyticsProps) {
  
  const formatPercent = (val: number) => {
    return `${(val * 100).toFixed(2)}%`;
  };

  const getHeatmapColor = (val: number) => {
    if (val === 1) return 'rgba(59, 130, 246, 0.45)'; // 1.0 correlation
    if (val > 0.7) return 'rgba(239, 68, 68, 0.35)'; // high correlation (reddish/orange)
    if (val > 0.3) return 'rgba(234, 179, 8, 0.25)'; // moderate
    if (val < -0.1) return 'rgba(16, 185, 129, 0.3)'; // negative correlation (greenish)
    return 'rgba(255, 255, 255, 0.04)'; // low/neutral
  };

  return (
    <div className="glass-panel" style={{
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
      background: 'linear-gradient(135deg, rgba(20, 26, 42, 0.7) 0%, rgba(10, 14, 24, 0.85) 100%)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: '0.5rem' }}>
        <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Shield size={16} style={{ color: 'var(--color-primary)' }} /> Performance & Risk Analytics
        </h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {onMoveUp && (
            <button 
              onClick={(e) => { e.stopPropagation(); onMoveUp(); }} 
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }} 
              title="Move Up" 
            >
              <span style={{ fontSize: '0.75rem' }}>▲</span>
            </button>
          )}
          {onMoveDown && (
            <button 
              onClick={(e) => { e.stopPropagation(); onMoveDown(); }} 
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }} 
              title="Move Down" 
            >
              <span style={{ fontSize: '0.75rem' }}>▼</span>
            </button>
          )}
          {onClose && (
            <button 
              onClick={(e) => { e.stopPropagation(); onClose(); }} 
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }} 
              title="Hide Card" 
            >
              <span style={{ fontSize: '0.75rem' }}>✕</span>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }} className="pulse">
          Recalculating risk portfolio matrices...
        </div>
      ) : !analytics ? (
        <div style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          Add stock transactions to compute advanced volatility metrics.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {/* Main Return Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.65rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.5rem 0.65rem' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>
                Time-Weighted Return (TWR)
              </span>
              <span style={{ fontSize: '1.15rem', fontWeight: 700, color: analytics.twr >= 0 ? 'var(--color-green)' : 'var(--color-red)', fontFamily: 'monospace' }}>
                {analytics.twr >= 0 ? '+' : ''}{formatPercent(analytics.twr)}
              </span>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.5rem 0.65rem' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>
                Money-Weighted (MWR / XIRR)
              </span>
              <span style={{ fontSize: '1.15rem', fontWeight: 700, color: analytics.mwr >= 0 ? 'var(--color-green)' : 'var(--color-red)', fontFamily: 'monospace' }}>
                {analytics.mwr >= 0 ? '+' : ''}{formatPercent(analytics.mwr)}
              </span>
            </div>
          </div>

          {/* Risk Metrics Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>Sharpe Ratio</span>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                {analytics.sharpe_ratio.toFixed(2)}
              </span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>Sortino Ratio</span>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                {analytics.sortino_ratio.toFixed(2)}
              </span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>Beta Coefficient</span>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                {analytics.beta.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Correlation Matrix Heatmap */}
          {Object.keys(analytics.correlation_matrix).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.25rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                Holdings Correlation Heatmap
              </span>
              
              <div style={{ 
                overflowX: 'auto', 
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: '8px', 
                background: 'rgba(0,0,0,0.1)'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem', fontFamily: 'monospace' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '4px', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}></th>
                      {Object.keys(analytics.correlation_matrix).map(sym => (
                        <th key={sym} style={{ padding: '4px 6px', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)', fontWeight: 700 }}>
                          {sym}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(analytics.correlation_matrix).map(([symRow, cols]) => (
                      <tr key={symRow}>
                        <td style={{ padding: '4px 6px', border: '1px solid rgba(255,255,255,0.05)', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {symRow}
                        </td>
                        {Object.keys(analytics.correlation_matrix).map(symCol => {
                          const val = cols[symCol] !== undefined ? cols[symCol] : 0.0;
                          return (
                            <td 
                              key={symCol} 
                              style={{ 
                                padding: '4px 6px', 
                                border: '1px solid rgba(255,255,255,0.05)', 
                                textAlign: 'center',
                                background: getHeatmapColor(val),
                                color: Math.abs(val) > 0.5 ? '#ffffff' : 'rgba(255,255,255,0.85)',
                                fontWeight: Math.abs(val) > 0.7 ? 800 : 500
                              }}
                              title={`Correlation ${symRow} vs ${symCol}: ${val.toFixed(3)}`}
                            >
                              {val.toFixed(2)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
