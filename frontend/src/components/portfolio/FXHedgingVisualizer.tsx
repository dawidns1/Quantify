import { Globe, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Holding } from '../../types/portfolio';

interface FXHedgingVisualizerProps {
  holding: Holding;
  baseCurrency: string;
}

export function FXHedgingVisualizer({ holding, baseCurrency }: FXHedgingVisualizerProps) {
  const { t, i18n } = useTranslation();
  const isForeign = holding.currency.toUpperCase() !== baseCurrency.toUpperCase();
  
  // Implied purchase FX rate
  const totalLocalCost = holding.shares * holding.avg_cost_local;
  const purchaseFxRate = totalLocalCost > 0 ? holding.cost_basis_base / totalLocalCost : holding.fx_rate;
  const currentFxRate = holding.fx_rate;
  
  // Math decomposition of total return
  // current_value_base = shares * current_price_local * currentFxRate
  // valueAtPurchaseFx = shares * current_price_local * purchaseFxRate
  const valueAtPurchaseFx = holding.shares * holding.current_price_local * purchaseFxRate;
  
  const assetGainBase = valueAtPurchaseFx - holding.cost_basis_base;
  const fxGainBase = holding.current_value_base - valueAtPurchaseFx;
  const totalGainBase = holding.gain_base;

  // Percentage calculations
  const totalAbs = Math.abs(assetGainBase) + Math.abs(fxGainBase);
  const assetShare = totalAbs > 0 ? (Math.abs(assetGainBase) / totalAbs) * 100 : 100;
  const fxShare = totalAbs > 0 ? (Math.abs(fxGainBase) / totalAbs) * 100 : 0;

  const formatCurrency = (val: number, currency: string) => {
    return new Intl.NumberFormat(i18n.language || 'en', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const fxChangePercent = purchaseFxRate > 0 ? ((currentFxRate - purchaseFxRate) / purchaseFxRate) * 100 : 0;

  return (
    <div className="glass-panel" style={{
      padding: '1rem 1.25rem',
      background: 'rgba(30, 41, 59, 0.35)',
      border: '1px solid rgba(255, 255, 255, 0.06)',
      borderRadius: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.85rem',
      marginTop: '0.5rem'
    }}>
      <h4 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
        <Globe size={18} className="gradient-text" style={{ flexShrink: 0 }} />
        <span>{t('fx.header')}</span>
      </h4>

      {!isForeign ? (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ShieldAlert size={14} style={{ color: 'var(--text-muted)' }} />
          <span>{t('fx.no_exposure', { currency: baseCurrency })}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          
          {/* FX Rates Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{t('fx.avg_purchase_rate')}</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                1 {holding.currency} = {purchaseFxRate.toFixed(4)} {baseCurrency}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{t('fx.current_spot_rate')}</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                1 {holding.currency} = {currentFxRate.toFixed(4)} {baseCurrency}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{t('fx.exchange_rate_return')}</span>
              <span style={{ 
                fontSize: '0.9rem', 
                fontWeight: 700, 
                fontFamily: 'monospace',
                color: fxChangePercent >= 0 ? 'var(--color-green)' : 'var(--color-red)'
               }}>
                {fxChangePercent >= 0 ? '+' : ''}{fxChangePercent.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Progress Exposure Split Bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.2rem' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('fx.decomposition_total_return', { value: formatCurrency(totalGainBase, baseCurrency) })}</span>
              <span>{t('fx.progress_label', { stockShare: assetShare.toFixed(0), fxShare: fxShare.toFixed(0) })}</span>
            </span>
            <div style={{ height: '8px', borderRadius: '4px', display: 'flex', overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
              <div 
                style={{ 
                  width: `${assetShare}%`, 
                  background: assetGainBase >= 0 ? 'var(--color-primary)' : 'rgba(59, 130, 246, 0.4)',
                  transition: 'width 0.4s ease'
                }} 
                title={t('fx.asset_gain_title', { value: formatCurrency(assetGainBase, baseCurrency) }) || ''}
              />
              <div 
                style={{ 
                  width: `${100 - assetShare}%`, 
                  background: fxGainBase >= 0 ? 'var(--color-green)' : 'var(--color-red)',
                  transition: 'width 0.4s ease'
                }} 
                title={t('fx.fx_gain_title', { value: formatCurrency(fxGainBase, baseCurrency) }) || ''}
              />
            </div>
          </div>

          {/* Breakdown numbers */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-primary)' }} />
              <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                {t('fx.stock_return')}: <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{formatCurrency(assetGainBase, baseCurrency)}</strong>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: fxGainBase >= 0 ? 'var(--color-green)' : 'var(--color-red)' }} />
              <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                {t('fx.fx_return')}: <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{formatCurrency(fxGainBase, baseCurrency)}</strong>
              </span>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
