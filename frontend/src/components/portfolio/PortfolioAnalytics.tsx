import { Shield, RefreshCw } from 'lucide-react';
import type { AnalyticsData } from '../../context/PortfolioContext';
import { useTranslation } from 'react-i18next';

interface PortfolioAnalyticsProps {
  analytics: AnalyticsData | null;
  loading: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onClose?: () => void;
  onRefresh?: () => void;
}

export function PortfolioAnalytics({
  analytics,
  loading,
  onMoveUp,
  onMoveDown,
  onClose,
  onRefresh
}: PortfolioAnalyticsProps) {
  const { t } = useTranslation();
  
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

  const getCorrelationConclusions = (matrix: Record<string, Record<string, number>>) => {
    const keys = Object.keys(matrix);
    if (keys.length < 2) return null;

    let sum = 0;
    let count = 0;
    let maxVal = -2;
    let maxPair = ['', ''];
    let minVal = 2;
    let minPair = ['', ''];

    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const row = keys[i];
        const col = keys[j];
        const val = matrix[row]?.[col];
        if (val !== undefined && !isNaN(val)) {
          sum += val;
          count++;
          if (val > maxVal) {
            maxVal = val;
            maxPair = [row, col];
          }
          if (val < minVal) {
            minVal = val;
            minPair = [row, col];
          }
        }
      }
    }

    if (count === 0) return null;

    const avg = sum / count;
    let avgTypeKey = 'analytics.levels.neutral';
    let avgTypeFallback = 'Neutral';
    let avgColor = 'var(--text-secondary)';
    if (avg > 0.7) {
      avgTypeKey = 'analytics.levels.high';
      avgTypeFallback = 'High (Low Diversification)';
      avgColor = 'hsl(350, 70%, 60%)'; // red
    } else if (avg > 0.3) {
      avgTypeKey = 'analytics.levels.moderate';
      avgTypeFallback = 'Moderate (Decent Diversification)';
      avgColor = 'hsl(45, 90%, 65%)'; // yellow
    } else if (avg > -0.1) {
      avgTypeKey = 'analytics.levels.low';
      avgTypeFallback = 'Low (Strong Diversification)';
      avgColor = 'hsl(142, 70%, 55%)'; // green
    } else {
      avgTypeKey = 'analytics.levels.negative';
      avgTypeFallback = 'Negative (Hedging Effects)';
      avgColor = 'hsl(142, 70%, 55%)'; // green
    }

    return {
      avg,
      avgTypeKey,
      avgTypeFallback,
      avgColor,
      maxVal,
      maxPair,
      minVal,
      minPair
    };
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
          <Shield size={16} style={{ color: 'var(--color-primary)' }} /> {t('analytics.header', 'Performance & Risk Analytics')}
        </h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {onRefresh && (
            <button 
              onClick={(e) => { e.stopPropagation(); onRefresh(); }} 
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', marginRight: '4px' }} 
              title={t('analytics.btn_refresh', 'Refresh Data')}
              className={loading ? 'spinner-ring' : ''}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-primary)'} 
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <RefreshCw size={13} />
            </button>
          )}
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
          {t('analytics.loading', 'Recalculating risk portfolio matrices...')}
        </div>
      ) : !analytics ? (
        <div style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          {t('analytics.empty_state', 'Add stock transactions to compute advanced volatility metrics.')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {/* Main Return Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.65rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.5rem 0.65rem' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>
                {t('analytics.twr', 'Time-Weighted Return (TWR)')}
              </span>
              <span style={{ fontSize: '1.15rem', fontWeight: 700, color: analytics.twr >= 0 ? 'var(--color-green)' : 'var(--color-red)', fontFamily: 'monospace' }}>
                {analytics.twr >= 0 ? '+' : ''}{formatPercent(analytics.twr)}
              </span>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.5rem 0.65rem' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>
                {t('analytics.mwr', 'Money-Weighted (MWR / XIRR)')}
              </span>
              <span style={{ fontSize: '1.15rem', fontWeight: 700, color: analytics.mwr >= 0 ? 'var(--color-green)' : 'var(--color-red)', fontFamily: 'monospace' }}>
                {analytics.mwr >= 0 ? '+' : ''}{formatPercent(analytics.mwr)}
              </span>
            </div>
          </div>

          {/* Risk Metrics Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>{t('analytics.sharpe', 'Sharpe Ratio')}</span>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                {analytics.sharpe_ratio.toFixed(2)}
              </span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>{t('analytics.sortino', 'Sortino Ratio')}</span>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                {analytics.sortino_ratio.toFixed(2)}
              </span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>{t('analytics.beta', 'Beta Coefficient')}</span>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                {analytics.beta.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Correlation Matrix Heatmap */}
          {Object.keys(analytics.correlation_matrix).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.25rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                {t('analytics.heatmap_title', 'Holdings Correlation Heatmap')}
              </span>
              
              <div 
                className="custom-scrollbar"
                style={{ 
                  overflowX: 'auto', 
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: '8px', 
                  background: 'rgba(0,0,0,0.1)',
                  paddingBottom: '2px'
                }}
              >
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

              {/* Dynamic Insights */}
              {(() => {
                const insights = getCorrelationConclusions(analytics.correlation_matrix);
                if (!insights) return null;
                return (
                  <div style={{
                    marginTop: '0.4rem',
                    padding: '0.5rem 0.65rem',
                    background: 'rgba(255,255,255,0.015)',
                    border: '1px solid rgba(255,255,255,0.03)',
                    borderRadius: '8px',
                    fontSize: '0.65rem',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.3rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{t('analytics.average_correlation', 'Average Correlation')}:</span>
                      <span style={{ fontWeight: 700, color: insights.avgColor }}>
                        {insights.avg.toFixed(2)} ({t(insights.avgTypeKey, insights.avgTypeFallback)})
                      </span>
                    </div>
                    {insights.maxVal > 0.7 && (
                      <div style={{ color: 'hsl(350, 70%, 65%)', fontSize: '0.63rem', display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                        <span>⚠️</span>
                        <span><strong>{t('analytics.concentration_risk', 'Concentration risk')}:</strong> {insights.maxPair[0]} & {insights.maxPair[1]} {t('analytics.concentration_desc', 'move in lockstep')} ({insights.maxVal.toFixed(2)}).</span>
                      </div>
                    )}
                    {insights.minVal < 0.3 && (
                      <div style={{ color: 'hsl(142, 70%, 55%)', fontSize: '0.63rem', display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                        <span>✓</span>
                        <span><strong>{t('analytics.diversification', 'Diversification')}:</strong> {insights.minPair[0]} & {insights.minPair[1]} {t('analytics.diversification_desc', 'are uncorrelated/hedged')} ({insights.minVal.toFixed(2)}).</span>
                      </div>
                    )}
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '0.2rem', marginTop: '0.1rem' }}>
                      {t('analytics.legend_range', 'Range')}: <strong>+1.0</strong> ({t('analytics.legend_lockstep', 'moves in lockstep')}), <strong>0.0</strong> ({t('analytics.legend_uncorrelated', 'uncorrelated/diversified')}), <strong>-1.0</strong> ({t('analytics.legend_hedges', 'moves in opposite directions/hedges')}).
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
