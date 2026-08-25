import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Calendar, AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fetchDividendForecast } from '../../services/calculationService';
import { usePortfolio } from '../../context/PortfolioContext';

interface DividendForecastProps {
  apiBaseUrl: string;
  activePortfolioId: string | null;
  session: any;
  baseCurrency: string;
  account: string;
  linkCash: boolean;
  holdings: any[];
  onClose?: () => void;
  style?: React.CSSProperties;
  isExpanded?: boolean;
}

interface ForecastData {
  forward_annual_income: number;
  forward_yield: number;
  yield_on_cost: number;
  months: string[];
  monthly_amounts: number[];
  ticker_contributions: Record<string, number[]>;
}

export function DividendForecast({
  apiBaseUrl,
  activePortfolioId,
  session,
  baseCurrency,
  account,
  linkCash,
  holdings,
  onClose,
  style,
  isExpanded: _isExpanded = false
}: DividendForecastProps) {
  const { t, i18n } = useTranslation();
  const { dividendForecast } = usePortfolio();

  const [data, setData] = useState<ForecastData | null>(() => {
    if (dividendForecast) return dividendForecast;
    if (!activePortfolioId) return null;
    const cacheKey = `cached_dividend_forecast_${activePortfolioId}_${baseCurrency}_${account}_${linkCash}`;
    const cached = localStorage.getItem(cacheKey);
    return cached ? JSON.parse(cached) : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredMonthIndex, setHoveredMonthIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const holdingsKey = JSON.stringify(holdings.map(h => ({ symbol: h.symbol, shares: h.shares })));

  // Sync with context's bundled forecast whenever it updates
  useEffect(() => {
    if (dividendForecast) {
      setData(dividendForecast);
      setLoading(false);
    }
  }, [dividendForecast]);

  const loadData = () => {
    if (!activePortfolioId) return;
    setLoading(true);
    setError(null);
    const jwtToken = session?.access_token || null;
    const cacheKey = `cached_dividend_forecast_${activePortfolioId}_${baseCurrency}_${account}_${linkCash}`;

    fetchDividendForecast(apiBaseUrl, jwtToken, activePortfolioId, baseCurrency, account, linkCash)
      .then((res) => {
        localStorage.setItem(cacheKey, JSON.stringify(res));
        setData(res);
      })
      .catch((err) => {
        if (err?.message !== 'Tab suspended (background).' && err?.message !== 'Request cancelled.' && !err?.message?.includes('timed out')) {
          console.error('Error fetching dividend forecast:', err);
          setError(err.message || 'Failed to load forecast');
        }
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!activePortfolioId) return;

    if (dividendForecast) {
      setData(dividendForecast);
      return;
    }

    const cacheKey = `cached_dividend_forecast_${activePortfolioId}_${baseCurrency}_${account}_${linkCash}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      setData(JSON.parse(cached));
    } else {
      loadData();
    }
  }, [activePortfolioId, baseCurrency, account, linkCash, holdingsKey, apiBaseUrl, session?.access_token]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat(i18n.language || 'en', {
      style: 'currency',
      currency: baseCurrency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val);
  };

  const formatPercent = (val: number) => {
    return `${(val * 100).toFixed(2)}%`;
  };

  const formatBarAmount = (val: number) => {
    const formatted = new Intl.NumberFormat(i18n.language || 'en', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(val);
    if (baseCurrency === 'USD') return `$${formatted}`;
    if (baseCurrency === 'EUR') return `€${formatted}`;
    if (baseCurrency === 'PLN') return `${formatted} zł`;
    return `${formatted} ${baseCurrency}`;
  };

  const maxMonthValue = useMemo(() => {
    if (!data || data.monthly_amounts.length === 0) return 1;
    const maxVal = Math.max(...data.monthly_amounts, 0);
    return maxVal === 0 ? 1 : maxVal;
  }, [data]);

  const monthLabel = (monthStr: string) => {
    try {
      const [year, month] = monthStr.split('-');
      const d = new Date(parseInt(year), parseInt(month) - 1, 1);
      return d.toLocaleString(i18n.language || 'en', { month: 'short' });
    } catch (e) {
      return monthStr;
    }
  };

  const monthFullLabel = (monthStr: string) => {
    try {
      const [year, month] = monthStr.split('-');
      const d = new Date(parseInt(year), parseInt(month) - 1, 1);
      return d.toLocaleString(i18n.language || 'en', { month: 'long', year: 'numeric' });
    } catch (e) {
      return monthStr;
    }
  };

  if (loading && !data) {
    return (
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(255,255,255,0.02)' }}>
        <div className="shimmer-placeholder" style={{ width: '240px', height: '24px', borderRadius: '4px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '0.5rem' }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="shimmer-placeholder" style={{ height: '70px', borderRadius: '8px' }} />
          ))}
        </div>
        <div className="shimmer-placeholder" style={{ width: '100%', height: '140px', borderRadius: '8px', marginTop: '0.5rem' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel" style={{
        height: '100%',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        background: 'linear-gradient(135deg, rgba(16, 24, 40, 0.45) 0%, rgba(10, 15, 26, 0.7) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '12px',
        position: 'relative',
        minHeight: '280px',
        ...style
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
            <TrendingUp size={18} style={{ color: 'var(--color-primary)' }} />
            {t('dividends.forecast_title', '12-Month Forward Dividend Forecast')}
          </h3>
          {onClose && (
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); onClose(); }} 
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', transition: 'color 0.2s' }} 
              title="Hide Card"
              onMouseEnter={(e) => e.currentTarget.style.color = 'white'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <span style={{ fontSize: '0.75rem' }}>✕</span>
            </button>
          )}
        </div>
        
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          textAlign: 'center',
          padding: '2rem 1rem',
          gap: '0.75rem',
          background: 'rgba(239, 68, 68, 0.03)',
          border: '1px dashed rgba(239, 68, 68, 0.15)',
          borderRadius: '8px',
          marginTop: '0.5rem'
        }}>
          <div style={{ 
            width: '40px', 
            height: '40px', 
            borderRadius: '50%', 
            background: 'rgba(239, 68, 68, 0.08)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: 'var(--color-red)',
            marginBottom: '0.25rem'
          }}>
            <AlertCircle size={20} />
          </div>
          <div style={{ fontWeight: 600, color: 'white', fontSize: '0.92rem' }}>
            {t('dividends.forecast_error_title', 'Calculation Error')}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', maxWidth: '320px', lineHeight: '1.4' }}>
            {t('dividends.forecast_error', 'Error calculating dividend forecast')}: {error}
          </div>
          <button
            onClick={() => loadData()}
            disabled={loading}
            style={{
              marginTop: '0.5rem',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: 'var(--color-red)',
              fontSize: '0.78rem',
              fontWeight: 600,
              padding: '6px 14px',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
              }
            }}
          >
            <RefreshCw size={12} style={{ animation: loading ? 'spin-spinner 1.5s linear infinite' : 'none' }} />
            {loading ? t('common.loading', 'Loading...') : t('common.retry', 'Retry Calculation')}
          </button>
        </div>
      </div>
    );
  }

  const hasDividends = data && data.forward_annual_income > 0;

  return (
    <div className="glass-panel" style={{
      height: '100%',
      padding: '0.65rem 0.85rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.35rem',
      background: 'linear-gradient(135deg, rgba(16, 24, 40, 0.45) 0%, rgba(10, 15, 26, 0.7) 100%)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '12px',
      position: 'relative',
      overflow: 'hidden',
      ...style
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
          <TrendingUp size={18} className="gradient-text" style={{ flexShrink: 0 }} />
          {t('dividends.forecast_title', '12-Month Forward Dividend Forecast')}
        </h3>
        {onClose && (
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }} 
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', transition: 'color 0.2s' }} 
            title="Hide Card"
            onMouseEnter={(e) => e.currentTarget.style.color = 'white'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            <span style={{ fontSize: '0.75rem' }}>✕</span>
          </button>
        )}
      </div>

      {!hasDividends || !data ? (
        <div style={{
          padding: '1.5rem 1rem',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.8rem',
          background: 'rgba(0,0,0,0.1)',
          borderRadius: '8px',
          border: '1px dashed var(--panel-border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.35rem'
        }}>
          <Calendar size={20} style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
          <span>{t('dividends.no_forecast_data', 'No forward dividend data available. Add dividend-paying assets to see projections.')}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1, minHeight: 0 }}>
          {/* Key Metrics row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.35rem' }}>
            {/* Metric 1 */}
            <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '6px', padding: '0.4rem 0.6rem' }}>
              <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                {t('dividends.forward_annual_income', 'Forward Annual Income')}
              </span>
              <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-green)', fontFamily: 'monospace', textShadow: '0 0 10px rgba(16, 185, 129, 0.1)' }}>
                {formatCurrency(data.forward_annual_income)}
              </span>
            </div>
            {/* Metric 2 */}
            <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '6px', padding: '0.4rem 0.6rem' }}>
              <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                {t('dividends.forward_portfolio_yield', 'Forward Yield')}
              </span>
              <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                {formatPercent(data.forward_yield)}
              </span>
            </div>
            {/* Metric 3 */}
            <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '6px', padding: '0.4rem 0.6rem' }}>
              <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                {t('dividends.yield_on_cost', 'Yield on Cost')}
              </span>
              <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                {formatPercent(data.yield_on_cost)}
              </span>
            </div>
          </div>

          {/* Bar Chart Container */}
          <div 
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setTooltipPos({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
              });
            }}
            style={{ position: 'relative', marginTop: '0.2rem', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
          >
            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem', letterSpacing: '0.5px' }}>
              {t('dividends.monthly_projection', 'Monthly Cash Flow Projections')}
            </span>

            {/* Grid display */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'stretch',
              flex: 1,
              minHeight: '200px',
              padding: '0 0.5rem',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              gap: '3%',
              position: 'relative'
            }}>
              {data.monthly_amounts.map((amount, idx) => {
                const heightPercent = amount > 0 ? `${(amount / maxMonthValue) * 70}%` : '0%';
                const monthName = data.months[idx];
                const isHovered = hoveredMonthIndex === idx;

                return (
                  <div
                    key={monthName}
                    style={{
                      flex: 1,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={() => setHoveredMonthIndex(idx)}
                    onMouseLeave={() => setHoveredMonthIndex(null)}
                  >
                    {/* Hover glow background */}
                    {isHovered && (
                      <div style={{
                        position: 'absolute',
                        bottom: 0,
                        width: '120%',
                        height: '100%',
                        background: 'rgba(255, 255, 255, 0.015)',
                        borderRadius: '6px',
                        zIndex: 0
                      }} />
                    )}

                    {/* Dedicated Bar Area Container */}
                    <div style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      position: 'relative',
                      minHeight: 0
                    }}>
                      {/* Amount Label above the bar */}
                      {amount > 0 && (
                        <span style={{
                          position: 'absolute',
                          bottom: `calc(${heightPercent} + 4px)`,
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          color: isHovered ? 'var(--color-green)' : 'var(--text-secondary)',
                          fontFamily: 'monospace',
                          textAlign: 'center',
                          whiteSpace: 'nowrap',
                          zIndex: 2,
                          transition: 'bottom 0.2s ease-in-out, color 0.2s ease-in-out'
                        }}>
                          {formatBarAmount(amount)}
                        </span>
                      )}

                      {/* Bar */}
                      {amount > 0 ? (
                        <div style={{
                          width: '100%',
                          height: heightPercent,
                          background: isHovered 
                            ? 'linear-gradient(to top, rgba(6, 182, 212, 0.8), rgba(16, 185, 129, 0.8))'
                            : 'linear-gradient(to top, rgba(6, 182, 212, 0.35), rgba(16, 185, 129, 0.45))',
                          boxShadow: isHovered 
                            ? '0 0 12px rgba(6, 182, 212, 0.35)' 
                            : 'none',
                          border: isHovered
                            ? '1px solid rgba(6, 182, 212, 0.8)'
                            : '1px solid rgba(16, 185, 129, 0.15)',
                          borderRadius: '4px 4px 0 0',
                          transition: 'all 0.2s ease-in-out',
                          zIndex: 1,
                          position: 'relative'
                        }} />
                      ) : (
                        <div style={{ height: '0%', width: '100%' }} />
                      )}
                    </div>

                    {/* Month Label below bar area */}
                    <span style={{
                      fontSize: '0.62rem',
                      color: isHovered ? 'var(--text-primary)' : 'var(--text-muted)',
                      marginTop: '0.25rem',
                      fontWeight: isHovered ? 700 : 500,
                      zIndex: 1,
                      textAlign: 'center',
                      flexShrink: 0
                    }}>
                      {monthLabel(monthName)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Ticker contributions Tooltip Box */}
            {hoveredMonthIndex !== null && (() => {
              const monthName = data.months[hoveredMonthIndex];
              const monthAmount = data.monthly_amounts[hoveredMonthIndex];
              
              // Get active contributions for this month
              const contributions = Object.entries(data.ticker_contributions)
                .map(([ticker, amounts]) => ({
                  ticker,
                  amount: amounts[hoveredMonthIndex] || 0
                }))
                .filter(c => c.amount > 0)
                .sort((a, b) => b.amount - a.amount);

              return (
                <div style={{
                  position: 'absolute',
                  left: `${tooltipPos.x}px`,
                  top: `${tooltipPos.y}px`,
                  transform: hoveredMonthIndex > 6
                    ? 'translate(-105%, -105%)' 
                    : 'translate(15px, -105%)',
                  background: 'rgba(11, 15, 28, 0.95)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  padding: '0.65rem 0.85rem',
                  zIndex: 10,
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                  minWidth: '160px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                  pointerEvents: 'none',
                  animation: 'fadeIn 0.1s ease-out'
                }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.25rem' }}>
                    {monthFullLabel(monthName)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', fontWeight: 700, color: 'white' }}>
                    <span>{t('dividends.total_net', 'Total Net')}:</span>
                    <span style={{ color: 'var(--color-green)' }}>{formatCurrency(monthAmount)}</span>
                  </div>
                  {contributions.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
                      {contributions.map(c => (
                        <div key={c.ticker} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                          <span style={{ fontWeight: 600 }}>{c.ticker}</span>
                          <span style={{ fontFamily: 'monospace' }}>{formatCurrency(c.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
