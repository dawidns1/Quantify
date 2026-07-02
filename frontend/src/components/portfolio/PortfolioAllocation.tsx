import { useState, useMemo, memo } from 'react';
import { PieChart, ChevronUp, ChevronDown, X, Scale } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'class' | 'ticker' | 'currency' | 'market'>('class');

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

  const COLORS = [
    'hsl(192, 95%, 50%)', // cyan
    'hsl(263, 90%, 65%)', // purple
    'hsl(142, 70%, 45%)', // green
    'hsl(45, 90%, 60%)',  // amber
    'hsl(326, 90%, 60%)', // pink
    'hsl(217, 91%, 60%)', // blue
    'hsl(15, 90%, 60%)'   // orange
  ];

  interface ChartItem {
    name: string;
    percentage: number;
    val: number;
    color: string;
  }

  const chartItems = useMemo<ChartItem[]>(() => {
    let list: { name: string; percentage: number; val: number }[] = [];
    if (activeTab === 'class') list = assetClasses;
    else if (activeTab === 'ticker') list = assets;
    else if (activeTab === 'currency') list = currencies;
    else if (activeTab === 'market') list = countries;
    
    return list.map((item, idx) => {
      let color = COLORS[idx % COLORS.length];
      if (activeTab === 'class') {
        if (item.name === 'Equity') color = 'hsl(217, 91%, 60%)';
        else if (item.name === 'ETF') color = 'hsl(263, 90%, 65%)';
        else if (item.name === 'Cash') color = 'hsl(142, 70%, 45%)';
      } else if (activeTab === 'currency') {
        if (item.name === 'USD') color = 'hsl(217, 91%, 60%)';
        else if (item.name === 'EUR') color = 'hsl(263, 90%, 65%)';
        else if (item.name === 'PLN') color = 'hsl(142, 70%, 45%)';
      }
      return { ...item, color };
    });
  }, [activeTab, assetClasses, assets, currencies, countries]);

  // Magic circle radius has 100px circumference (r = 15.915)
  const renderDoughnut = () => {
    if (chartItems.length === 0) {
      return (
        <svg width="110" height="110" viewBox="0 0 42 42" style={{ transform: 'rotate(-90deg)', filter: 'drop-shadow(0px 4px 10px rgba(0,0,0,0.3))' }}>
          <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="4.2" />
        </svg>
      );
    }
    
    let accumulatedPercent = 0;
    return (
      <svg width="110" height="110" viewBox="0 0 42 42" style={{ transform: 'rotate(-90deg)', filter: 'drop-shadow(0px 4px 12px rgba(0,0,0,0.35))' }}>
        <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="rgba(255,255,255,0.02)" strokeWidth="4.2" />
        {chartItems.map((item, idx) => {
          const strokeDasharray = `${item.percentage} ${100 - item.percentage}`;
          const strokeDashoffset = 100 - accumulatedPercent;
          accumulatedPercent += item.percentage;
          
          return (
            <circle
              key={idx}
              cx="21"
              cy="21"
              r="15.915"
              fill="transparent"
              stroke={item.color}
              strokeWidth="4.2"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: 'stroke-dashoffset 0.4s ease' }}
            />
          );
        })}
      </svg>
    );
  };

  return (
    <div className="glass-panel allocation-section" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', padding: '1rem', height: '100%' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
          {/* Tab switches */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '2px', gap: '2px' }}>
            {[
              { id: 'class', label: t('allocation.by_class', 'Asset Class') },
              { id: 'ticker', label: t('allocation.by_ticker', 'Tickers') },
              { id: 'currency', label: t('allocation.by_currency', 'Currency') },
              { id: 'market', label: t('allocation.by_market', 'Market') }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  flex: 1,
                  background: activeTab === tab.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                  border: 'none',
                  color: activeTab === tab.id ? 'white' : 'var(--text-secondary)',
                  padding: '4px 6px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Allocation Content Layout */}
          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap', flex: 1, minHeight: 0 }}>
            {/* Left: SVG Doughnut Chart */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', width: '110px', height: '110px', flexShrink: 0, margin: '0.25rem auto' }}>
              {renderDoughnut()}
              {/* Inner label */}
              <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Assets</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'white' }}>{holdings.length}</span>
              </div>
            </div>

            {/* Right: Legend bars */}
            <div 
              className="custom-scrollbar"
              style={{ 
                flex: 1, 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '0.5rem', 
                minWidth: '160px',
                maxHeight: '120px',
                overflowY: 'auto',
                paddingRight: '6.5px'
              }}
            >
              {chartItems.map((item) => (
                <div key={item.name} className="allocation-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', alignItems: 'center', marginBottom: '2px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)' }}>
                      <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: item.color }}></span>
                      {activeTab === 'class'
                        ? (item.name === 'Equity' ? t('holdings.class_equity', 'Equity') : item.name === 'Cash' ? t('holdings.class_cash', 'Cash') : item.name === 'ETF' ? t('holdings.class_etf', 'ETF') : item.name)
                        : activeTab === 'market'
                        ? (item.name === 'USA' ? t('allocation.usa', 'USA') : item.name === 'Poland' ? t('allocation.poland', 'Poland') : item.name === 'Germany' ? t('allocation.germany', 'Germany') : item.name)
                        : item.name
                      }
                    </span>
                    <span style={{ fontWeight: 700, color: 'white' }}>{item.percentage.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: '4px', background: 'rgba(255,255,255,0.04)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div 
                      style={{ 
                        height: '100%', 
                        width: `${item.percentage}%`, 
                        background: item.color, 
                        borderRadius: '2px',
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
