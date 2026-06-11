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

  // Sort holdings according to selected field & direction
  const sortedHoldings = useMemo(() => {
    const sorted = [...holdings];
    sorted.sort((a, b) => {
      const field = holdingsSortField as keyof Holding;
      const valA = a[field];
      const valB = b[field];

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
      const defaultAsc = ['symbol', 'name'].includes(field);
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

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0, padding: '1.25rem' }}>
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
          gap: '0.5rem' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.4rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Configure Portfolio Columns</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Ticker, Price, Current, Gain/Loss & Actions are core</span>
          </div>
          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
            {[
              { id: 'name', label: 'Company Name' },
              { id: 'shares', label: 'Shares Owned' },
              { id: 'avg_cost', label: 'Average Cost' },
              { id: 'price', label: 'Local Price' },
              { id: 'cost', label: 'Cost Basis' },
              { id: 'dividends', label: 'Dividends Net' },
              { id: 'day_change', label: 'Day Change' },
              { id: 'asset_class', label: 'Asset Class' }
            ].map((col) => {
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
        </div>
      )}
      
      {holdings.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Briefcase size={48} style={{ strokeWidth: 1, marginBottom: '1rem', opacity: 0.5 }} />
          <p>No holdings found in your portfolio.</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Click "Add Transaction" above to register purchases.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="screener-table">
            <thead>
              <tr>
                <th onClick={() => handleHoldingsSort('symbol')} style={{ userSelect: 'none' }}>
                  Ticker {renderSortArrow('symbol')}
                </th>
                {visibleColumns.includes('name') && (
                  <th onClick={() => handleHoldingsSort('name')} style={{ userSelect: 'none' }}>
                    Company Name {renderSortArrow('name')}
                  </th>
                )}
                {visibleColumns.includes('shares') && (
                  <th onClick={() => handleHoldingsSort('shares')} style={{ textAlign: 'right', userSelect: 'none' }}>
                    Shares {renderSortArrow('shares')}
                  </th>
                )}
                {visibleColumns.includes('avg_cost') && (
                  <th onClick={() => handleHoldingsSort('avg_cost_local')} style={{ textAlign: 'right', userSelect: 'none' }}>
                    Avg Cost {renderSortArrow('avg_cost_local')}
                  </th>
                )}
                {visibleColumns.includes('price') && (
                  <th onClick={() => handleHoldingsSort('current_price_local')} style={{ textAlign: 'right', userSelect: 'none' }}>
                    Price {renderSortArrow('current_price_local')}
                  </th>
                )}
                {visibleColumns.includes('cost') && (
                  <th onClick={() => handleHoldingsSort('cost_basis_base')} style={{ textAlign: 'right', userSelect: 'none' }}>
                    Cost ({summary.base_currency}) {renderSortArrow('cost_basis_base')}
                  </th>
                )}
                {visibleColumns.includes('dividends') && (
                  <th onClick={() => handleHoldingsSort('dividends_net_base')} style={{ textAlign: 'right', userSelect: 'none' }}>
                    Dividends {renderSortArrow('dividends_net_base')}
                  </th>
                )}
                {visibleColumns.includes('day_change') && (
                  <th onClick={() => handleHoldingsSort('day_change_percent')} style={{ textAlign: 'right', userSelect: 'none' }}>
                    Day Change {renderSortArrow('day_change_percent')}
                  </th>
                )}
                {visibleColumns.includes('asset_class') && (
                  <th onClick={() => handleHoldingsSort('asset_class')} style={{ textAlign: 'left', userSelect: 'none' }}>
                    Class {renderSortArrow('asset_class')}
                  </th>
                )}
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
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
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
                    </td>
                    {visibleColumns.includes('name') && (
                      <td style={{ color: 'var(--text-secondary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h.name}>
                        {h.name}
                      </td>
                    )}
                    {visibleColumns.includes('shares') && (
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                        {formatShares(h.shares)}
                      </td>
                    )}
                    {visibleColumns.includes('avg_cost') && (
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                        {formatCurrency(h.avg_cost_local, h.currency)}
                      </td>
                    )}
                    {visibleColumns.includes('price') && (
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                        {formatCurrency(h.current_price_local, h.currency)}
                      </td>
                    )}
                    {visibleColumns.includes('cost') && (
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                        {formatCurrency(h.cost_basis_base, summary.base_currency)}
                      </td>
                    )}
                    {visibleColumns.includes('dividends') && (
                      <td 
                        style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--color-green)' }}
                        title={`Gross: ${formatCurrency(h.dividends_base || 0, summary.base_currency)} (based on account tax settings)`}
                      >
                        {formatCurrency(h.dividends_net_base || 0, summary.base_currency)}
                      </td>
                    )}
                    {visibleColumns.includes('day_change') && (
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                        {h.day_change_percent !== undefined ? (
                          <>
                            <div className={h.day_change_percent >= 0 ? 'text-green' : 'text-red'} style={{ fontWeight: 600 }}>
                              {h.day_change_percent >= 0 ? '+' : ''}{h.day_change_percent.toFixed(2)}%
                            </div>
                            <div style={{ fontSize: '0.72rem' }} className={h.day_change_percent >= 0 ? 'text-green' : 'text-red'}>
                              {h.day_change_percent >= 0 ? '+' : ''}{formatCurrency(h.day_change_value_base || 0, summary.base_currency)}
                            </div>
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                    )}
                    {visibleColumns.includes('asset_class') && (
                      <td style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        {h.asset_class || 'Equity'}
                      </td>
                    )}
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
