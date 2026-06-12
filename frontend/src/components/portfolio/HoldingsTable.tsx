import { useState, useMemo } from 'react';
import { Eye, Briefcase } from 'lucide-react';
import type { Holding, Summary } from '../../types/portfolio';

interface HoldingsTableProps {
  holdings: Holding[];
  summary: Summary;
  activePortfolioRole: string;
  onQuickAction: (symbol: string, type: 'BUY' | 'SELL') => void;
  onSelectPositionSymbol: (symbol: string) => void;
}

export function HoldingsTable({
  holdings,
  summary,
  activePortfolioRole,
  onQuickAction,
  onSelectPositionSymbol
}: HoldingsTableProps) {
  // Sorting states
  const [holdingsSortField, setHoldingsSortField] = useState<string>(() => {
    return localStorage.getItem('portfolio_holdings_sort_field') || 'symbol';
  });
  const [holdingsSortAsc, setHoldingsSortAsc] = useState<boolean>(() => {
    return localStorage.getItem('portfolio_holdings_sort_asc') !== 'false';
  });

  // Customizable Columns states
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const cached = localStorage.getItem('portfolio_visible_columns');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
        console.error('Error parsing visible columns from localStorage', e);
      }
    }
    return ['name', 'shares', 'price', 'day_change', 'cost'];
  });

  const toggleColumn = (id: string) => {
    setVisibleColumns((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem('portfolio_visible_columns', JSON.stringify(next));
      return next;
    });
  };

  const moveColumn = (id: string, direction: 'left' | 'right') => {
    const idx = visibleColumns.indexOf(id);
    if (idx === -1) return;
    const nextIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (nextIdx < 0 || nextIdx >= visibleColumns.length) return;

    const next = [...visibleColumns];
    const temp = next[idx];
    next[idx] = next[nextIdx];
    next[nextIdx] = temp;

    setVisibleColumns(next);
    localStorage.setItem('portfolio_visible_columns', JSON.stringify(next));
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
      label: 'Company Name',
      sortField: 'name',
      align: 'left',
      renderHeader: () => 'Company Name',
      renderCell: (h) => (
        <span style={{ color: 'var(--text-secondary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h.name}>
          {h.name}
        </span>
      )
    },
    shares: {
      label: 'Shares Owned',
      sortField: 'shares',
      align: 'right',
      renderHeader: () => 'Shares',
      renderCell: (h) => formatShares(h.shares)
    },
    avg_cost: {
      label: 'Average Cost',
      sortField: 'avg_cost_local',
      align: 'right',
      renderHeader: () => 'Avg Cost',
      renderCell: (h) => formatCurrency(h.avg_cost_local, h.currency)
    },
    price: {
      label: 'Local Price',
      sortField: 'current_price_local',
      align: 'right',
      renderHeader: () => 'Price',
      renderCell: (h) => formatCurrency(h.current_price_local, h.currency)
    },
    cost: {
      label: 'Cost Basis',
      sortField: 'cost_basis_base',
      align: 'right',
      renderHeader: (baseCurrency) => `Cost (${baseCurrency})`,
      renderCell: (h, baseCurrency) => formatCurrency(h.cost_basis_base, baseCurrency)
    },
    dividends: {
      label: 'Dividends Net',
      sortField: 'dividends_net_base',
      align: 'right',
      renderHeader: () => 'Dividends',
      renderCell: (h, baseCurrency) => (
        <span title={`Gross: ${formatCurrency(h.dividends_base || 0, baseCurrency)} (based on settings tax)`} style={{ color: 'var(--color-green)' }}>
          {formatCurrency(h.dividends_net_base || 0, baseCurrency)}
        </span>
      )
    },
    day_change: {
      label: 'Day Change',
      sortField: 'day_change_percent',
      align: 'right',
      renderHeader: () => 'Day Change',
      renderCell: (h, baseCurrency) => {
        return h.day_change_percent !== undefined ? (
          <>
            <div className={h.day_change_percent >= 0 ? 'text-green' : 'text-red'} style={{ fontWeight: 600 }}>
              {h.day_change_percent >= 0 ? '+' : ''}{h.day_change_percent.toFixed(2)}%
            </div>
            <div style={{ fontSize: '0.72rem' }} className={h.day_change_percent >= 0 ? 'text-green' : 'text-red'}>
              {h.day_change_percent >= 0 ? '+' : ''}{formatCurrency(h.day_change_value_base || 0, baseCurrency)}
            </div>
          </>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        );
      }
    },
    asset_class: {
      label: 'Asset Class',
      sortField: 'asset_class',
      align: 'left',
      renderHeader: () => 'Class',
      renderCell: (h) => (
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
          {h.asset_class || 'Equity'}
        </span>
      )
    },
    weight: {
      label: 'Weight',
      sortField: 'current_value_base',
      align: 'right',
      renderHeader: () => 'Weight',
      renderCell: (h) => {
        const total = summary.total_value_base || 1;
        const wt = (h.current_value_base / total) * 100;
        return <span style={{ fontFamily: 'monospace' }}>{wt.toFixed(2)}%</span>;
      }
    },
    fx_rate: {
      label: 'FX Rate',
      sortField: 'fx_rate',
      align: 'right',
      renderHeader: () => 'FX Rate',
      renderCell: (h) => <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{h.fx_rate?.toFixed(4) || '1.0000'}</span>
    }
  };

  // Logical Grouping
  const columnGroups = [
    {
      name: 'Basic Info',
      items: [
        { id: 'name', label: 'Company Name' },
        { id: 'asset_class', label: 'Asset Class' }
      ]
    },
    {
      name: 'Position Info',
      items: [
        { id: 'shares', label: 'Shares Owned' },
        { id: 'weight', label: 'Weight' }
      ]
    },
    {
      name: 'Valuation',
      items: [
        { id: 'price', label: 'Local Price' },
        { id: 'avg_cost', label: 'Average Cost' },
        { id: 'cost', label: 'Cost Basis' },
        { id: 'fx_rate', label: 'FX Rate' }
      ]
    },
    {
      name: 'Returns',
      items: [
        { id: 'day_change', label: 'Day Change' },
        { id: 'dividends', label: 'Dividends Net' }
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
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0, padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 className="portfolio-section-title" style={{ margin: 0 }}>Holding Asset Summary</h3>
        <button 
          className="glow-btn"
          style={{ 
            background: showColumnPicker ? 'var(--color-primary)' : 'rgba(255,255,255,0.03)', 
            color: 'var(--text-primary)',
            padding: '0.45rem 0.85rem', fontSize: '0.8rem',
            border: '1px dashed var(--panel-border)',
            boxShadow: 'none',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}
          onClick={() => setShowColumnPicker(!showColumnPicker)}
        >
          <Eye size={14} /> Customize Columns
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
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Configure Portfolio Columns</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Ticker, Current Value, Gain/Loss & Actions are always visible</span>
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
              Active Columns Order (Reorder with Arrow keys)
            </span>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Ticker (Fixed)
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
                Current (Fixed)
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Gain/Loss (Fixed)
              </div>
            </div>
          </div>
        </div>
      )}
      
      {holdings.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Briefcase size={48} style={{ strokeWidth: 1, marginBottom: '1rem', opacity: 0.5 }} />
          <p>No holdings found in your portfolio.</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Click "Add Transaction" below to register purchases.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="screener-table">
            <thead>
              <tr>
                <th onClick={() => handleHoldingsSort('symbol')} style={{ userSelect: 'none' }}>
                  Ticker {renderSortArrow('symbol')}
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
                        userSelect: 'none' 
                      }}
                    >
                      {col.renderHeader(summary.base_currency)} {renderSortArrow(colId)}
                    </th>
                  );
                })}

                <th onClick={() => handleHoldingsSort('current_value_base')} style={{ textAlign: 'right', userSelect: 'none' }}>
                  Current ({summary.base_currency}) {renderSortArrow('current_value_base')}
                </th>
                <th onClick={() => handleHoldingsSort('gain_base')} style={{ textAlign: 'right', userSelect: 'none' }}>
                  Gain/Loss {renderSortArrow('gain_base')}
                </th>
                <th style={{ textAlign: 'center', cursor: 'default', background: 'rgba(255, 255, 255, 0.01)' }}>
                  Actions
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
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
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
                        <span style={{ 
                          fontSize: '0.65rem', 
                          color: 'var(--text-muted)', 
                          background: 'rgba(255, 255, 255, 0.04)', 
                          padding: '1px 4px', 
                          borderRadius: '4px',
                          marginLeft: '2px'
                        }}>
                          {h.currency}
                        </span>
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
                            fontFamily: ['shares', 'avg_cost', 'price', 'cost', 'dividends', 'day_change', 'weight', 'fx_rate'].includes(colId) ? 'monospace' : 'inherit'
                          }}
                        >
                          {col.renderCell(h, summary.base_currency)}
                        </td>
                      );
                    })}

                    {/* Fixed ending columns */}
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                      {formatCurrency(h.current_value_base, summary.base_currency)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      <div className={valIsProfit ? 'text-green' : 'text-red'} style={{ fontWeight: 600 }}>
                        {valIsProfit ? '+' : ''}{formatCurrency(h.gain_base, summary.base_currency)}
                      </div>
                      <div style={{ fontSize: '0.75rem' }} className={valIsProfit ? 'text-green' : 'text-red'}>
                        {valIsProfit ? '+' : ''}{h.gain_percent.toFixed(2)}%
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {activePortfolioRole === 'viewer' ? (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                          <button 
                            className="holding-action-btn buy"
                            onClick={() => onQuickAction(h.symbol, 'BUY')}
                            title={h.symbol.startsWith('CASH_') ? `Deposit ${h.currency}` : `Buy more ${h.symbol}`}
                          >
                            +
                          </button>
                          <button 
                            className="holding-action-btn sell"
                            onClick={() => onQuickAction(h.symbol, 'SELL')}
                            title={h.symbol.startsWith('CASH_') ? `Withdraw ${h.currency}` : `Sell ${h.symbol}`}
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
