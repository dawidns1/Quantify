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
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '1.25rem 1.75rem',
      background: 'linear-gradient(135deg, rgba(18, 24, 38, 0.65) 0%, rgba(13, 17, 28, 0.8) 100%)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
      gap: '1.5rem',
      flexWrap: 'wrap',
      marginBottom: '1rem'
    }}>
      {/* Left: NAV / Value */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <span className="metric-title" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
          Net Asset Value (NAV)
        </span>
        <span className="metric-value" style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'system-ui, sans-serif' }}>
          {formatCurrency(summary.total_value_base, summary.base_currency)}
        </span>
      </div>

      {/* Middle: Returns */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: '150px' }}>
        <span className="metric-title" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
          Total Return
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span className={`metric-value ${isProfit ? 'text-green' : 'text-red'}`} style={{ fontSize: '1.3rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {isProfit ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            {formatCurrency(summary.total_gain_base, summary.base_currency)}
          </span>
          <span className={`badge ${isProfit ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
            {isProfit ? '+' : ''}{summary.total_gain_percent.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Right: Cost Basis */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <span className="metric-title" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
          Total Cost Basis
        </span>
        <span className="metric-value" style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
          {formatCurrency(summary.total_cost_base, summary.base_currency)}
        </span>
      </div>
    </div>
  );
}
