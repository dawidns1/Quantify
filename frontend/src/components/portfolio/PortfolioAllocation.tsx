import { useMemo, memo } from 'react';
import { PieChart, Coins, Globe, Layers, ChevronUp, ChevronDown, X, Scale } from 'lucide-react';
import type { Holding, Summary } from '../../types/portfolio';
import { useTranslation } from 'react-i18next';

interface PortfolioAllocationProps {
  holdings: Holding[];
  summary: Summary;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onClose?: () => void;
  onRebalanceClick?: () => void;
}

export const PortfolioAllocation = memo(function PortfolioAllocation({ 
  holdings, 
  summary,
  onMoveUp,
  onMoveDown,
  onClose,
  onRebalanceClick
}: PortfolioAllocationProps) {
  const { t } = useTranslation();

  // Client-side calculations for allocations
  const { assets, currencies, countries, assetClasses } = useMemo(() => {
    const totalValue = summary.total_value_base || 1; // avoid division by zero
    
    const assetAllocMap: { [key: string]: number } = {};
    const currencyAllocMap: { [key: string]: number } = {};
    const countryAllocMap: { [key: string]: number } = {};
    const assetClassAllocMap: { [key: string]: number } = {};

    holdings.forEach((h) => {
      const val = h.current_value_base;
      
      // 1. Assets
      assetAllocMap[h.symbol] = (assetAllocMap[h.symbol] || 0) + val;
      
      // 2. Currencies
      currencyAllocMap[h.currency] = (currencyAllocMap[h.currency] || 0) + val;
      
      // 3. Country / Market
      let country = 'USA';
      if (h.symbol.endsWith('.WA')) country = 'Poland';
      else if (h.symbol.endsWith('.DE')) country = 'Germany';
      
      countryAllocMap[country] = (countryAllocMap[country] || 0) + val;
      
      // 4. Asset Class
      const cls = h.asset_class || 'Equity';
      assetClassAllocMap[cls] = (assetClassAllocMap[cls] || 0) + val;
    });

    const assetsList = Object.entries(assetAllocMap)
      .map(([name, val]) => ({ name, percentage: (val / totalValue) * 100, val }))
      .sort((a, b) => b.percentage - a.percentage);

    const currenciesList = Object.entries(currencyAllocMap)
      .map(([name, val]) => ({ name, percentage: (val / totalValue) * 100, val }))
      .sort((a, b) => b.percentage - a.percentage);

    const countriesList = Object.entries(countryAllocMap)
      .map(([name, val]) => ({ name, percentage: (val / totalValue) * 100, val }))
      .sort((a, b) => b.percentage - a.percentage);

    const assetClassesList = Object.entries(assetClassAllocMap)
      .map(([name, val]) => ({ name, percentage: (val / totalValue) * 100, val }))
      .sort((a, b) => b.percentage - a.percentage);

    return { 
      assets: assetsList, 
      currencies: currenciesList, 
      countries: countriesList,
      assetClasses: assetClassesList 
    };
  }, [holdings, summary.total_value_base]);

  return (
    <div className="glass-panel allocation-section" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="portfolio-section-title" style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <PieChart size={16} className="gradient-text" /> {t('allocation.title', 'Portfolio Allocation')}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {onRebalanceClick && (
            <button 
              onClick={(e) => { e.stopPropagation(); onRebalanceClick(); }} 
              style={{ 
                background: 'rgba(6, 182, 212, 0.08)', 
                border: '1px solid rgba(6, 182, 212, 0.25)', 
                color: 'var(--color-primary)', 
                cursor: 'pointer', 
                padding: '2px 8px', 
                borderRadius: '4px',
                display: 'flex', 
                alignItems: 'center',
                gap: '0.25rem',
                fontSize: '0.7rem',
                fontWeight: 600,
                marginRight: '0.25rem',
                transition: 'all 0.2s'
              }} 
              title={t('holdings.btn_rebalance', 'Rebalance')}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(6, 182, 212, 0.16)';
                e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.45)';
              }} 
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(6, 182, 212, 0.08)';
                e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.25)';
              }}
            >
              <Scale size={11} />
              <span>{t('holdings.btn_rebalance', 'Rebalance')}</span>
            </button>
          )}
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
      
      {holdings.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          <PieChart size={32} style={{ strokeWidth: 1, marginBottom: '0.5rem', opacity: 0.5 }} />
          <p>{t('allocation.no_data', 'Add holdings to display allocation weights.')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Asset Classes Allocation */}
          <div>
            <h4 className="allocation-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
              <Layers size={13} /> {t('allocation.by_class', 'By Asset Class')}
            </h4>
            <div className="allocation-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginTop: '0.4rem' }}>
              {assetClasses.map((item) => (
                <div key={item.name} className="allocation-item">
                  <div className="allocation-label" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span>{item.name === 'Equity' ? t('holdings.class_equity', 'Equity') : item.name === 'Cash' ? t('holdings.class_cash', 'Cash') : item.name === 'ETF' ? t('holdings.class_etf', 'ETF') : item.name}</span>
                    <span className="percentage-val" style={{ fontWeight: 600 }}>{item.percentage.toFixed(1)}%</span>
                  </div>
                  <div className="allocation-track" style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div 
                      className="allocation-fill asset-class-color" 
                      style={{ 
                        height: '100%',
                        width: `${item.percentage}%`,
                        background: item.name === 'Equity' ? 'hsl(217, 91%, 60%)' : item.name === 'ETF' ? 'hsl(263, 90%, 65%)' : item.name === 'Cash' ? 'hsl(142, 70%, 45%)' : 'hsl(45, 90%, 60%)',
                        borderRadius: '3px',
                        transition: 'width 0.4s ease-out'
                      }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Asset Tickers Allocation */}
          <div>
            <h4 className="allocation-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
              <PieChart size={13} /> {t('allocation.by_ticker', 'By Asset Ticker')}
            </h4>
            <div className="allocation-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginTop: '0.4rem' }}>
              {assets.slice(0, 5).map((item) => (
                <div key={item.name} className="allocation-item">
                  <div className="allocation-label" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span>{item.name}</span>
                    <span className="percentage-val" style={{ fontWeight: 600 }}>{item.percentage.toFixed(1)}%</span>
                  </div>
                  <div className="allocation-track" style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div 
                      className="allocation-fill asset-color" 
                      style={{ 
                        height: '100%',
                        width: `${item.percentage}%`,
                        borderRadius: '3px',
                        transition: 'width 0.4s ease-out'
                      }}
                    ></div>
                  </div>
                </div>
              ))}
              {assets.length > 5 && (
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                  {t('allocation.more_tickers', '+ {{count}} more tickers', { count: assets.length - 5 })}
                </div>
              )}
            </div>
          </div>

          {/* Currency Allocation */}
          <div>
            <h4 className="allocation-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
              <Coins size={13} /> {t('allocation.by_currency', 'By Currency')}
            </h4>
            <div className="allocation-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginTop: '0.4rem' }}>
              {currencies.map((item) => (
                <div key={item.name} className="allocation-item">
                  <div className="allocation-label" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span>{item.name}</span>
                    <span className="percentage-val" style={{ fontWeight: 600 }}>{item.percentage.toFixed(1)}%</span>
                  </div>
                  <div className="allocation-track" style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div 
                      className="allocation-fill currency-color" 
                      style={{ 
                        height: '100%',
                        width: `${item.percentage}%`,
                        background: item.name === 'USD' ? 'hsl(217, 91%, 60%)' : item.name === 'EUR' ? 'hsl(263, 90%, 65%)' : 'hsl(142, 70%, 45%)',
                        borderRadius: '3px',
                        transition: 'width 0.4s ease-out'
                      }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Geographic Allocation */}
          <div>
            <h4 className="allocation-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
              <Globe size={13} /> {t('allocation.by_market', 'By Market / Exchange')}
            </h4>
            <div className="allocation-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginTop: '0.4rem' }}>
              {countries.map((item) => (
                <div key={item.name} className="allocation-item">
                  <div className="allocation-label" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span>{item.name === 'USA' ? t('allocation.usa', 'USA') : item.name === 'Poland' ? t('allocation.poland', 'Poland') : item.name === 'Germany' ? t('allocation.germany', 'Germany') : item.name}</span>
                    <span className="percentage-val" style={{ fontWeight: 600 }}>{item.percentage.toFixed(1)}%</span>
                  </div>
                  <div className="allocation-track" style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div 
                      className="allocation-fill country-color" 
                      style={{ 
                        height: '100%',
                        width: `${item.percentage}%`,
                        background: item.name === 'USA' ? 'hsl(217, 91%, 60%)' : item.name === 'Poland' ? 'hsl(142, 70%, 45%)' : 'hsl(263, 90%, 65%)',
                        borderRadius: '3px',
                        transition: 'width 0.4s ease-out'
                      }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
