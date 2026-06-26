import { useState, useMemo, useEffect, useRef } from 'react';
import { Briefcase, SlidersHorizontal } from 'lucide-react';
import type { Holding, Summary } from '../../types/portfolio';
import { useTranslation } from 'react-i18next';
import { AnimateOnChange } from './AnimateOnChange';

interface HoldingsTableProps {
  holdings: Holding[];
  summary: Summary;
  activePortfolioRole: string;
  onQuickAction: (symbol: string, type: 'BUY' | 'SELL') => void;
  onSelectPositionSymbol: (symbol: string) => void;
  onScrollToBottomChange?: (isAtBottom: boolean) => void;
}

export function HoldingsTable({
  holdings,
  summary,
  activePortfolioRole,
  onQuickAction,
  onSelectPositionSymbol,
  onScrollToBottomChange
}: HoldingsTableProps) {
  const { t } = useTranslation();

  // Column width resizing states
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      const cached = localStorage.getItem('portfolio_holdings_col_widths');
      return cached ? JSON.parse(cached) : {};
    } catch (e) {
      return {};
    }
  });

  const activeDragCol = useRef<string | null>(null);
  const startX = useRef<number>(0);
  const startWidth = useRef<number>(0);

  const handleMouseDown = (e: React.MouseEvent, colId: string) => {
    e.preventDefault();
    e.stopPropagation();
    activeDragCol.current = colId;
    startX.current = e.clientX;
    const thElement = (e.target as HTMLElement).closest('th');
    if (thElement) {
      startWidth.current = thElement.getBoundingClientRect().width;
    }
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!activeDragCol.current) return;
    const deltaX = e.clientX - startX.current;
    const newWidth = Math.max(50, startWidth.current + deltaX);
    setColWidths((prev) => {
      const next = { ...prev, [activeDragCol.current!]: newWidth };
      localStorage.setItem('portfolio_holdings_col_widths', JSON.stringify(next));
      return next;
    });
  };

  const handleMouseUp = () => {
    activeDragCol.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Sorting states
  const [holdingsSortField, setHoldingsSortField] = useState<string>(() => {
    return localStorage.getItem('portfolio_holdings_sort_field') || 'symbol';
  });
  const [holdingsSortAsc, setHoldingsSortAsc] = useState<boolean>(() => {
    return localStorage.getItem('portfolio_holdings_sort_asc') !== 'false';
  });

  // Customizable Columns states
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const wasAtBottomRef = useRef(false);

  useEffect(() => {
    wasAtBottomRef.current = false;
    if (onScrollToBottomChange) {
      onScrollToBottomChange(false);
    }
  }, [holdings.length, onScrollToBottomChange]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isScrollable = target.scrollHeight > target.clientHeight;
    const isAtBottom = isScrollable && (target.scrollHeight - target.scrollTop <= target.clientHeight + 10);
    if (isAtBottom !== wasAtBottomRef.current) {
      wasAtBottomRef.current = isAtBottom;
      if (onScrollToBottomChange) {
        onScrollToBottomChange(isAtBottom);
      }
    }
  };

  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [visibleColumnsDesktop, setVisibleColumnsDesktop] = useState<string[]>(() => {
    const cached = localStorage.getItem('portfolio_visible_columns_desktop');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return ['name', 'shares', 'price', 'sparkline', 'day_change', 'cost'];
  });

  const [visibleColumnsMobile, setVisibleColumnsMobile] = useState<string[]>(() => {
    const cached = localStorage.getItem('portfolio_visible_columns_mobile');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return ['price', 'day_change'];
  });

  const visibleColumns = isMobile ? visibleColumnsMobile : visibleColumnsDesktop;

  const toggleColumn = (id: string) => {
    if (isMobile) {
      setVisibleColumnsMobile((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        localStorage.setItem('portfolio_visible_columns_mobile', JSON.stringify(next));
        return next;
      });
    } else {
      setVisibleColumnsDesktop((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        localStorage.setItem('portfolio_visible_columns_desktop', JSON.stringify(next));
        return next;
      });
    }
  };

  const moveColumn = (id: string, direction: 'left' | 'right') => {
    const columns = isMobile ? visibleColumnsMobile : visibleColumnsDesktop;
    const setColumns = isMobile ? setVisibleColumnsMobile : setVisibleColumnsDesktop;
    const storageKey = isMobile ? 'portfolio_visible_columns_mobile' : 'portfolio_visible_columns_desktop';

    const idx = columns.indexOf(id);
    if (idx === -1) return;
    const nextIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (nextIdx < 0 || nextIdx >= columns.length) return;

    const next = [...columns];
    const temp = next[idx];
    next[idx] = next[nextIdx];
    next[nextIdx] = temp;

    setColumns(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const formatCurrency = (val: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const formatShares = (shares: number) => {
    return (Math.round(shares * 10000) / 10000).toString();
  };

  // Metadata definition for customizable columns
  const columnsMeta: Record<string, {
    label: string;
    sortField: string;
    align: 'left' | 'right' | 'center';
    renderHeader: (baseCurrency: string) => React.ReactNode;
    renderCell: (h: Holding, baseCurrency: string) => React.ReactNode;
  }> = {
    name: {
      label: t('holdings.col_name', 'Company Name'),
      sortField: 'name',
      align: 'left',
      renderHeader: () => t('holdings.col_name', 'Company Name'),
      renderCell: (h) => (
        <span style={{ color: 'var(--text-secondary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h.name}>
          {h.name}
        </span>
      )
    },
    sparkline: {
      label: t('holdings.col_trend', 'Trend'),
      sortField: 'symbol',
      align: 'center',
      renderHeader: () => t('holdings.trend_days', 'Trend (15d)'),
      renderCell: (h) => {
        if (!h.sparkline_prices || h.sparkline_prices.length < 2) {
          return <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>;
        }
        
        const prices = h.sparkline_prices;
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const range = max - min || 1;
        
        const width = 80;
        const height = 24;
        const padding = 2;
        
        const points = prices.map((price, idx) => {
          const x = padding + (idx / (prices.length - 1)) * (width - padding * 2);
          const y = padding + (1 - (price - min) / range) * (height - padding * 2);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');
 
        const isUp = prices[prices.length - 1] >= prices[0];
        const color = isUp ? 'var(--color-green)' : 'var(--color-red)';
        const glowId = `sparkline-glow-${h.symbol.replace(/[^a-zA-Z0-9]/g, '')}`;
 
        return (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <svg width={width} height={height} style={{ overflow: 'visible' }}>
              <defs>
                <linearGradient id={glowId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d={`M ${padding},${height} L ${points} L ${width - padding},${height} Z`}
                fill={`url(#${glowId})`}
              />
              <polyline
                fill="none"
                stroke={color}
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points}
                style={{
                  filter: `drop-shadow(0px 1px 3px ${color}40)`
                }}
              />
              <circle
                cx={padding + (prices.length - 1) * ((width - padding * 2) / (prices.length - 1))}
                cy={padding + (1 - (prices[prices.length - 1] - min) / range) * (height - padding * 2)}
                r="2.5"
                fill={color}
                style={{
                  filter: `drop-shadow(0px 0px 3px ${color})`
                }}
              />
            </svg>
          </div>
        );
      }
    },
    shares: {
      label: t('holdings.col_shares_owned', 'Shares Owned'),
      sortField: 'shares',
      align: 'right',
      renderHeader: () => t('holdings.col_shares', 'Shares'),
      renderCell: (h) => (
        <AnimateOnChange value={h.shares} contextId={h.symbol}>
          {formatShares(h.shares)}
        </AnimateOnChange>
      )
    },
    avg_cost: {
      label: t('holdings.col_avg_cost', 'Average Cost'),
      sortField: 'avg_cost_local',
      align: 'right',
      renderHeader: () => t('holdings.col_avg_price', 'Avg Cost'),
      renderCell: (h) => (
        <AnimateOnChange value={h.avg_cost_local} contextId={h.symbol}>
          {formatCurrency(h.avg_cost_local, h.currency)}
        </AnimateOnChange>
      )
    },
    price: {
      label: t('holdings.col_local_price', 'Current Price'),
      sortField: 'current_price_local',
      align: 'right',
      renderHeader: () => t('holdings.col_cur_price', 'Current Price'),
      renderCell: (h) => (
        <AnimateOnChange value={h.current_price_local} contextId={h.symbol}>
          {formatCurrency(h.current_price_local, h.currency)}
        </AnimateOnChange>
      )
    },
    cost: {
      label: t('holdings.col_cost_basis', 'Cost Basis'),
      sortField: 'cost_basis_base',
      align: 'right',
      renderHeader: (baseCurrency) => `${t('holdings.col_cost_basis', 'Cost Basis')} (${baseCurrency})`,
      renderCell: (h, baseCurrency) => (
        <AnimateOnChange value={h.cost_basis_base} contextId={h.symbol}>
          {formatCurrency(h.cost_basis_base, baseCurrency)}
        </AnimateOnChange>
      )
    },
    dividends: {
      label: t('holdings.col_dividends_net', 'Net Dividends'),
      sortField: 'dividends_net_base',
      align: 'right',
      renderHeader: () => t('holdings.col_dividends_net', 'Net Dividends'),
      renderCell: (h, baseCurrency) => (
        <span title={`${t('metrics.gross', 'Gross')}: ${formatCurrency(h.dividends_base || 0, baseCurrency)}`} style={{ color: 'var(--color-green)' }}>
          <AnimateOnChange value={h.dividends_net_base} contextId={h.symbol}>
            {formatCurrency(h.dividends_net_base || 0, baseCurrency)}
          </AnimateOnChange>
        </span>
      )
    },
    day_change: {
      label: t('holdings.col_day_change', 'Day Change'),
      sortField: 'day_change_percent',
      align: 'right',
      renderHeader: () => t('holdings.col_day_change', 'Day Change'),
      renderCell: (h, baseCurrency) => {
        return h.day_change_percent !== undefined ? (
          <AnimateOnChange value={h.day_change_percent} contextId={h.symbol} style={{ display: 'block' }}>
            <div className={h.day_change_percent >= 0 ? 'text-green' : 'text-red'} style={{ fontWeight: 600 }}>
              {h.day_change_percent >= 0 ? '+' : ''}{h.day_change_percent.toFixed(2)}%
            </div>
            <div style={{ fontSize: '0.72rem' }} className={h.day_change_percent >= 0 ? 'text-green' : 'text-red'}>
              {h.day_change_percent >= 0 ? '+' : ''}{formatCurrency(h.day_change_value_base || 0, baseCurrency)}
            </div>
          </AnimateOnChange>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        );
      }
    },
    asset_class: {
      label: t('holdings.col_asset_class', 'Asset Class'),
      sortField: 'asset_class',
      align: 'left',
      renderHeader: () => t('holdings.col_asset_class', 'Class'),
      renderCell: (h) => (
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
          {h.asset_class === 'Cash' ? t('holdings.class_cash', 'Cash') : (h.asset_class || t('holdings.class_equity', 'Equity'))}
        </span>
      )
    },
    weight: {
      label: t('holdings.col_allocation', 'Allocation'),
      sortField: 'current_value_base',
      align: 'right',
      renderHeader: () => t('holdings.col_allocation', 'Allocation'),
      renderCell: (h) => {
        const total = summary.total_value_base || 1;
        const wt = (h.current_value_base / total) * 100;
        return (
          <AnimateOnChange value={wt} contextId={h.symbol}>
            <span style={{ fontFamily: 'monospace' }}>{wt.toFixed(2)}%</span>
          </AnimateOnChange>
        );
      }
    },
    fx_rate: {
      label: t('holdings.col_fx_rate', 'FX Rate'),
      sortField: 'fx_rate',
      align: 'right',
      renderHeader: () => t('holdings.col_fx_rate', 'FX Rate'),
      renderCell: (h) => (
        <AnimateOnChange value={h.fx_rate} contextId={h.symbol}>
          <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{h.fx_rate?.toFixed(4) || '1.0000'}</span>
        </AnimateOnChange>
      )
    }
  };

  const columnGroups = [
    {
      name: t('holdings.group_basic', 'Basic Info'),
      items: [
        { id: 'name', label: t('holdings.col_name', 'Company Name') },
        { id: 'asset_class', label: t('holdings.col_asset_class', 'Asset Class') },
        { id: 'sparkline', label: t('holdings.col_trend', 'Trend') }
      ]
    },
    {
      name: t('holdings.group_position', 'Position Info'),
      items: [
        { id: 'shares', label: t('holdings.col_shares_owned', 'Shares Owned') },
        { id: 'weight', label: t('holdings.col_allocation', 'Allocation') }
      ]
    },
    {
      name: t('holdings.group_valuation', 'Valuation'),
      items: [
        { id: 'price', label: t('holdings.col_local_price', 'Current Price') },
        { id: 'avg_cost', label: t('holdings.col_avg_cost', 'Average Cost') },
        { id: 'cost', label: t('holdings.col_cost_basis', 'Cost Basis') },
        { id: 'fx_rate', label: t('holdings.col_fx_rate', 'FX Rate') }
      ]
    },
    {
      name: t('holdings.group_returns', 'Returns'),
      items: [
        { id: 'day_change', label: t('holdings.col_day_change', 'Day Change') },
        { id: 'dividends', label: t('holdings.col_dividends_net', 'Net Dividends') }
      ]
    }
  ];

  // Sort holdings according to selected field & direction
  const sortedHoldings = useMemo(() => {
    const sorted = [...holdings];
    sorted.sort((a, b) => {
      const field = holdingsSortField;
      
      let valA: any;
      let valB: any;

      if (field === 'symbol') {
        valA = a.symbol;
        valB = b.symbol;
      } else if (field === 'current_value_base') {
        valA = a.current_value_base;
        valB = b.current_value_base;
      } else if (field === 'gain_base') {
        valA = a.gain_base;
        valB = b.gain_base;
      } else if (columnsMeta[field]) {
        // Resolve based on sortField in meta
        const sf = columnsMeta[field].sortField as keyof Holding;
        valA = a[sf];
        valB = b[sf];
      } else {
        valA = a.symbol;
        valB = b.symbol;
      }

      if (valA === undefined || valA === null) return holdingsSortAsc ? 1 : -1;
      if (valB === undefined || valB === null) return holdingsSortAsc ? -1 : 1;

      if (typeof valA === 'string' && typeof valB === 'string') {
        const comp = valA.localeCompare(valB, undefined, { sensitivity: 'base' });
        return holdingsSortAsc ? comp : -comp;
      }

      return holdingsSortAsc 
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number);
    });
    return sorted;
  }, [holdings, holdingsSortField, holdingsSortAsc]);

  const handleHoldingsSort = (field: string) => {
    if (holdingsSortField === field) {
      const nextAsc = !holdingsSortAsc;
      setHoldingsSortAsc(nextAsc);
      localStorage.setItem('portfolio_holdings_sort_asc', String(nextAsc));
    } else {
      setHoldingsSortField(field);
      const defaultAsc = ['symbol', 'name', 'asset_class'].includes(field);
      setHoldingsSortAsc(defaultAsc);
      localStorage.setItem('portfolio_holdings_sort_field', field);
      localStorage.setItem('portfolio_holdings_sort_asc', String(defaultAsc));
    }
  };

  const renderSortArrow = (field: string) => {
    if (holdingsSortField !== field) {
      return <span style={{ opacity: 0.25, marginLeft: '6px', fontSize: '0.8rem' }}>↕</span>;
    }
    return holdingsSortAsc ? (
      <span style={{ color: 'var(--color-primary)', marginLeft: '6px', fontSize: '0.8rem' }}>▲</span>
    ) : (
      <span style={{ color: 'var(--color-primary)', marginLeft: '6px', fontSize: '0.8rem' }}>▼</span>
    );
  };

  return (
    <div className={!isMobile ? "glass-panel" : ""} style={{
      display: 'flex',
      flexDirection: 'column',
      gap: isMobile ? '0.45rem' : '1rem',
      minWidth: 0,
      padding: isMobile ? '0rem' : 'var(--card-padding, 1rem)',
      height: '100%',
      minHeight: 0,
      background: isMobile ? 'transparent' : undefined,
      border: isMobile ? 'none' : undefined,
      boxShadow: isMobile ? 'none' : undefined
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 className="portfolio-section-title" style={{ margin: 0, fontSize: isMobile ? '0.9rem' : '1.15rem' }}>{t('holdings.header', 'Holding Asset Summary')}</h3>
        <button
          onClick={() => setShowColumnPicker(!showColumnPicker)}
          title={t('holdings.btn_customize_cols', 'Customize Columns')}
          style={{
            background: showColumnPicker ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255, 255, 255, 0.03)',
            border: showColumnPicker ? '1px solid var(--color-primary)' : '1px solid rgba(255, 255, 255, 0.08)',
            color: showColumnPicker ? 'var(--color-primary)' : 'var(--text-muted)',
            padding: '6px',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            marginLeft: 'auto',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'white';
            if (!showColumnPicker) {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            }
          }}
          onMouseLeave={(e) => {
            if (!showColumnPicker) {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            } else {
              e.currentTarget.style.color = 'var(--color-primary)';
              e.currentTarget.style.background = 'rgba(6, 182, 212, 0.15)';
              e.currentTarget.style.borderColor = 'var(--color-primary)';
            }
          }}
        >
          <SlidersHorizontal size={13} />
        </button>
      </div>

      {showColumnPicker && (
        <div style={{ 
          background: 'rgba(0,0,0,0.2)', 
          padding: '1rem', 
          borderRadius: '8px', 
          border: '1px solid var(--panel-border)', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '1rem' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.4rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{t('holdings.config_columns', 'Configure Portfolio Columns')}</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('holdings.config_columns_desc', 'Ticker, Current Value, Gain/Loss & Actions are always visible')}</span>
          </div>
          
          {/* Grouped checkboxes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
            {columnGroups.map((group) => (
              <div key={group.name} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {group.name}
                </span>
                {group.items.map((col) => {
                  const isChecked = visibleColumns.includes(col.id);
                  return (
                    <label 
                      key={col.id} 
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: isChecked ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}
                    >
                      <input 
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleColumn(col.id)}
                        style={{ accentColor: 'var(--color-primary)' }}
                      />
                      {col.label}
                    </label>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Active column reordering */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.75rem' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
              {t('holdings.active_order', 'Active Columns Order (Reorder with Arrow keys)')}
            </span>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {t('holdings.ticker_fixed', 'Ticker')}
              </div>
              
              {visibleColumns.map((colId, idx) => {
                const meta = columnsMeta[colId];
                if (!meta) return null;
                return (
                  <div 
                    key={colId}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      background: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.2)',
                      color: 'var(--color-primary)',
                      padding: '0.2rem 0.45rem',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontWeight: 600
                    }}
                  >
                    <span>{meta.label}</span>
                    <div style={{ display: 'flex', gap: '1px' }}>
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveColumn(colId, 'left')}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: idx === 0 ? 'rgba(255,255,255,0.15)' : 'var(--color-primary)',
                          cursor: idx === 0 ? 'not-allowed' : 'pointer',
                          fontSize: '0.65rem',
                          padding: '0 2px',
                          lineHeight: 1
                        }}
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        disabled={idx === visibleColumns.length - 1}
                        onClick={() => moveColumn(colId, 'right')}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: idx === visibleColumns.length - 1 ? 'rgba(255,255,255,0.15)' : 'var(--color-primary)',
                          cursor: idx === visibleColumns.length - 1 ? 'not-allowed' : 'pointer',
                          fontSize: '0.65rem',
                          padding: '0 2px',
                          lineHeight: 1
                        }}
                      >
                        →
                      </button>
                    </div>
                  </div>
                );
              })}

              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {t('holdings.current_fixed', 'Current Value')}
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {t('holdings.gain_loss_fixed', 'Gain/Loss')}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {holdings.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Briefcase size={48} style={{ strokeWidth: 1, marginBottom: '1rem', opacity: 0.5 }} />
          <p>{t('holdings.empty_state', 'No holdings found. Add your first transaction to get started!')}</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>{t('holdings.empty_state_desc', 'Click "Add Transaction" below to register purchases.')}</p>
        </div>
      ) : (
        <div className="table-wrapper" onScroll={handleScroll} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <table 
            className="screener-table" 
            style={{ 
              width: '100%' 
            }}
          >
            <thead>
              <tr>
                <th 
                  onClick={() => handleHoldingsSort('symbol')} 
                  className="sticky-ticker-col"
                  style={{ 
                    userSelect: 'none',
                    position: 'sticky',
                    width: colWidths['symbol'] ? `${colWidths['symbol']}px` : undefined,
                    minWidth: colWidths['symbol'] ? `${colWidths['symbol']}px` : undefined
                  }}
                >
                  {t('holdings.col_ticker', 'Ticker')} {renderSortArrow('symbol')}
                  <div 
                    className={`col-resizer ${activeDragCol.current === 'symbol' ? 'resizing' : ''}`}
                    onMouseDown={(e) => handleMouseDown(e, 'symbol')}
                  />
                </th>
                
                {/* Dynamically render headers */}
                {visibleColumns.map((colId) => {
                  const col = columnsMeta[colId];
                  if (!col) return null;
                  return (
                    <th 
                      key={colId} 
                      onClick={() => handleHoldingsSort(colId)} 
                      style={{ 
                        textAlign: col.align, 
                        userSelect: 'none',
                        position: 'sticky',
                        width: colWidths[colId] ? `${colWidths[colId]}px` : undefined,
                        minWidth: colWidths[colId] ? `${colWidths[colId]}px` : undefined
                      }}
                    >
                      {col.renderHeader(summary.base_currency)} {renderSortArrow(colId)}
                      <div 
                        className={`col-resizer ${activeDragCol.current === colId ? 'resizing' : ''}`}
                        onMouseDown={(e) => handleMouseDown(e, colId)}
                      />
                    </th>
                  );
                })}

                <th 
                  onClick={() => handleHoldingsSort('current_value_base')} 
                  style={{ 
                    textAlign: 'right', 
                    userSelect: 'none',
                    position: 'sticky',
                    width: colWidths['current_value_base'] ? `${colWidths['current_value_base']}px` : undefined,
                    minWidth: colWidths['current_value_base'] ? `${colWidths['current_value_base']}px` : undefined
                  }}
                >
                  {t('holdings.col_current', 'Current Value')} ({summary.base_currency}) {renderSortArrow('current_value_base')}
                  <div 
                    className={`col-resizer ${activeDragCol.current === 'current_value_base' ? 'resizing' : ''}`}
                    onMouseDown={(e) => handleMouseDown(e, 'current_value_base')}
                  />
                </th>
                <th 
                  onClick={() => handleHoldingsSort('gain_base')} 
                  style={{ 
                    textAlign: 'right', 
                    userSelect: 'none',
                    position: 'sticky',
                    width: colWidths['gain_base'] ? `${colWidths['gain_base']}px` : undefined,
                    minWidth: colWidths['gain_base'] ? `${colWidths['gain_base']}px` : undefined
                  }}
                >
                  {t('holdings.col_gain_loss', 'Gain/Loss')} {renderSortArrow('gain_base')}
                  <div 
                    className={`col-resizer ${activeDragCol.current === 'gain_base' ? 'resizing' : ''}`}
                    onMouseDown={(e) => handleMouseDown(e, 'gain_base')}
                  />
                </th>
                <th 
                  style={{ 
                    textAlign: 'center', 
                    cursor: 'default', 
                    background: 'rgba(255, 255, 255, 0.01)',
                    width: colWidths['actions'] ? `${colWidths['actions']}px` : undefined,
                    minWidth: colWidths['actions'] ? `${colWidths['actions']}px` : undefined,
                    position: 'sticky'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                    <span>{t('holdings.col_actions', 'Actions')}</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedHoldings.map((h) => {
                const valIsProfit = h.gain_base >= 0;
                return (
                  <tr 
                    key={h.symbol} 
                    className="interactive-row"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button')) return;
                      onSelectPositionSymbol(h.symbol);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Fixed Ticker column with div wrapper for flex alignment */}
                    <td 
                      className="sticky-ticker-col"
                      style={{ 
                        fontWeight: 600, 
                        color: 'var(--text-primary)',
                        width: colWidths['symbol'] ? `${colWidths['symbol']}px` : undefined,
                        minWidth: colWidths['symbol'] ? `${colWidths['symbol']}px` : undefined
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        {h.is_live && (
                          <span 
                            title="Market Session is Live"
                            style={{ 
                              display: 'inline-block',
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: '#10b981',
                              boxShadow: '0 0 8px #10b981',
                              animation: 'pulse 1.8s infinite',
                              flexShrink: 0
                            }} 
                          />
                        )}
                        <span>{h.symbol}</span>
                      </div>
                    </td>

                    {/* Dynamically render cells based on visible order */}
                    {visibleColumns.map((colId) => {
                      const col = columnsMeta[colId];
                      if (!col) return null;
                      return (
                        <td 
                          key={colId} 
                          style={{ 
                            textAlign: col.align, 
                            fontFamily: ['shares', 'avg_cost', 'price', 'cost', 'dividends', 'day_change', 'weight', 'fx_rate'].includes(colId) ? 'monospace' : 'inherit',
                            width: colWidths[colId] ? `${colWidths[colId]}px` : undefined,
                            minWidth: colWidths[colId] ? `${colWidths[colId]}px` : undefined
                          }}
                        >
                          {col.renderCell(h, summary.base_currency)}
                        </td>
                      );
                    })}

                    {/* Fixed ending columns */}
                    <td 
                      style={{ 
                        textAlign: 'right', 
                        fontFamily: 'monospace', 
                        fontWeight: 600,
                        width: colWidths['current_value_base'] ? `${colWidths['current_value_base']}px` : undefined,
                        minWidth: colWidths['current_value_base'] ? `${colWidths['current_value_base']}px` : undefined
                      }}
                    >
                      <AnimateOnChange value={h.current_value_base} contextId={h.symbol}>
                        {formatCurrency(h.current_value_base, summary.base_currency)}
                      </AnimateOnChange>
                    </td>
                    <td 
                      style={{ 
                        textAlign: 'right', 
                        fontFamily: 'monospace',
                        width: colWidths['gain_base'] ? `${colWidths['gain_base']}px` : undefined,
                        minWidth: colWidths['gain_base'] ? `${colWidths['gain_base']}px` : undefined
                      }}
                    >
                      <AnimateOnChange value={h.gain_base} contextId={h.symbol} style={{ display: 'block' }}>
                        <div className={valIsProfit ? 'text-green' : 'text-red'} style={{ fontWeight: 600 }}>
                          {valIsProfit ? '+' : ''}{formatCurrency(h.gain_base, summary.base_currency)}
                        </div>
                        <div style={{ fontSize: '0.75rem' }} className={valIsProfit ? 'text-green' : 'text-red'}>
                          {valIsProfit ? '+' : ''}{h.gain_percent.toFixed(2)}%
                        </div>
                      </AnimateOnChange>
                    </td>
                    <td 
                      style={{ 
                        textAlign: 'center',
                        width: colWidths['actions'] ? `${colWidths['actions']}px` : undefined,
                        minWidth: colWidths['actions'] ? `${colWidths['actions']}px` : undefined
                      }}
                    >
                      {activePortfolioRole === 'viewer' ? (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                          <button 
                            className="holding-action-btn buy"
                            onClick={() => onQuickAction(h.symbol, 'BUY')}
                            title={h.symbol.startsWith('CASH_') ? `${t('holdings.action_deposit', 'Deposit')} ${h.currency}` : `${t('holdings.action_buy_more', 'Buy more')} ${h.symbol}`}
                          >
                            +
                          </button>
                          <button 
                            className="holding-action-btn sell"
                            onClick={() => onQuickAction(h.symbol, 'SELL')}
                            title={h.symbol.startsWith('CASH_') ? `${t('holdings.action_withdraw', 'Withdraw')} ${h.currency}` : `${t('holdings.action_sell', 'Sell')} ${h.symbol}`}
                          >
                            -
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
