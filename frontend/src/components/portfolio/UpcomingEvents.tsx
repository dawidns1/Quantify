import { useState, useEffect } from 'react';
import { Calendar, Info, ChevronUp, ChevronDown, X } from 'lucide-react';
import { fetchUpcomingEvents } from '../../services/calculationService';
import type { Holding } from '../../types/portfolio';
import { useTranslation } from 'react-i18next';

interface UpcomingEventsProps {
  apiBaseUrl: string;
  activePortfolioId: string | null;
  session: any;
  holdings: Holding[];
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onClose?: () => void;
}

interface CorporateEvent {
  date: string;
  symbol: string;
  type: 'Dividend' | 'Earnings';
  description: string;
  est_payout?: number;
  currency?: string;
}

export function UpcomingEvents({
  apiBaseUrl,
  activePortfolioId,
  session,
  holdings,
  onMoveUp,
  onMoveDown,
  onClose
}: UpcomingEventsProps) {
  const { t, i18n } = useTranslation();
  const [events, setEvents] = useState<CorporateEvent[]>(() => {
    if (!activePortfolioId) return [];
    const cached = localStorage.getItem(`cached_upcoming_events_${activePortfolioId}`);
    return cached ? JSON.parse(cached) : [];
  });
  const [loading, setLoading] = useState(false);

  const symbolsKey = holdings.map(h => h.symbol.toUpperCase()).sort().join(',');

  useEffect(() => {
    if (!activePortfolioId) return;

    // Load from cache synchronously first
    const cached = localStorage.getItem(`cached_upcoming_events_${activePortfolioId}`);
    if (cached) {
      setEvents(JSON.parse(cached));
    }

    if (symbolsKey === '') {
      setEvents([]);
      return;
    }

    setLoading(true);
    const jwtToken = session?.access_token || null;
    
    // We assume default base currency is PLN, default account is All, link cash is true
    fetchUpcomingEvents(apiBaseUrl, jwtToken, activePortfolioId, 'PLN', 'All', true)
      .then((data) => {
        const eventsData = data || [];
        localStorage.setItem(`cached_upcoming_events_${activePortfolioId}`, JSON.stringify(eventsData));
        setEvents(eventsData);
      })
      .catch((err) => {
        console.error('Error fetching upcoming events:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [activePortfolioId, symbolsKey, apiBaseUrl, session?.access_token]);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const activeLang = i18n.language || 'en';
      return d.toLocaleDateString(activeLang, { month: 'short', day: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  };

  const getCurrencySymbol = (currency: string = 'USD') => {
    switch (currency.toUpperCase()) {
      case 'USD': return '$';
      case 'EUR': return '€';
      case 'PLN': return ' zł';
      default: return ` ${currency}`;
    }
  };

  const formatPayout = (amount: number, currency: string = 'USD') => {
    const symbol = getCurrencySymbol(currency);
    const formattedVal = amount.toFixed(2);
    if (currency.toUpperCase() === 'PLN') {
      return `${formattedVal}${symbol}`;
    }
    if (symbol.startsWith(' ')) {
      return `${formattedVal}${symbol}`;
    }
    return `${symbol}${formattedVal}`;
  };

  return (
    <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Calendar size={14} style={{ color: 'var(--color-primary)' }} /> {t('events.header', 'Upcoming Corporate Events')}
        </h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {onMoveUp && (
            <button 
              onClick={(e) => { e.stopPropagation(); onMoveUp(); }} 
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }} 
              title="Move Up" 
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'} 
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <ChevronUp size={14} />
            </button>
          )}
          {onMoveDown && (
            <button 
              onClick={(e) => { e.stopPropagation(); onMoveDown(); }} 
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }} 
              title="Move Down" 
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'} 
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <ChevronDown size={14} />
            </button>
          )}
          {onClose && (
            <button 
              onClick={(e) => { e.stopPropagation(); onClose(); }} 
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }} 
              title="Hide Card" 
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-red)'} 
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {loading && events.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0' }}>
              <div className="shimmer-placeholder" style={{ width: '45px', height: '18px', borderRadius: '4px' }} />
              <div className="shimmer-placeholder" style={{ width: '55px', height: '18px', borderRadius: '4px' }} />
              <div className="shimmer-placeholder" style={{ flex: 1, height: '14px', borderRadius: '4px' }} />
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.5rem', 
          padding: '0.75rem', 
          background: 'rgba(255, 255, 255, 0.02)', 
          border: '1px dashed var(--panel-border)', 
          borderRadius: '8px', 
          color: 'var(--text-muted)', 
          fontSize: '0.78rem',
          marginTop: '0.25rem'
        }}>
          <Info size={13} style={{ flexShrink: 0 }} />
          <span>{t('events.empty_state', 'No upcoming events found for active holdings.')}</span>
        </div>
      ) : (
        <div className="custom-scrollbar" style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '0.5rem', 
          maxHeight: '220px', 
          overflowY: 'auto', 
          paddingRight: '4px',
          marginTop: '0.25rem'
        }}>
          {events.map((event, idx) => {
            const isDividend = event.type === 'Dividend';
            return (
              <div 
                key={`${event.symbol}-${event.type}-${event.date}-${idx}`}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.75rem', 
                  padding: '0.45rem 0.6rem', 
                  background: 'rgba(255, 255, 255, 0.015)',
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                  borderRadius: '6px',
                  fontSize: '0.8rem'
                }}
              >
                {/* Date Badge */}
                <div style={{ 
                  fontSize: '0.72rem', 
                  fontWeight: 700, 
                  color: 'var(--text-secondary)',
                  width: '45px',
                  flexShrink: 0
                }}>
                  {formatDate(event.date)}
                </div>

                {/* Ticker Pill */}
                <div className="ticker-badge" style={{ 
                  fontWeight: 700, 
                  fontSize: '0.72rem',
                  padding: '0.15rem 0.4rem',
                  borderRadius: '4px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: 'var(--text-primary)',
                  width: '60px',
                  textAlign: 'center',
                  flexShrink: 0
                }}>
                  {event.symbol}
                </div>

                {/* Event Type Badge */}
                <div style={{ 
                  fontSize: '0.68rem', 
                  fontWeight: 600, 
                  padding: '0.1rem 0.35rem', 
                  borderRadius: '4px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.02em',
                  flexShrink: 0,
                  background: isDividend ? 'rgba(16, 185, 129, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                  color: isDividend ? 'var(--color-green)' : '#a78bfa',
                  border: isDividend ? '1px solid rgba(16, 185, 129, 0.15)' : '1px solid rgba(139, 92, 246, 0.15)'
                }}>
                  {isDividend ? t('events.ex_dividend', 'Ex-Dividend') : t('events.earnings_release', 'Earnings Release')}
                </div>

                {/* Description and Estimated Payout */}
                <div style={{ 
                  flex: 1, 
                  minWidth: 0, 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'nowrap',
                  color: 'var(--text-muted)',
                  fontSize: '0.76rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={event.description}>
                    {event.description}
                  </span>
                  {isDividend && event.est_payout !== undefined && event.est_payout !== null && (
                    <span style={{ 
                      fontWeight: 700, 
                      color: 'var(--color-green)',
                      fontSize: '0.76rem',
                      flexShrink: 0,
                      textShadow: '0 0 6px rgba(16, 185, 129, 0.15)'
                    }}>
                      {t('events.est', 'Est')}: {formatPayout(event.est_payout, event.currency)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
