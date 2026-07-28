import { useState, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Share2, Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface DividendCalendarProps {
  dividends: any[];
  baseCurrency: string;
  onClose?: () => void;
  viewMode?: 'both' | 'calendar' | 'forecast';
  apiBaseUrl?: string;
  activePortfolioId?: string | null;
  jwtToken?: string | null;
  style?: React.CSSProperties;
  isExpanded?: boolean;
}

export function DividendCalendar({ 
  dividends, 
  baseCurrency,
  onClose,
  viewMode,
  apiBaseUrl,
  activePortfolioId,
  jwtToken,
  style,
  isExpanded = false
}: DividendCalendarProps) {
  const { t, i18n } = useTranslation();
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [hoveredMonthIndex, setHoveredMonthIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [isTooltipRightHalf, setIsTooltipRightHalf] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyFeed = () => {
    if (!apiBaseUrl || !activePortfolioId || !jwtToken) return;
    const cleanUrl = apiBaseUrl.replace(/\/$/, "");
    const feedUrl = `${cleanUrl}/api/portfolio/${activePortfolioId}/calendar.ics?token=${encodeURIComponent(jwtToken)}`;
    
    navigator.clipboard.writeText(feedUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(err => console.error("Could not copy feed URL:", err));
  };

  const formatCurrency = (val: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  // Extract unique years from dividends
  const availableYears = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()]);
    dividends.forEach(d => {
      if (d.date) {
        const y = new Date(d.date).getFullYear();
        if (!isNaN(y)) years.add(y);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [dividends]);

  // Aggregate dividends by month for the selected year
  const monthlyData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => {
      const activeLang = i18n.language || 'en';
      return {
        index: i,
        name: new Date(2000, i, 1).toLocaleString(activeLang, { month: 'long' }),
        shortName: new Date(2000, i, 1).toLocaleString(activeLang, { month: 'short' }),
        totalNet: 0,
        totalGross: 0,
        payments: [] as any[]
      };
    });

    dividends.forEach(d => {
      if (d.date && !d.is_deleted) {
        const parts = d.date.split('-');
        if (parts.length === 3) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          if (y === selectedYear && m >= 0 && m < 12) {
            months[m].totalNet += d.net_base || d.payout_net_base || 0;
            months[m].totalGross += d.gross_base || d.payout_base || 0;
            months[m].payments.push(d);
          }
        }
      }
    });

    return months;
  }, [dividends, selectedYear, i18n.language]);

  // Total for the selected year
  const yearlyTotal = useMemo(() => {
    return monthlyData.reduce((sum, m) => sum + m.totalNet, 0);
  }, [monthlyData]);


  const handlePrevYear = () => {
    const idx = availableYears.indexOf(selectedYear);
    if (idx < availableYears.length - 1) {
      setSelectedYear(availableYears[idx + 1]);
    }
  };

  const handleNextYear = () => {
    const idx = availableYears.indexOf(selectedYear);
    if (idx > 0) {
      setSelectedYear(availableYears[idx - 1]);
    }
  };

  return (
    <div className="glass-panel" style={{
      height: '100%',
      padding: '0.65rem 0.85rem',
      background: 'linear-gradient(135deg, rgba(18, 24, 38, 0.6) 0%, rgba(13, 17, 28, 0.75) 100%)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.35rem',
      overflow: 'hidden',
      ...style
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
          <Calendar size={18} className="gradient-text" style={{ flexShrink: 0 }} />
          <span>{t('calendar.income_header', 'Dividend Income Calendar')}</span>
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {apiBaseUrl && activePortfolioId && jwtToken && (
            <button
              onClick={handleCopyFeed}
              title={t('calendar.copy_feed_title', 'Copy iCal Feed URL for Google/Apple Calendar')}
              style={{
                background: copied ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                border: copied ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                color: copied ? 'var(--color-green)' : 'var(--text-secondary)',
                borderRadius: '6px',
                padding: '3px 6px',
                fontSize: '0.68rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {copied ? <Check size={11} /> : <Share2 size={11} />}
              <span>{copied ? t('calendar.feed_copied', 'Copied!') : t('calendar.btn_feed', 'iCal Feed')}</span>
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '6px', padding: '2px 4px' }}>
            <button 
              onClick={handlePrevYear} 
              disabled={availableYears.indexOf(selectedYear) === 0}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', opacity: availableYears.indexOf(selectedYear) === 0 ? 0.3 : 1, padding: '2px', display: 'flex', alignItems: 'center' }}
            >
              <ChevronLeft size={12} />
            </button>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'white', minWidth: '38px', textAlign: 'center', fontFamily: 'monospace' }}>{selectedYear}</span>
            <button 
              onClick={handleNextYear}
              disabled={availableYears.indexOf(selectedYear) === availableYears.length - 1}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', opacity: availableYears.indexOf(selectedYear) === availableYears.length - 1 ? 0.3 : 1, padding: '2px', display: 'flex', alignItems: 'center' }}
            >
              <ChevronRight size={12} />
            </button>
          </div>
          {onClose && (
            <button 
              onClick={(e) => { e.stopPropagation(); onClose(); }} 
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }} 
              title="Hide Card"
              onMouseEnter={(e) => e.currentTarget.style.color = 'white'} 
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div style={{
        background: 'rgba(59, 130, 246, 0.04)',
        border: '1px dashed rgba(59, 130, 246, 0.25)',
        padding: '0.35rem 0.6rem',
        borderRadius: '6px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('calendar.yearly_cash_flow', 'Yearly Dividend Cash Flow')}</span>
          <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-green)', fontFamily: 'monospace' }}>
            {formatCurrency(yearlyTotal, baseCurrency)}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.1rem' }}>
          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{t('calendar.avg_monthly_income', 'Avg. Monthly Income')}</span>
          <span style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
            {formatCurrency(yearlyTotal / 12, baseCurrency)}
          </span>
        </div>
      </div>

      <div 
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          setIsTooltipRightHalf(x > rect.width * 0.65);
          setTooltipPos({
            x,
            y: e.clientY - rect.top
          });
        }}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '2px' }}
        className={`dividend-calendar-grid ${viewMode === 'calendar' ? 'full-width' : 'side-by-side'}`}
      >
        {monthlyData.map(m => {
          const uniqueTickers = Array.from(new Set(m.payments.map(p => p.symbol.toUpperCase()))).slice(0, 3);
          const hasPayments = m.payments.length > 0;
          const isAllUpcoming = hasPayments && m.payments.every(p => p.is_upcoming);
          
          const totalPaid = m.payments.filter(p => !p.is_upcoming).reduce((sum, p) => sum + (p.net_base || p.payout_net_base || 0), 0);
          const totalUpcoming = m.payments.filter(p => p.is_upcoming).reduce((sum, p) => sum + (p.net_base || p.payout_net_base || 0), 0);

          return (
            <div 
              key={m.index} 
              onMouseEnter={() => setHoveredMonthIndex(m.index)}
              onMouseLeave={() => setHoveredMonthIndex(null)}
              style={{
                background: hasPayments ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.005)',
                border: '1px solid rgba(255, 255, 255, 0.04)',
                borderRadius: '6px',
                padding: '0.35rem 0.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.2rem',
                position: 'relative',
                overflow: 'hidden',
                transition: 'var(--transition-smooth)'
              }}
              className="calendar-month-card"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1 }}>
                <span style={{ fontSize: isExpanded ? '0.88rem' : '0.75rem', fontWeight: 700, color: hasPayments ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {m.name}
                </span>
                {hasPayments && (
                  <span style={{ fontSize: isExpanded ? '0.68rem' : '0.6rem', color: 'var(--text-muted)', background: 'rgba(255, 255, 255, 0.05)', padding: '1px 4px', borderRadius: '3px' }}>
                    {m.payments.length}
                  </span>
                )}
              </div>

              <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                <span style={{ 
                  fontSize: isExpanded ? '1.05rem' : '0.85rem', 
                  fontWeight: 700, 
                  color: hasPayments ? 'var(--color-green)' : 'var(--text-muted)', 
                  fontFamily: 'monospace',
                  opacity: isAllUpcoming ? 0.85 : 1
                }}>
                  {m.totalNet > 0 ? formatCurrency(m.totalNet, baseCurrency) : '—'}
                  {isAllUpcoming && <span style={{ fontSize: isExpanded ? '0.68rem' : '0.62rem', color: 'var(--text-muted)', marginLeft: '3px', fontWeight: 500 }}>est.</span>}
                </span>
                
                {hasPayments && (
                  isExpanded ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px' }}>
                      {m.payments.slice(0, 6).map((p, pIdx) => {
                        const val = p.net_base || p.payout_net_base || 0;
                        return (
                          <div 
                            key={pIdx} 
                            style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center',
                              fontSize: isExpanded ? '0.72rem' : '0.64rem',
                              color: 'var(--text-secondary)',
                              background: 'rgba(255, 255, 255, 0.02)',
                              border: '1px solid rgba(255, 255, 255, 0.04)',
                              padding: isExpanded ? '3px 8px' : '2px 6px',
                              borderRadius: '4px',
                              lineHeight: '1.2'
                            }}
                          >
                            <span style={{ fontWeight: 600, color: 'white' }}>{p.symbol}</span>
                            <span style={{ color: p.is_upcoming ? 'var(--text-muted)' : 'var(--color-green)', fontFamily: 'monospace' }}>
                              {formatCurrency(val, baseCurrency)}
                            </span>
                          </div>
                        );
                      })}
                      {m.payments.length > 6 && (
                        <div style={{ fontSize: isExpanded ? '0.68rem' : '0.6rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '2px' }}>
                          + {m.payments.length - 6} more
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                      {totalPaid > 0 && totalUpcoming > 0 ? (
                        <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ 
                            width: '5px', 
                            height: '5px', 
                            borderRadius: '50%', 
                            background: 'linear-gradient(90deg, var(--color-green) 50%, rgba(6, 182, 212, 0.7) 50%)',
                            flexShrink: 0
                          }} />
                          <span>
                            Paid: <span style={{ color: 'var(--text-primary)' }}>{formatCurrency(totalPaid, baseCurrency)}</span> | Est: <span style={{ color: 'var(--text-muted)' }}>{formatCurrency(totalUpcoming, baseCurrency)}</span>
                          </span>
                        </span>
                      ) : isAllUpcoming ? (
                        <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ 
                            width: '5px', 
                            height: '5px', 
                            borderRadius: '50%', 
                            background: 'rgba(6, 182, 212, 0.7)',
                            flexShrink: 0
                          }} />
                          <span>Projected Payout</span>
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.58rem', color: 'var(--color-green)', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ 
                            width: '5px', 
                            height: '5px', 
                            borderRadius: '50%', 
                            background: 'var(--color-green)',
                            flexShrink: 0
                          }} />
                          <span>Received</span>
                        </span>
                      )}
                      <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', display: 'flex', gap: '2px', flexWrap: 'wrap' }}>
                        {uniqueTickers.join(', ')}
                        {uniqueTickers.length < m.payments.length && '...'}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          );
        })}

        {/* Dynamic Tooltip Box following cursor */}
        {hoveredMonthIndex !== null && (() => {
          const m = monthlyData[hoveredMonthIndex];
          if (m.payments.length === 0) return null;
          
          const sortedPayments = [...m.payments].sort((a, b) => {
            if (a.is_upcoming !== b.is_upcoming) {
              return a.is_upcoming ? 1 : -1;
            }
            return (b.net_base || b.payout_net_base || 0) - (a.net_base || a.payout_net_base || 0);
          });

          return (
            <div style={{
              position: 'absolute',
              left: `${tooltipPos.x}px`,
              top: `${tooltipPos.y}px`,
              transform: isTooltipRightHalf
                ? 'translate(-105%, -100%)' 
                : 'translate(10px, -100%)',
              background: 'rgba(11, 15, 28, 0.96)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '8px',
              padding: '0.65rem 0.85rem',
              zIndex: 100,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
              minWidth: '180px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
              pointerEvents: 'none',
              whiteSpace: 'nowrap'
            }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.25rem' }}>
                {m.name} {selectedYear}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {sortedPayments.map((p, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontWeight: 700, color: 'white' }}>{p.symbol}</span>
                      <span style={{ 
                        fontSize: '0.55rem', 
                        color: p.is_upcoming ? 'var(--text-muted)' : 'var(--color-green)',
                        background: p.is_upcoming ? 'rgba(255,255,255,0.04)' : 'rgba(16, 185, 129, 0.08)',
                        padding: '1px 3px',
                        borderRadius: '3px'
                      }}>
                        {p.is_upcoming ? t('calendar.projected', 'Est.') : t('calendar.received', 'Paid')}
                      </span>
                    </div>
                    <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                      {formatCurrency(p.net_base || p.payout_net_base || 0, baseCurrency)}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', fontWeight: 700 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t('dividends.total_net', 'Total Net')}:</span>
                <span style={{ color: 'var(--color-green)' }}>{formatCurrency(m.totalNet, baseCurrency)}</span>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
