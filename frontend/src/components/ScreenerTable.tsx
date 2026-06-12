import React, { useState, useMemo, useDeferredValue } from 'react';
import { Search, ArrowUpDown, X, ChevronRight, BarChart2, HelpCircle, Eye, Sliders } from 'lucide-react';

interface IndicatorConfig {
  id: string;
  name: string;
  category: string;
  type: string;
  description?: string;
}

interface Stock {
  symbol: string;
  name: string;
  price: number | null;
  market_cap: number | null;
  trailing_ps: number | null;
  forward_ps_1y: number | null;
  forward_ps_2y: number | null;
  rev_growth_1y: number | null;
  rev_growth_2y: number | null;
  psg_1y: number | null;
  psg_2y: number | null;
  [key: string]: any; // Allow custom future indicators
}

interface ScreenerTableProps {
  stocks: Stock[];
  indicators: IndicatorConfig[];
  onSelectStock: (ticker: string) => void;
  selectedTicker: string | null;
}

export const ScreenerTable: React.FC<ScreenerTableProps> = ({ stocks, indicators, onSelectStock, selectedTicker }) => {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<string>(() => {
    return localStorage.getItem('screener_sort_field') || 'market_cap';
  });
  const [sortAsc, setSortAsc] = useState<boolean>(() => {
    return localStorage.getItem('screener_sort_asc') === 'true';
  });
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  
  // Custom filter states (metricId -> { min: number, max: number })
  const [filters, setFilters] = useState<Record<string, { min: number; max: number }>>({});

  // Active column header filter dropdown popover
  const [activeHeaderFilter, setActiveHeaderFilter] = useState<string | null>(null);
  const [tempMin, setTempMin] = useState<number | null>(null);
  const [tempMax, setTempMax] = useState<number | null>(null);

  // Defer search and filters to prevent rendering lag during active typing/dragging
  const deferredSearch = useDeferredValue(search);
  const deferredFilters = useDeferredValue(filters);

  // Group indicators by category (excluding symbol and name which are always visible)
  const groupedIndicators = useMemo(() => {
    const groups: Record<string, IndicatorConfig[]> = {};
    indicators.forEach((ind) => {
      if (ind.id === 'symbol' || ind.id === 'name') return;
      if (!groups[ind.category]) {
        groups[ind.category] = [];
      }
      groups[ind.category].push(ind);
    });
    return groups;
  }, [indicators]);

  // Column visibility settings (Default visible indicators, remembered in localStorage)
  const [visibleIndicatorIds, setVisibleIndicatorIds] = useState<string[]>(() => {
    const cached = localStorage.getItem('screener_visible_columns');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Always ensure core columns are present
          return Array.from(new Set(['symbol', 'name', ...parsed]));
        }
      } catch (e) {
        console.error('Error parsing visible columns from localStorage', e);
      }
    }
    return ['symbol', 'name', 'price', 'trailing_ps', 'rev_growth_1y', 'psg_1y'];
  });

  const toggleIndicator = (id: string) => {
    if (id === 'symbol' || id === 'name') return; // Core columns must remain visible
    setVisibleIndicatorIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem('screener_visible_columns', JSON.stringify(next));
      return next;
    });
  };

  // 1. Calculate min/max ranges for sliders dynamically from stocks dataset
  const ranges = useMemo(() => {
    const limits: Record<string, { min: number; max: number }> = {};
    indicators.forEach((ind) => {
      if (ind.type === 'ratio' || ind.type === 'currency' || ind.type === 'percentage') {
        const values = stocks
          .map((s) => s[ind.id])
          .filter((v) => v !== null && v !== undefined) as number[];
        
        if (values.length > 0) {
          const rawMin = Math.min(...values);
          const rawMax = Math.max(...values);
          limits[ind.id] = {
            // Round min down to 2 decimals, max up to 2 decimals to ensure coverage
            min: Math.floor(rawMin * 100) / 100,
            max: Math.ceil(rawMax * 100) / 100,
          };
        } else {
          limits[ind.id] = { min: 0, max: 100 };
        }
      }
    });
    return limits;
  }, [stocks, indicators]);

  // Sync text inputs when active header filter popover opens
  React.useEffect(() => {
    if (activeHeaderFilter) {
      const currentFilter = filters[activeHeaderFilter];
      if (currentFilter) {
        setTempMin(currentFilter.min);
        setTempMax(currentFilter.max);
      } else {
        const limit = ranges[activeHeaderFilter];
        if (limit) {
          setTempMin(limit.min);
          setTempMax(limit.max);
        } else {
          setTempMin(null);
          setTempMax(null);
        }
      }
    }
  }, [activeHeaderFilter, ranges]);

  // Handle slider changes
  const handleSliderChange = (id: string, type: 'min' | 'max', value: number) => {
    // Round to 2 decimals to keep filter state clean
    const roundedValue = Math.round(value * 100) / 100;
    setFilters((prev) => {
      const limit = ranges[id] || { min: 0, max: 100 };
      const current = prev[id] || { min: limit.min, max: limit.max };
      const next = { ...current, [type]: roundedValue };
      
      // Enforce min <= max
      if (type === 'min' && next.min > next.max) {
        next.max = next.min;
      } else if (type === 'max' && next.max < next.min) {
        next.min = next.max;
      }
      
      return {
        ...prev,
        [id]: next,
      };
    });
  };

  // Reset all filters
  const resetFilters = () => {
    setFilters({});
    setSearch('');
    setActiveHeaderFilter(null);
    setTempMin(null);
    setTempMax(null);
  };

  // 2. Perform Filtering
  const filteredStocks = useMemo(() => {
    return stocks.filter((stock) => {
      // Search filter using deferred value
      const matchesSearch = 
        stock.symbol.toLowerCase().includes(deferredSearch.toLowerCase()) ||
        stock.name.toLowerCase().includes(deferredSearch.toLowerCase());
      if (!matchesSearch) return false;

      // Slider filters using deferred value
      for (const [key, range] of Object.entries(deferredFilters)) {
        const val = stock[key];
        // If the stock is missing a value, we exclude it from the filtered list
        if (val === null || val === undefined) return false;
        
        if (val < range.min || val > range.max) return false;
      }

      return true;
    });
  }, [stocks, deferredSearch, deferredFilters]);

  // 3. Perform Sorting
  const sortedStocks = useMemo(() => {
    const sorted = [...filteredStocks];
    sorted.sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];

      // Handle null values (always place at bottom)
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      // Numerical sorting
      return sortAsc 
        ? (valA as number) - (valB as number) 
        : (valB as number) - (a[sortField] as number);
    });
    return sorted;
  }, [filteredStocks, sortField, sortAsc]);

  const updateSort = (field: string, asc: boolean) => {
    setSortField(field);
    setSortAsc(asc);
    localStorage.setItem('screener_sort_field', field);
    localStorage.setItem('screener_sort_asc', String(asc));
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      updateSort(field, !sortAsc);
    } else {
      updateSort(field, false); // default descending for new fields
    }
  };

  // Format Helper functions
  const formatCell = (val: any, type: string, _id: string) => {
    if (val === null || val === undefined) {
      return <span style={{ color: 'var(--text-muted)' }}>—</span>;
    }
    
    if (type === 'currency') {
      if (typeof val === 'number') {
        if (val >= 1e12) return `$ ${(val / 1e12).toFixed(2)} T`;
        if (val >= 1e9) return `$ ${(val / 1e9).toFixed(2)} B`;
        if (val >= 1e6) return `$ ${(val / 1e6).toFixed(2)} M`;
        return `$ ${val.toFixed(2)}`;
      }
      return `$ ${val}`;
    }
    
    if (type === 'percentage') {
      return `${(val * 100).toFixed(1)}%`;
    }
    
    if (type === 'ratio') {
      return val.toFixed(2);
    }
    
    return val.toString();
  };

  // Custom styling badge for PSG
  const getPSGBadge = (val: number | null) => {
    if (val === null || val === undefined) {
      return <span className="badge badge-gray">N/A</span>;
    }
    if (val < 1.0) {
      return <span className="badge badge-green">{(val).toFixed(2)}</span>;
    }
    return <span className="badge badge-gray">{(val).toFixed(2)}</span>;
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      
      {/* Controls: Search, filter panel toggles, presets */}
      <div className="controls-bar">
        <div className="search-box">
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Search symbol or company name..." 
            className="input-field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button 
            className="glow-btn"
            style={{ 
              background: showColumnPicker ? 'var(--color-primary)' : 'rgba(255,255,255,0.03)', 
              color: 'var(--text-primary)',
              padding: '0.5rem 1rem', fontSize: '0.85rem',
              border: '1px dashed var(--panel-border)',
              boxShadow: 'none'
            }}
            onClick={() => {
              setShowColumnPicker(!showColumnPicker);
              setActiveHeaderFilter(null); // Close active header filters when toggling column picker
            }}
          >
            <Eye size={14} /> Customize Columns
          </button>

          {(Object.keys(filters).length > 0 || search) && (
            <button 
              className="glow-btn" 
              style={{ background: 'var(--color-red-glow)', color: 'var(--color-red)', padding: '0.5rem 1rem', fontSize: '0.85rem', boxShadow: 'none' }}
              onClick={resetFilters}
            >
              <X size={14} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Column Selector Panel */}
      {showColumnPicker && (
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.5rem', marginBottom: '0.25rem' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>Configure Screener Table Columns</h4>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Core columns (Ticker, Company) are fixed</span>
          </div>
          <div className="column-picker-grid">
            {Object.entries(groupedIndicators).map(([category, items]) => (
              <div key={category} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {category}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {items.map((ind) => {
                    const isChecked = visibleIndicatorIds.includes(ind.id);
                    return (
                      <label 
                        key={ind.id} 
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: isChecked ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}
                        title={ind.description}
                      >
                        <input 
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleIndicator(ind.id)}
                          style={{ accentColor: 'var(--color-primary)' }}
                        />
                        {ind.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}      {/* Screener Table Output */}
      <div className="table-wrapper">
        <table className="screener-table" style={{ overflow: 'visible' }}>
          <thead>
            <tr>
              {indicators
                .filter((ind) => visibleIndicatorIds.includes(ind.id))
                .map((ind) => (
                  <th key={ind.id} style={{ position: 'relative' }}>
                    <div className="th-content" style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '0.3rem' }}>
                      <span 
                        onClick={() => handleSort(ind.id)} 
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}
                      >
                        {ind.name}
                        {sortField === ind.id && (
                          <ArrowUpDown size={12} style={{ color: 'var(--color-primary)' }} />
                        )}
                      </span>
                      
                      {ind.description && 
                       ind.id !== 'symbol' && 
                       ind.id !== 'name' && 
                       ind.id !== 'sector' && 
                       ind.id !== 'industry' && (
                        <div className="tooltip-container" onClick={(e) => e.stopPropagation()}>
                          <HelpCircle size={13} />
                          <span className="tooltip-text">{ind.description}</span>
                        </div>
                      )}

                      {/* Filter Icon for numeric indicators */}
                      {ind.type !== 'string' && ranges[ind.id] && (
                        <Sliders 
                          size={12} 
                          style={{ 
                            marginLeft: 'auto', 
                            color: filters[ind.id] ? 'var(--color-primary)' : 'var(--text-muted)',
                            cursor: 'pointer'
                          }} 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveHeaderFilter(activeHeaderFilter === ind.id ? null : ind.id);
                          }}
                        />
                      )}
                    </div>

                    {/* Popover overlay filter menu */}
                    {activeHeaderFilter === ind.id && (
                      <>
                        <div 
                          style={{ 
                            position: 'fixed', 
                            top: 0, 
                            left: 0, 
                            right: 0, 
                            bottom: 0, 
                            zIndex: 999, 
                            cursor: 'default' 
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveHeaderFilter(null);
                          }}
                        />
                        <div className="header-filter-popover" style={{ zIndex: 1000 }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.4rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                              Filter {ind.name}
                            </span>
                            <button 
                              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                              onClick={() => setActiveHeaderFilter(null)}
                            >
                              <X size={14} />
                            </button>
                          </div>                           {/* Quick Sort Options */}
                          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                            <button 
                              className="glow-btn"
                              style={{ flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.75rem', background: sortField === ind.id && sortAsc ? 'var(--color-primary)' : 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)', boxShadow: 'none' }}
                              onClick={() => {
                                updateSort(ind.id, true);
                              }}
                            >
                              Sort Asc
                            </button>
                            <button 
                              className="glow-btn"
                              style={{ flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.75rem', background: sortField === ind.id && !sortAsc ? 'var(--color-primary)' : 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)', boxShadow: 'none' }}
                              onClick={() => {
                                updateSort(ind.id, false);
                              }}
                            >
                              Sort Desc
                            </button>
                          </div>

                          {/* Min Max Value Inputs */}
                          {(() => {
                            const limit = ranges[ind.id];
                            const current = filters[ind.id] || { min: limit.min, max: limit.max };
                            
                            const formatValue = (val: number) => {
                              if (ind.type === 'percentage') return `${(val * 100).toFixed(1)}%`;
                              if (ind.type === 'currency') {
                                if (ind.id === 'market_cap' || ind.id === 'enterprise_value' || ind.id === 'free_cash_flow') {
                                  return `$ ${(val / 1e9).toFixed(1)}B`;
                                }
                                return `$ ${val.toFixed(2)}`;
                              }
                              return val.toFixed(2);
                            };

                            const step = ind.type === 'percentage' 
                              ? 0.005 
                              : (ind.id === 'market_cap' || ind.id === 'enterprise_value' || ind.id === 'free_cash_flow' ? 1e9 : 0.05);

                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                {/* Text Box Inputs */}
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Min</span>
                                    <input 
                                      type="number"
                                      className="input-field"
                                      style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem', width: '100%', background: 'rgba(0,0,0,0.2)' }}
                                      value={tempMin === null ? '' : tempMin}
                                      step={step}
                                      onChange={(e) => {
                                        const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                        setTempMin(val);
                                        if (val !== null && !isNaN(val)) {
                                          handleSliderChange(ind.id, 'min', val);
                                        }
                                      }}
                                      placeholder={limit.min.toFixed(2)}
                                    />
                                  </div>
                                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Max</span>
                                    <input 
                                      type="number"
                                      className="input-field"
                                      style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem', width: '100%', background: 'rgba(0,0,0,0.2)' }}
                                      value={tempMax === null ? '' : tempMax}
                                      step={step}
                                      onChange={(e) => {
                                        const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                        setTempMax(val);
                                        if (val !== null && !isNaN(val)) {
                                          handleSliderChange(ind.id, 'max', val);
                                        }
                                      }}
                                      placeholder={limit.max.toFixed(2)}
                                    />
                                  </div>
                                </div>

                                {/* Slider Inputs */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', width: '20px' }}>Min</span>
                                    <input 
                                      type="range"
                                      min={limit.min}
                                      max={limit.max}
                                      step={step}
                                      value={current.min}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        handleSliderChange(ind.id, 'min', val);
                                        setTempMin(val);
                                      }}
                                      style={{ flex: 1 }}
                                    />
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', width: '20px' }}>Max</span>
                                    <input 
                                      type="range"
                                      min={limit.min}
                                      max={limit.max}
                                      step={step}
                                      value={current.max}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        handleSliderChange(ind.id, 'max', val);
                                        setTempMax(val);
                                      }}
                                      style={{ flex: 1 }}
                                    />
                                  </div>
                                </div>

                                <div style={{ fontSize: '0.75rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                                  Range: {formatValue(current.min)} - {formatValue(current.max)}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Reset Button */}
                          {filters[ind.id] && (
                            <button 
                              style={{ width: '100%', marginTop: '1rem', padding: '0.4rem', fontSize: '0.75rem', background: 'var(--color-red-glow)', color: 'var(--color-red)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                              onClick={() => {
                                setFilters(prev => {
                                  const next = { ...prev };
                                  delete next[ind.id];
                                  return next;
                                });
                                setTempMin(null);
                                setTempMax(null);
                              }}
                            >
                              Reset Filter
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </th>
                ))}
              <th style={{ width: '40px' }}></th>
            </tr>
          </thead>
          <tbody>
            {sortedStocks.length === 0 ? (
              <tr>
                <td colSpan={visibleIndicatorIds.length + 1} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  No stocks match the screen criteria. Try resetting filters.
                </td>
              </tr>
            ) : (
              sortedStocks.map((stock) => (
                <tr 
                  key={stock.symbol}
                  onClick={() => onSelectStock(stock.symbol)}
                  className={selectedTicker === stock.symbol ? 'selected' : ''}
                >
                  {indicators
                    .filter((ind) => visibleIndicatorIds.includes(ind.id))
                    .map((ind) => {
                      const val = stock[ind.id];
                      
                      if (ind.id === 'symbol') {
                        return <td key={ind.id} className="ticker-cell">{val}</td>;
                      }
                      if (ind.id === 'name') {
                        return <td key={ind.id} className="company-name" title={val}>{val}</td>;
                      }
                      if (ind.id.startsWith('psg_')) {
                        return <td key={ind.id}>{getPSGBadge(val)}</td>;
                      }
                      
                      return <td key={ind.id}>{formatCell(val, ind.type, ind.id)}</td>;
                    })}
                  <td>
                    <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '0.5rem 0.25rem' }}>
        <span>Showing {sortedStocks.length} of {stocks.length} stocks</span>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <BarChart2 size={12} />
          <span>Click a stock row to open historical detail charts.</span>
        </div>
      </div>
    </div>
  );
};
