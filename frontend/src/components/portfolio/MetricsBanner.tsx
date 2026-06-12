import { TrendingUp, TrendingDown } from 'lucide-react';
import type { Summary } from '../../types/portfolio';

interface MetricsBannerProps {
  summary: Summary;
}

export function MetricsBanner({ summary }: MetricsBannerProps) {
  const isProfit = summary.total_gain_base >= 0;

  const formatCurrency = (val: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="glass-panel" style={{
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
      background: 'linear-gradient(135deg, rgba(18, 24, 38, 0.65) 0%, rgba(13, 17, 28, 0.8) 100%)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
    }}>
      {/* Header */}
      <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: '0.5rem' }}>
        <TrendingUp size={16} style={{ color: 'var(--color-primary)' }} /> Portfolio Metrics
      </h4>

      {/* Net Asset Value (NAV) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
        <span className="metric-title" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
          Net Asset Value (NAV)
        </span>
        <span className="metric-value" style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'system-ui, sans-serif' }}>
          {formatCurrency(summary.total_value_base, summary.base_currency)}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.25rem' }}>
        {/* Day Return */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.04)', paddingTop: '0.6rem' }}>
          <span className="metric-title" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Day Return
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span className={`metric-value ${(summary.total_day_change_base || 0) >= 0 ? 'text-green' : 'text-red'}`} style={{ fontSize: '0.9rem', fontWeight: 700 }}>
              {(summary.total_day_change_base || 0) >= 0 ? '+' : ''}{formatCurrency(summary.total_day_change_base || 0, summary.base_currency)}
            </span>
            <span className={`badge ${(summary.total_day_change_base || 0) >= 0 ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
              {(summary.total_day_change_base || 0) >= 0 ? '+' : ''}{(summary.total_day_change_percent || 0).toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Total Return */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.04)', paddingTop: '0.6rem' }}>
          <span className="metric-title" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Total Return
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span className={`metric-value ${isProfit ? 'text-green' : 'text-red'}`} style={{ fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              {isProfit ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {formatCurrency(summary.total_gain_base, summary.base_currency)}
            </span>
            <span className={`badge ${isProfit ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
              {isProfit ? '+' : ''}{summary.total_gain_percent.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Cost Basis */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.04)', paddingTop: '0.6rem' }}>
          <span className="metric-title" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Total Cost Basis
          </span>
          <span className="metric-value" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {formatCurrency(summary.total_cost_base, summary.base_currency)}
          </span>
        </div>

        {/* Dividends */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderTop: '1px solid rgba(255, 255, 255, 0.04)', paddingTop: '0.6rem' }}>
          <span className="metric-title" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Dividends
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem' }}>
            <span className="metric-value text-green" style={{ fontSize: '0.9rem', fontWeight: 700 }}>
              {formatCurrency(summary.total_dividends_net_base || 0, summary.base_currency)}
            </span>
            {summary.total_dividends_base !== undefined && summary.total_dividends_base > 0 && (
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                Gross: {formatCurrency(summary.total_dividends_base, summary.base_currency)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
