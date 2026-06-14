import { useState, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface DividendCalendarProps {
  dividends: any[];
  baseCurrency: string;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onClose?: () => void;
}

export function DividendCalendar({ 
  dividends, 
  baseCurrency,
  onMoveUp,
  onMoveDown,
  onClose
}: DividendCalendarProps) {
  const { t, i18n } = useTranslation();
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());

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

  const maxMonthValue = useMemo(() => {
    const maxVal = Math.max(...monthlyData.map(m => m.totalNet), 0);
    return maxVal === 0 ? 1 : maxVal;
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
      padding: '1.25rem',
      background: 'linear-gradient(135deg, rgba(18, 24, 38, 0.6) 0%, rgba(13, 17, 28, 0.75) 100%)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem'
    }}>
      {/* Header with Year Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: '0.6rem' }}>
        <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <Calendar size={16} style={{ color: 'var(--color-primary)' }} />
          <span>{t('calendar.income_header', 'Dividend Income Calendar')}</span>
        </h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button 
              onClick={handlePrevYear} 
              disabled={availableYears.indexOf(selectedYear) === availableYears.length - 1}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px', opacity: availableYears.indexOf(selectedYear) === availableYears.length - 1 ? 0.3 : 1 }}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', minWidth: '40px', textAlign: 'center' }}>
              {selectedYear}
            </span>
            <button 
              onClick={handleNextYear} 
              disabled={availableYears.indexOf(selectedYear) === 0}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px', opacity: availableYears.indexOf(selectedYear) === 0 ? 0.3 : 1 }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {(onMoveUp || onMoveDown || onClose) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: '0.75rem' }}>
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
          )}
        </div>
      </div>

      {/* Yearly Summary Card */}
      <div style={{
        background: 'rgba(59, 130, 246, 0.04)',
        border: '1px dashed rgba(59, 130, 246, 0.25)',
        padding: '0.85rem 1rem',
        borderRadius: '8px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('calendar.yearly_cash_flow', 'Yearly Dividend Cash Flow')}</span>
          <span style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-green)', fontFamily: 'monospace' }}>
            {formatCurrency(yearlyTotal, baseCurrency)}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem' }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{t('calendar.avg_monthly_income', 'Avg. Monthly Income')}</span>
          <span style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
            {formatCurrency(yearlyTotal / 12, baseCurrency)}
          </span>
        </div>
      </div>

      {/* 12-Month Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', 
        gap: '0.75rem',
        marginTop: '0.25rem'
      }}>
        {monthlyData.map(m => {
          const heightPercent = (m.totalNet / maxMonthValue) * 100;
          const uniqueTickers = Array.from(new Set(m.payments.map(p => p.symbol.toUpperCase()))).slice(0, 3);
          const hasPayments = m.payments.length > 0;
          const isAllUpcoming = hasPayments && m.payments.every(p => p.is_upcoming);

          return (
            <div 
              key={m.index} 
              style={{
                background: hasPayments ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.005)',
                border: '1px solid rgba(255, 255, 255, 0.04)',
                borderRadius: '8px',
                padding: '0.65rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                position: 'relative',
                overflow: 'hidden',
                transition: 'var(--transition-smooth)'
              }}
              className="calendar-month-card"
            >
              {/* Mini chart bar at the bottom back */}
              {hasPayments && (
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: `${Math.max(4, heightPercent)}%`,
                  background: isAllUpcoming
                    ? 'linear-gradient(to top, rgba(16, 185, 129, 0.03), rgba(16, 185, 129, 0.005))'
                    : 'linear-gradient(to top, rgba(16, 185, 129, 0.08), rgba(16, 185, 129, 0.01))',
                  borderTop: isAllUpcoming
                    ? '1px dashed rgba(16, 185, 129, 0.25)'
                    : '1px solid rgba(16, 185, 129, 0.15)',
                  zIndex: 0,
                  pointerEvents: 'none'
                }} />
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: hasPayments ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {m.name}
                </span>
                {hasPayments && (
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', background: 'rgba(255, 255, 255, 0.05)', padding: '1px 4px', borderRadius: '3px' }}>
                    {m.payments.length}
                  </span>
                )}
              </div>

              <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                <span style={{ 
                  fontSize: '0.85rem', 
                  fontWeight: 700, 
                  color: hasPayments ? 'var(--color-green)' : 'var(--text-muted)', 
                  fontFamily: 'monospace',
                  opacity: isAllUpcoming ? 0.85 : 1
                }}>
                  {m.totalNet > 0 ? formatCurrency(m.totalNet, baseCurrency) : '—'}
                  {isAllUpcoming && <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginLeft: '3px', fontWeight: 500 }}>est.</span>}
                </span>
                
                {hasPayments && (
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', display: 'flex', gap: '2px', flexWrap: 'wrap', marginTop: '2px' }}>
                    {uniqueTickers.join(', ')}
                    {uniqueTickers.length < m.payments.length && '...'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
