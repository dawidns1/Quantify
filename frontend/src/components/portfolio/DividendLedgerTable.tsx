import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Edit2, Trash2, Sparkles, Plus, TrendingUp, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getAccountNeonTheme } from '../../utils/accountColors';
import { useTableColumnResize } from '../../hooks/useTableColumnResize';

const DEFAULT_DIVIDEND_LEDGER_COL_WIDTHS: Record<string, number> = {
  date: 115,
  symbol: 95,
  account: 110,
  shares: 95,
  payout: 105,
  gross: 120,
  net: 120,
  type: 85,
  actions: 80
};

const DEFAULT_DIVIDEND_LEDGER_VISIBLE_COLS = [
  'date',
  'symbol',
  'account',
  'shares',
  'payout',
  'gross',
  'net',
  'type',
  'actions'
];

interface DividendLedgerTableProps {
  dividends: any[];
  activePortfolioRole: string;
  baseCurrency: string;
  onEditDividendClick: (div: any) => void;
  onDeleteDividendClick: (div: any) => void;
  onAddDividendClick?: () => void;
  onToggleViewMode?: () => void;
  style?: React.CSSProperties;
  onScrollToBottomChange?: (isAtBottom: boolean) => void;
  accountColors?: Record<string, string>;
}

export function DividendLedgerTable({
  dividends,
  activePortfolioRole,
  baseCurrency,
  onEditDividendClick,
  onDeleteDividendClick,
  onAddDividendClick,
  onToggleViewMode,
  style,
  onScrollToBottomChange,
  accountColors = {}
}: DividendLedgerTableProps) {
  const wasAtBottomRef = useRef(false);
  const { t, i18n } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<string>('date');
  const [sortAsc, setSortAsc] = useState<boolean>(false); // default: newest dividends first

  const {
    colWidths,
    handleMouseDown,
    activeDragCol,
    isResizingRef,
    resetColWidths
  } = useTableColumnResize('portfolio_dividend_ledger_col_widths', DEFAULT_DIVIDEND_LEDGER_COL_WIDTHS);

  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    try {
      const cached = localStorage.getItem('portfolio_dividend_ledger_visible_cols');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_DIVIDEND_LEDGER_VISIBLE_COLS;
  });

  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const columnPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showColumnPicker) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) {
        setShowColumnPicker(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showColumnPicker]);

  const toggleColumn = (colId: string) => {
    if (colId === 'date' || colId === 'symbol') return;
    setVisibleCols(prev => {
      const next = prev.includes(colId) ? prev.filter(c => c !== colId) : [...prev, colId];
      try {
        localStorage.setItem('portfolio_dividend_ledger_visible_cols', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const resetColumns = () => {
    setVisibleCols(DEFAULT_DIVIDEND_LEDGER_VISIBLE_COLS);
    resetColWidths();
    try {
      localStorage.removeItem('portfolio_dividend_ledger_visible_cols');
    } catch {}
  };

  const dividendColumnsConfig = [
    { id: 'date', label: t('calendar.col_date', 'Payment Date'), locked: true },
    { id: 'symbol', label: t('holdings.col_ticker', 'Ticker'), locked: true },
    { id: 'account', label: t('ledger.col_account', 'Account') },
    { id: 'shares', label: t('ledger.col_shares', 'Shares') },
    { id: 'payout', label: t('calendar.col_payout_share', 'Payout/Share') },
    { id: 'gross', label: `${t('metrics.gross', 'Gross')} (${baseCurrency})` },
    { id: 'net', label: `${t('calendar.col_net', 'Net')} (${baseCurrency})` },
    { id: 'type', label: t('ledger.col_type', 'Type') },
    ...(activePortfolioRole !== 'viewer' ? [{ id: 'actions', label: t('ledger.col_actions', 'Actions') }] : [])
  ];

  useEffect(() => {
    wasAtBottomRef.current = false;
    if (onScrollToBottomChange) {
      onScrollToBottomChange(false);
    }
  }, [dividends.length, searchQuery, onScrollToBottomChange]);

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

  // Filter dividends by Symbol, Account, or Date (ignoring future projected ones in ledger)
  const filteredDividends = useMemo(() => {
    const historical = dividends.filter(d => !d.is_upcoming);
    if (!searchQuery.trim()) return historical;
    const q = searchQuery.toLowerCase().trim();
    return historical.filter(d => 
      (d.symbol || '').toLowerCase().includes(q) || 
      (d.account || 'Default').toLowerCase().includes(q) ||
      (d.date || '').includes(q)
    );
  }, [dividends, searchQuery]);

  // Sort logic
  const sortedDividends = useMemo(() => {
    const list = [...filteredDividends];
    list.sort((a, b) => {
      let valA: any;
      let valB: any;

      if (sortField === 'date') {
        valA = a.date;
        valB = b.date;
      } else if (sortField === 'symbol') {
        valA = a.symbol;
        valB = b.symbol;
      } else if (sortField === 'account') {
        valA = a.account || 'Default';
        valB = b.account || 'Default';
      } else if (sortField === 'shares') {
        valA = a.shares;
        valB = b.shares;
      } else if (sortField === 'payout') {
        valA = a.payout_per_share;
        valB = b.payout_per_share;
      } else if (sortField === 'gross') {
        valA = a.gross_base;
        valB = b.gross_base;
      } else if (sortField === 'net') {
        valA = a.net_base;
        valB = b.net_base;
      } else if (sortField === 'type') {
        valA = a.is_manual ? 'Manual' : (a.is_override ? 'Override' : 'Auto');
        valB = b.is_manual ? 'Manual' : (b.is_override ? 'Override' : 'Auto');
      } else {
        valA = a.date;
        valB = b.date;
      }

      if (valA === undefined || valA === null) return sortAsc ? 1 : -1;
      if (valB === undefined || valB === null) return sortAsc ? -1 : 1;

      if (typeof valA === 'string' && typeof valB === 'string') {
        const comp = valA.localeCompare(valB, undefined, { sensitivity: 'base' });
        return sortAsc ? comp : -comp;
      }

      return sortAsc ? valA - valB : valB - valA;
    });
    return list;
  }, [filteredDividends, sortField, sortAsc]);

  const handleSort = (field: string) => {
    if (isResizingRef.current) return;
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field !== 'date');
    }
  };

  const renderSortArrow = (field: string) => {
    if (sortField !== field) {
      return <span style={{ opacity: 0.25, marginLeft: '4px', fontSize: '0.75rem' }}>↕</span>;
    }
    return sortAsc ? (
      <span style={{ color: 'var(--color-primary)', marginLeft: '4px', fontSize: '0.75rem' }}>▲</span>
    ) : (
      <span style={{ color: 'var(--color-primary)', marginLeft: '4px', fontSize: '0.75rem' }}>▼</span>
    );
  };

  const formatCurrency = (val: number, currency: string) => {
    return new Intl.NumberFormat(i18n.language || 'en', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const isViewer = activePortfolioRole === 'viewer';

  return (
    <div className="glass-panel" style={{ padding: 'var(--card-padding, 1rem)', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, minHeight: 0, ...style }}>
      
      {/* Search and Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Sparkles size={18} className="gradient-text" />
          <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{t('calendar.tab_payouts', 'Dividend History Log')}</h4>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
            {sortedDividends.length} {t('calendar.payments', 'Payments')}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Search Input */}
          <div className="search-container" style={{ position: 'relative', minWidth: '200px' }}>
            <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder={t('calendar.search_placeholder', 'Search ticker, account...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--panel-border)',
                borderRadius: '6px',
                padding: '0.45rem 0.75rem 0.45rem 2rem',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
                outline: 'none',
                transition: 'var(--transition-smooth)'
              }}
              onFocus={(e) => e.target.style.borderColor = 'rgba(59, 130, 246, 0.4)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--panel-border)'}
            />
          </div>

          {/* Columns Toggle Popover Button */}
          <div style={{ position: 'relative' }} ref={columnPickerRef}>
            <button
              type="button"
              onClick={() => setShowColumnPicker(prev => !prev)}
              title={t('common.toggle_columns', 'Toggle visible columns')}
              className="glow-btn"
              style={{
                padding: '0.45rem 0.75rem',
                fontSize: '0.78rem',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                height: '32px',
                background: showColumnPicker ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                border: showColumnPicker ? '1px solid var(--color-primary)' : '1px solid rgba(255, 255, 255, 0.08)',
                color: showColumnPicker ? 'var(--color-primary)' : 'var(--text-secondary)',
                transition: 'all 0.15s ease'
              }}
            >
              <SlidersHorizontal size={13} />
              <span>{t('common.columns', 'Columns')}</span>
            </button>

            {showColumnPicker && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  zIndex: 100,
                  minWidth: '220px',
                  background: 'rgba(15, 20, 34, 0.96)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid var(--panel-border)',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.6rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {t('common.columns', 'Columns')}
                  </span>
                  <button
                    type="button"
                    onClick={resetColumns}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--color-primary)',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      padding: '2px 4px',
                      borderRadius: '4px'
                    }}
                    title={t('common.reset', 'Reset')}
                  >
                    <RotateCcw size={11} />
                    <span>{t('common.reset', 'Reset')}</span>
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '280px', overflowY: 'auto' }}>
                  {dividendColumnsConfig.map((col) => {
                    const isChecked = visibleCols.includes(col.id);
                    return (
                      <label
                        key={col.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          fontSize: '0.78rem',
                          color: col.locked ? 'var(--text-muted)' : isChecked ? 'var(--text-primary)' : 'var(--text-secondary)',
                          cursor: col.locked ? 'not-allowed' : 'pointer',
                          userSelect: 'none',
                          padding: '3px 4px',
                          borderRadius: '4px',
                          transition: 'background 0.1s ease'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={col.locked}
                          onChange={() => toggleColumn(col.id)}
                          style={{ accentColor: 'var(--color-primary)', cursor: col.locked ? 'not-allowed' : 'pointer' }}
                        />
                        <span>{col.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          {activePortfolioRole !== 'viewer' && onAddDividendClick && (
            <button
              type="button"
              onClick={onAddDividendClick}
              className="glow-btn"
              style={{
                padding: '0.45rem 0.95rem',
                fontSize: '0.78rem',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                height: '32px',
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
                color: 'white',
                border: 'none',
                fontWeight: 600
              }}
            >
              <Plus size={14} />
              <span>{t('calendar.record_dividend', 'Record Dividend')}</span>
            </button>
          )}
          {onToggleViewMode && (
            <button
              type="button"
              onClick={onToggleViewMode}
              className="glow-btn"
              style={{
                padding: '0.45rem 0.95rem',
                fontSize: '0.78rem',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                height: '32px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--panel-border)',
                color: 'var(--text-secondary)'
              }}
              title={t('dividends.view_projections_tooltip', 'Back to Forecast & Calendar')}
            >
              <TrendingUp size={14} />
              <span>{t('dividends.view_projections', 'Forecast & Calendar')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Table Container */}
      <div 
        className="custom-scrollbar" 
        onScroll={handleScroll}
        style={{ overflowX: 'auto', flex: 1, minHeight: 0, overflowY: 'auto', border: '1px solid var(--panel-border)', borderRadius: '8px' }}
      >
        <table className="portfolio-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr>
              <th
                onClick={() => {
                  if (isResizingRef.current) return;
                  handleSort('date');
                }}
                style={{
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  position: 'sticky',
                  width: colWidths['date'] ? `${colWidths['date']}px` : undefined,
                  minWidth: colWidths['date'] ? `${colWidths['date']}px` : undefined
                }}
              >
                {t('calendar.col_date', 'Payment Date')} {renderSortArrow('date')}
                <div
                  className={`col-resizer ${activeDragCol === 'date' ? 'resizing' : ''}`}
                  onMouseDown={(e) => handleMouseDown(e, 'date')}
                  onClick={(e) => e.stopPropagation()}
                />
              </th>

              <th
                onClick={() => {
                  if (isResizingRef.current) return;
                  handleSort('symbol');
                }}
                style={{
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  position: 'sticky',
                  width: colWidths['symbol'] ? `${colWidths['symbol']}px` : undefined,
                  minWidth: colWidths['symbol'] ? `${colWidths['symbol']}px` : undefined
                }}
              >
                {t('holdings.col_ticker', 'Ticker')} {renderSortArrow('symbol')}
                <div
                  className={`col-resizer ${activeDragCol === 'symbol' ? 'resizing' : ''}`}
                  onMouseDown={(e) => handleMouseDown(e, 'symbol')}
                  onClick={(e) => e.stopPropagation()}
                />
              </th>

              {visibleCols.includes('account') && (
                <th
                  onClick={() => {
                    if (isResizingRef.current) return;
                    handleSort('account');
                  }}
                  style={{
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    position: 'sticky',
                    width: colWidths['account'] ? `${colWidths['account']}px` : undefined,
                    minWidth: colWidths['account'] ? `${colWidths['account']}px` : undefined
                  }}
                >
                  {t('ledger.col_account', 'Account')} {renderSortArrow('account')}
                  <div
                    className={`col-resizer ${activeDragCol === 'account' ? 'resizing' : ''}`}
                    onMouseDown={(e) => handleMouseDown(e, 'account')}
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
              )}

              {visibleCols.includes('shares') && (
                <th
                  onClick={() => {
                    if (isResizingRef.current) return;
                    handleSort('shares');
                  }}
                  style={{
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    textAlign: 'right',
                    position: 'sticky',
                    width: colWidths['shares'] ? `${colWidths['shares']}px` : undefined,
                    minWidth: colWidths['shares'] ? `${colWidths['shares']}px` : undefined
                  }}
                >
                  {t('ledger.col_shares', 'Shares')} {renderSortArrow('shares')}
                  <div
                    className={`col-resizer ${activeDragCol === 'shares' ? 'resizing' : ''}`}
                    onMouseDown={(e) => handleMouseDown(e, 'shares')}
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
              )}

              {visibleCols.includes('payout') && (
                <th
                  onClick={() => {
                    if (isResizingRef.current) return;
                    handleSort('payout');
                  }}
                  style={{
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    textAlign: 'right',
                    position: 'sticky',
                    width: colWidths['payout'] ? `${colWidths['payout']}px` : undefined,
                    minWidth: colWidths['payout'] ? `${colWidths['payout']}px` : undefined
                  }}
                >
                  {t('calendar.col_payout_share', 'Payout/Share')} {renderSortArrow('payout')}
                  <div
                    className={`col-resizer ${activeDragCol === 'payout' ? 'resizing' : ''}`}
                    onMouseDown={(e) => handleMouseDown(e, 'payout')}
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
              )}

              {visibleCols.includes('gross') && (
                <th
                  onClick={() => {
                    if (isResizingRef.current) return;
                    handleSort('gross');
                  }}
                  style={{
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    textAlign: 'right',
                    position: 'sticky',
                    width: colWidths['gross'] ? `${colWidths['gross']}px` : undefined,
                    minWidth: colWidths['gross'] ? `${colWidths['gross']}px` : undefined
                  }}
                >
                  {t('metrics.gross', 'Gross')} ({baseCurrency}) {renderSortArrow('gross')}
                  <div
                    className={`col-resizer ${activeDragCol === 'gross' ? 'resizing' : ''}`}
                    onMouseDown={(e) => handleMouseDown(e, 'gross')}
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
              )}

              {visibleCols.includes('net') && (
                <th
                  onClick={() => {
                    if (isResizingRef.current) return;
                    handleSort('net');
                  }}
                  style={{
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    textAlign: 'right',
                    position: 'sticky',
                    width: colWidths['net'] ? `${colWidths['net']}px` : undefined,
                    minWidth: colWidths['net'] ? `${colWidths['net']}px` : undefined
                  }}
                >
                  {t('calendar.col_net', 'Net')} ({baseCurrency}) {renderSortArrow('net')}
                  <div
                    className={`col-resizer ${activeDragCol === 'net' ? 'resizing' : ''}`}
                    onMouseDown={(e) => handleMouseDown(e, 'net')}
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
              )}

              {visibleCols.includes('type') && (
                <th
                  onClick={() => {
                    if (isResizingRef.current) return;
                    handleSort('type');
                  }}
                  style={{
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                    position: 'sticky',
                    width: colWidths['type'] ? `${colWidths['type']}px` : undefined,
                    minWidth: colWidths['type'] ? `${colWidths['type']}px` : undefined
                  }}
                >
                  {t('ledger.col_type', 'Type')} {renderSortArrow('type')}
                  <div
                    className={`col-resizer ${activeDragCol === 'type' ? 'resizing' : ''}`}
                    onMouseDown={(e) => handleMouseDown(e, 'type')}
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
              )}

              {!isViewer && visibleCols.includes('actions') && (
                <th
                  style={{
                    textAlign: 'right',
                    paddingRight: '1rem',
                    position: 'sticky',
                    width: colWidths['actions'] ? `${colWidths['actions']}px` : undefined,
                    minWidth: colWidths['actions'] ? `${colWidths['actions']}px` : undefined
                  }}
                >
                  {t('ledger.col_actions', 'Actions')}
                  <div
                    className={`col-resizer ${activeDragCol === 'actions' ? 'resizing' : ''}`}
                    onMouseDown={(e) => handleMouseDown(e, 'actions')}
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedDividends.length === 0 ? (
              <tr>
                <td colSpan={100} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  {t('calendar.empty_ledger_state', 'No dividend payments found in this view.')}
                </td>
              </tr>
            ) : (
              sortedDividends.map((div, index) => {
                const key = `${div.symbol}-${div.date}-${div.account}-${index}`;
                
                // Style for tags
                let tagColor = 'rgba(59, 130, 246, 0.1)';
                let tagTextColor = 'var(--color-primary)';
                let tagText = t('calendar.type_auto', 'Auto');
                if (div.is_manual) {
                  tagColor = 'rgba(168, 85, 247, 0.1)';
                  tagTextColor = '#a855f7';
                  tagText = t('calendar.type_manual', 'Manual');
                } else if (div.is_override) {
                  tagColor = 'rgba(234, 179, 8, 0.1)';
                  tagTextColor = '#eab308';
                  tagText = t('calendar.type_override', 'Override');
                }

                return (
                  <tr key={key} className="table-row">
                    <td style={{ fontWeight: 600, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {div.date}
                    </td>
                    <td>
                      <span className="ticker-badge" style={{ fontWeight: 700, fontSize: '0.78rem' }}>
                        {div.symbol}
                      </span>
                    </td>
                    {visibleCols.includes('account') && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {(() => {
                          const theme = getAccountNeonTheme(div.account, accountColors);
                          return (
                            <span style={{ 
                              fontSize: '0.75rem', 
                              padding: '2px 7px', 
                              borderRadius: '4px', 
                              background: theme.bg, 
                              color: theme.hex, 
                              border: theme.border,
                              boxShadow: theme.glow,
                              fontWeight: 700,
                              letterSpacing: '0.3px',
                              whiteSpace: 'nowrap',
                              display: 'inline-block'
                            }}>
                              {div.account || 'Default'}
                            </span>
                          );
                        })()}
                      </td>
                    )}
                    {visibleCols.includes('shares') && (
                      <td style={{ textAlign: 'right', fontWeight: 500, fontSize: '0.8rem' }}>
                        {div.shares}
                      </td>
                    )}
                    {visibleCols.includes('payout') && (
                      <td style={{ textAlign: 'right', fontWeight: 500, fontSize: '0.8rem' }}>
                        {div.payout_per_share}
                      </td>
                    )}
                    {visibleCols.includes('gross') && (
                      <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                        {formatCurrency(div.gross_base, baseCurrency)}
                      </td>
                    )}
                    {visibleCols.includes('net') && (
                      <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.8rem', color: 'var(--color-green)' }}>
                        {formatCurrency(div.net_base, baseCurrency)}
                      </td>
                    )}
                    {visibleCols.includes('type') && (
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          background: tagColor,
                          color: tagTextColor
                        }}>
                          {tagText}
                        </span>
                      </td>
                    )}
                    {!isViewer && visibleCols.includes('actions') && (
                      <td style={{ textAlign: 'right', paddingRight: '0.5rem', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                          <button
                            onClick={() => onEditDividendClick(div)}
                            title={t('calendar.action_edit_tooltip', 'Edit / Override payout values')}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: '4px',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'var(--transition-smooth)'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = 'var(--text-primary)';
                              e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = 'var(--text-muted)';
                              e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={() => onDeleteDividendClick(div)}
                            title={div.is_manual ? t('calendar.action_delete_manual_tooltip', 'Delete manual dividend') : t('calendar.action_delete_auto_tooltip', 'Delete / Skip this automatic payout')}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'rgba(239, 68, 68, 0.6)',
                              cursor: 'pointer',
                              padding: '4px',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'var(--transition-smooth)'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = 'var(--color-red)';
                              e.currentTarget.style.background = 'rgba(239,68,68,0.08)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = 'rgba(239, 68, 68, 0.6)';
                              e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
            {/* Bottom Clearance Spacer for Floating Action Buttons (FABs) */}
            {sortedDividends.length > 0 && (
              <tr className="table-fab-clearance-row" aria-hidden="true">
                <td colSpan={100} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
