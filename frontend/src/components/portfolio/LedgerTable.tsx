import { useState, useMemo, useEffect, useRef } from 'react';
import { History, Edit2, Trash2, Search, Upload, Download, Plus, SlidersHorizontal, RotateCcw } from 'lucide-react';
import type { Transaction } from '../../types/portfolio';
import { useTranslation } from 'react-i18next';
import { getAccountNeonTheme } from '../../utils/accountColors';
import { useTableColumnResize } from '../../hooks/useTableColumnResize';

const DEFAULT_LEDGER_COL_WIDTHS: Record<string, number> = {
  date: 110,
  type: 85,
  symbol: 100,
  account: 110,
  shares: 95,
  price: 110,
  fees: 85,
  total: 125,
  gain_status: 120,
  actions: 80
};

const DEFAULT_LEDGER_VISIBLE_COLS = [
  'date',
  'type',
  'symbol',
  'account',
  'shares',
  'price',
  'fees',
  'total',
  'gain_status',
  'actions'
];

interface LedgerTableProps {
  transactions: Transaction[];
  holdings?: any[];
  activePortfolioRole: string;
  onEditTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  onAddTransactionClick?: () => void;
  onImportCSVClick?: () => void;
  onExportCSVClick?: () => void;
  style?: React.CSSProperties;
  onScrollToBottomChange?: (isAtBottom: boolean) => void;
  accountColors?: Record<string, string>;
}

export function LedgerTable({
  transactions,
  holdings = [],
  activePortfolioRole,
  onEditTransaction,
  onDeleteTransaction,
  onAddTransactionClick,
  onImportCSVClick,
  onExportCSVClick,
  style,
  onScrollToBottomChange,
  accountColors = {}
}: LedgerTableProps) {
  const { t, i18n } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<string>('date');
  const [sortAsc, setSortAsc] = useState<boolean>(false); // default: newest transactions first
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');

  const {
    colWidths,
    handleMouseDown,
    activeDragCol,
    isResizingRef,
    resetColWidths
  } = useTableColumnResize('portfolio_ledger_col_widths', DEFAULT_LEDGER_COL_WIDTHS);

  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    try {
      const cached = localStorage.getItem('portfolio_ledger_visible_cols');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_LEDGER_VISIBLE_COLS;
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
        localStorage.setItem('portfolio_ledger_visible_cols', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const resetColumns = () => {
    setVisibleCols(DEFAULT_LEDGER_VISIBLE_COLS);
    resetColWidths();
    try {
      localStorage.removeItem('portfolio_ledger_visible_cols');
    } catch {}
  };

  const ledgerColumnsConfig = [
    { id: 'date', label: t('ledger.col_date', 'Date'), locked: true },
    { id: 'type', label: t('ledger.col_type', 'Type') },
    { id: 'symbol', label: t('holdings.col_ticker', 'Ticker'), locked: true },
    { id: 'account', label: t('ledger.col_account', 'Account') },
    { id: 'shares', label: t('ledger.col_shares', 'Shares') },
    { id: 'price', label: t('ledger.col_price', 'Price') },
    { id: 'fees', label: t('ledger.col_fees', 'Fees') },
    { id: 'total', label: t('ledger.col_value', 'Total Value') },
    { id: 'gain_status', label: t('ledger.col_return', 'Return') },
    ...(activePortfolioRole !== 'viewer' ? [{ id: 'actions', label: t('ledger.col_actions', 'Actions') }] : [])
  ];

  const wasAtBottomRef = useRef(false);

  useEffect(() => {
    wasAtBottomRef.current = false;
    if (onScrollToBottomChange) {
      onScrollToBottomChange(false);
    }
  }, [transactions.length, searchQuery, statusFilter, onScrollToBottomChange]);

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

  // Precompute FIFO lot matching across all transactions grouped by symbol
  const fifoProcessedTransactions = useMemo(() => {
    // Group transactions by symbol
    const txsBySymbol: Record<string, Transaction[]> = {};
    for (const tx of transactions) {
      const sym = (tx.symbol || '').toUpperCase().trim();
      if (!txsBySymbol[sym]) {
        txsBySymbol[sym] = [];
      }
      txsBySymbol[sym].push(tx);
    }

    const processedMap: Record<string, { openShares: number; isFullyClosed: boolean; gainVal: number; gainPct: number; isRealized: boolean }> = {};

    for (const [sym, symTxs] of Object.entries(txsBySymbol)) {
      const sortedSymTxs = [...symTxs].sort((a, b) => a.date.localeCompare(b.date));
      const buyLots: Record<string, { initialShares: number; openShares: number; avgCostPerShare: number }> = {};

      for (const tx of sortedSymTxs) {
        if (tx.type === 'BUY') {
          const costBasis = (tx.shares * tx.price) + tx.fees;
          const avgCost = tx.shares > 0 ? costBasis / tx.shares : tx.price;
          buyLots[tx.id] = {
            initialShares: tx.shares,
            openShares: tx.shares,
            avgCostPerShare: avgCost
          };
        }
      }

      for (const tx of sortedSymTxs) {
        if (tx.type === 'SELL') {
          let sharesToSell = tx.shares;
          let totalCostBasisOfSold = 0;
          let matchedShares = 0;

          for (const buyTx of sortedSymTxs) {
            if (buyTx.type !== 'BUY') continue;
            if (buyTx.date > tx.date) break;

            const lot = buyLots[buyTx.id];
            if (!lot || lot.openShares <= 0) continue;

            const take = Math.min(sharesToSell, lot.openShares);
            lot.openShares -= take;
            sharesToSell -= take;
            totalCostBasisOfSold += take * lot.avgCostPerShare;
            matchedShares += take;

            if (sharesToSell <= 0) break;
          }

          const effectiveCostBasis = matchedShares > 0 ? totalCostBasisOfSold : (tx.shares * tx.price);
          const sellProceeds = (tx.shares * tx.price) - tx.fees;
          const realizedGainVal = sellProceeds - effectiveCostBasis;
          const realizedGainPct = effectiveCostBasis > 0 ? (realizedGainVal / effectiveCostBasis) * 100 : 0;

          processedMap[tx.id] = {
            openShares: 0,
            isFullyClosed: true,
            gainVal: realizedGainVal,
            gainPct: realizedGainPct,
            isRealized: true
          };
        }
      }

      // Map BUY lots after FIFO matching
      const holding = holdings.find(h => (h.symbol || '').toUpperCase() === sym);

      for (const tx of sortedSymTxs) {
        if (tx.type === 'BUY') {
          const lot = buyLots[tx.id];
          const openShares = lot ? lot.openShares : tx.shares;
          const isFullyClosed = openShares <= 0.00001;

          let gainVal = 0;
          let gainPct = 0;
          if (holding && holding.current_price_local > 0) {
            const txCurr = (tx.currency || 'USD').toUpperCase();
            const holdingCurr = (holding.currency || 'USD').toUpperCase();
            let livePriceInTxCurrency = holding.current_price_local;

            if (txCurr !== holdingCurr && holding.fx_rate && holding.fx_rate > 0) {
              livePriceInTxCurrency = holding.current_price_local * holding.fx_rate;
            }

            const avgCost = lot ? lot.avgCostPerShare : (tx.price + (tx.fees / (tx.shares || 1)));
            const costBasisForOpen = openShares * avgCost;
            const currentValueForOpen = openShares * livePriceInTxCurrency;
            gainVal = currentValueForOpen - costBasisForOpen;
            gainPct = costBasisForOpen > 0 ? (gainVal / costBasisForOpen) * 100 : 0;
          }

          processedMap[tx.id] = {
            openShares,
            isFullyClosed,
            gainVal,
            gainPct,
            isRealized: false
          };
        }
      }
    }

    return processedMap;
  }, [transactions, holdings]);

  // Local filtering by Symbol, Account name, and Status Filter (All / Open / Closed)
  const filteredTransactions = useMemo(() => {
    let list = transactions;

    if (statusFilter === 'open') {
      list = list.filter(tx => {
        const proc = fifoProcessedTransactions[tx.id];
        return tx.type === 'BUY' && proc && proc.openShares > 0;
      });
    } else if (statusFilter === 'closed') {
      list = list.filter(tx => {
        const proc = fifoProcessedTransactions[tx.id];
        return tx.type === 'SELL' || (proc && proc.isFullyClosed);
      });
    }

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(tx => 
      tx.symbol.toLowerCase().includes(q) || 
      (tx.account || 'Default').toLowerCase().includes(q) ||
      tx.date.includes(q) ||
      tx.type.toLowerCase().includes(q)
    );
  }, [transactions, searchQuery, statusFilter, fifoProcessedTransactions]);

  // Sorting logic for all columns
  const sortedTransactions = useMemo(() => {
    const list = filteredTransactions.map(tx => {
      const totalLocal = (tx.shares * tx.price) + (tx.type === 'BUY' ? tx.fees : -tx.fees);
      const proc = fifoProcessedTransactions[tx.id];
      return {
        ...tx,
        totalLocal,
        gainVal: proc?.gainVal ?? 0,
        gainPct: proc?.gainPct ?? 0,
        openShares: proc?.openShares ?? tx.shares,
        isFullyClosed: proc?.isFullyClosed ?? false,
        isRealized: proc?.isRealized ?? false
      };
    });

    list.sort((a, b) => {
      let valA: any;
      let valB: any;

      if (sortField === 'date') {
        valA = a.date;
        valB = b.date;
      } else if (sortField === 'type') {
        valA = a.type;
        valB = b.type;
      } else if (sortField === 'symbol') {
        valA = a.symbol;
        valB = b.symbol;
      } else if (sortField === 'account') {
        valA = a.account || 'Default';
        valB = b.account || 'Default';
      } else if (sortField === 'shares') {
        valA = a.shares;
        valB = b.shares;
      } else if (sortField === 'price') {
        valA = a.price;
        valB = b.price;
      } else if (sortField === 'fees') {
        valA = a.fees;
        valB = b.fees;
      } else if (sortField === 'total') {
        valA = a.totalLocal;
        valB = b.totalLocal;
      } else if (sortField === 'return') {
        valA = a.gainPct;
        valB = b.gainPct;
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
  }, [filteredTransactions, sortField, sortAsc, fifoProcessedTransactions]);

  const handleSort = (field: string) => {
    if (isResizingRef.current) return;
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      // default: ascending for text/numbers, descending for dates
      setSortAsc(field !== 'date');
    }
  };

  const renderSortArrow = (field: string) => {
    if (sortField !== field) {
      return <span style={{ opacity: 0.25, marginLeft: '6px', fontSize: '0.8rem' }}>↕</span>;
    }
    return sortAsc ? (
      <span style={{ color: 'var(--color-primary)', marginLeft: '6px', fontSize: '0.8rem' }}>▲</span>
    ) : (
      <span style={{ color: 'var(--color-primary)', marginLeft: '6px', fontSize: '0.8rem' }}>▼</span>
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

  const formatShares = (shares: number) => {
    return (Math.round(shares * 10000) / 10000).toString();
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: 'var(--card-padding, 1rem)', ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h3 className="portfolio-section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <History size={18} className="gradient-text" style={{ flexShrink: 0 }} />
          <span>{t('ledger.header', 'Transaction History Ledger')}</span>
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {/* Search Input */}
          {transactions.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
                <input 
                  type="text" 
                  placeholder={t('ledger.search_placeholder', 'Search ledger...')} 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-field"
                  style={{ 
                    paddingLeft: '30px', 
                    fontSize: '0.78rem', 
                    height: '32px', 
                    width: '180px',
                    borderRadius: '6px'
                  }}
                />
              </div>

              {/* Filter Pills */}
              <div style={{ display: 'flex', gap: '2px', background: 'rgba(0, 0, 0, 0.3)', padding: '2px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.08)', height: '32px', alignItems: 'center' }}>
                <button 
                  type="button"
                  onClick={() => setStatusFilter('all')} 
                  style={{ 
                    padding: '3px 9px', 
                    fontSize: '0.72rem', 
                    fontWeight: statusFilter === 'all' ? 700 : 500, 
                    borderRadius: '4px', 
                    border: 'none', 
                    background: statusFilter === 'all' ? 'rgba(6, 182, 212, 0.2)' : 'transparent', 
                    color: statusFilter === 'all' ? '#06b6d4' : 'var(--text-muted)', 
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {t('ledger.filter_all', 'All')}
                </button>
                <button 
                  type="button"
                  onClick={() => setStatusFilter('open')} 
                  style={{ 
                    padding: '3px 9px', 
                    fontSize: '0.72rem', 
                    fontWeight: statusFilter === 'open' ? 700 : 500, 
                    borderRadius: '4px', 
                    border: 'none', 
                    background: statusFilter === 'open' ? 'rgba(16, 185, 129, 0.2)' : 'transparent', 
                    color: statusFilter === 'open' ? '#10b981' : 'var(--text-muted)', 
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {t('ledger.filter_open', 'Open Lots')}
                </button>
                <button 
                  type="button"
                  onClick={() => setStatusFilter('closed')} 
                  style={{ 
                    padding: '3px 9px', 
                    fontSize: '0.72rem', 
                    fontWeight: statusFilter === 'closed' ? 700 : 500, 
                    borderRadius: '4px', 
                    border: 'none', 
                    background: statusFilter === 'closed' ? 'rgba(239, 68, 68, 0.2)' : 'transparent', 
                    color: statusFilter === 'closed' ? '#ef4444' : 'var(--text-muted)', 
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {t('ledger.filter_closed', 'Closed Lots')}
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
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
                    {ledgerColumnsConfig.map((col) => {
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

            {activePortfolioRole !== 'viewer' && (
              <>
                {onAddTransactionClick && (
                  <button
                    type="button"
                    onClick={onAddTransactionClick}
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
                    <span>{t('dashboard.btn_add_tx', 'Add Transaction')}</span>
                  </button>
                )}
                {onImportCSVClick && (
                  <button
                    onClick={onImportCSVClick}
                    className="glow-btn"
                    style={{
                      padding: '0.45rem 1rem',
                      fontSize: '0.78rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      height: '32px'
                    }}
                  >
                    <Upload size={14} />
                    <span>{t('ledger.btn_import_csv', 'Import')}</span>
                  </button>
                )}
                {onExportCSVClick && (
                  <button
                    onClick={onExportCSVClick}
                    className="glow-btn"
                    style={{
                      padding: '0.45rem 1rem',
                      fontSize: '0.78rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      height: '32px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: 'var(--text-secondary)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                      e.currentTarget.style.color = 'white';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                  >
                    <Download size={14} />
                    <span>{t('ledger.btn_export_csv', 'Export')}</span>
                  </button>
                )}
              </>
            )}
          </div>
          <span style={{ fontSize: '0.83rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {t('ledger.total_operations', 'Total operations recorded')}: <span style={{ display: 'inline-block', minWidth: '28px', textAlign: 'left', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--text-primary)' }}>{filteredTransactions.length}</span>
          </span>
        </div>
      </div>

      {transactions.length === 0 ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <History size={48} style={{ strokeWidth: 1, marginBottom: '1rem', opacity: 0.5 }} />
          <p>{t('ledger.empty_state', 'No transactions logged in this portfolio yet.')}</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>{t('ledger.empty_state_desc', 'Use "Add Transaction" to input buys/sells.')}</p>
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <p>{t('ledger.no_matches', 'No transactions match your search query or status filter.')}</p>
        </div>
      ) : (
        <div className="table-wrapper" onScroll={handleScroll} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <table className="screener-table">
            <thead>
              <tr>
                <th
                  onClick={() => {
                    if (isResizingRef.current) return;
                    handleSort('date');
                  }}
                  style={{
                    cursor: 'pointer',
                    userSelect: 'none',
                    position: 'sticky',
                    width: colWidths['date'] ? `${colWidths['date']}px` : undefined,
                    minWidth: colWidths['date'] ? `${colWidths['date']}px` : undefined
                  }}
                >
                  {t('ledger.col_date', 'Date')} {renderSortArrow('date')}
                  <div
                    className={`col-resizer ${activeDragCol === 'date' ? 'resizing' : ''}`}
                    onMouseDown={(e) => handleMouseDown(e, 'date')}
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>

                {visibleCols.includes('type') && (
                  <th
                    onClick={() => {
                      if (isResizingRef.current) return;
                      handleSort('type');
                    }}
                    style={{
                      cursor: 'pointer',
                      userSelect: 'none',
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

                <th
                  onClick={() => {
                    if (isResizingRef.current) return;
                    handleSort('symbol');
                  }}
                  style={{
                    cursor: 'pointer',
                    userSelect: 'none',
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
                      userSelect: 'none',
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
                      textAlign: 'right',
                      cursor: 'pointer',
                      userSelect: 'none',
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

                {visibleCols.includes('price') && (
                  <th
                    onClick={() => {
                      if (isResizingRef.current) return;
                      handleSort('price');
                    }}
                    style={{
                      textAlign: 'right',
                      cursor: 'pointer',
                      userSelect: 'none',
                      position: 'sticky',
                      width: colWidths['price'] ? `${colWidths['price']}px` : undefined,
                      minWidth: colWidths['price'] ? `${colWidths['price']}px` : undefined
                    }}
                  >
                    {t('ledger.col_price', 'Price')} {renderSortArrow('price')}
                    <div
                      className={`col-resizer ${activeDragCol === 'price' ? 'resizing' : ''}`}
                      onMouseDown={(e) => handleMouseDown(e, 'price')}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                )}

                {visibleCols.includes('fees') && (
                  <th
                    onClick={() => {
                      if (isResizingRef.current) return;
                      handleSort('fees');
                    }}
                    style={{
                      textAlign: 'right',
                      cursor: 'pointer',
                      userSelect: 'none',
                      position: 'sticky',
                      width: colWidths['fees'] ? `${colWidths['fees']}px` : undefined,
                      minWidth: colWidths['fees'] ? `${colWidths['fees']}px` : undefined
                    }}
                  >
                    {t('ledger.col_fees', 'Fees')} {renderSortArrow('fees')}
                    <div
                      className={`col-resizer ${activeDragCol === 'fees' ? 'resizing' : ''}`}
                      onMouseDown={(e) => handleMouseDown(e, 'fees')}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                )}

                {visibleCols.includes('total') && (
                  <th
                    onClick={() => {
                      if (isResizingRef.current) return;
                      handleSort('total');
                    }}
                    style={{
                      textAlign: 'right',
                      cursor: 'pointer',
                      userSelect: 'none',
                      position: 'sticky',
                      width: colWidths['total'] ? `${colWidths['total']}px` : undefined,
                      minWidth: colWidths['total'] ? `${colWidths['total']}px` : undefined
                    }}
                  >
                    {t('ledger.col_value', 'Total Value')} {renderSortArrow('total')}
                    <div
                      className={`col-resizer ${activeDragCol === 'total' ? 'resizing' : ''}`}
                      onMouseDown={(e) => handleMouseDown(e, 'total')}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                )}

                {visibleCols.includes('gain_status') && (
                  <th
                    onClick={() => {
                      if (isResizingRef.current) return;
                      handleSort('return');
                    }}
                    style={{
                      textAlign: 'right',
                      cursor: 'pointer',
                      userSelect: 'none',
                      position: 'sticky',
                      width: colWidths['gain_status'] ? `${colWidths['gain_status']}px` : undefined,
                      minWidth: colWidths['gain_status'] ? `${colWidths['gain_status']}px` : undefined
                    }}
                  >
                    {t('ledger.col_return', 'Return')} {renderSortArrow('return')}
                    <div
                      className={`col-resizer ${activeDragCol === 'gain_status' ? 'resizing' : ''}`}
                      onMouseDown={(e) => handleMouseDown(e, 'gain_status')}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                )}

                {visibleCols.includes('actions') && (
                  <th
                    style={{
                      textAlign: 'center',
                      cursor: 'default',
                      background: 'rgba(255, 255, 255, 0.01)',
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
              {sortedTransactions.map((tx) => {
                const gainPct = (tx as any).gainPct;
                return (
                  <tr key={tx.id} className="interactive-row">
                    <td style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      {tx.date}
                    </td>
                    {visibleCols.includes('type') && (
                      <td style={{ fontWeight: 700, fontSize: '0.8rem', color: tx.type === 'BUY' ? '#10b981' : '#ef4444' }}>
                        {tx.type === 'BUY' ? t('modals.add_tx.type_buy', 'Buy') : t('modals.add_tx.type_sell', 'Sell')}
                      </td>
                    )}
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {tx.symbol}
                    </td>
                    {visibleCols.includes('account') && (
                      <td>
                        {(() => {
                          const theme = getAccountNeonTheme(tx.account, accountColors);
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
                              letterSpacing: '0.3px'
                            }}>
                              {tx.account || 'Default'}
                            </span>
                          );
                        })()}
                      </td>
                    )}
                    {visibleCols.includes('shares') && (
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                        {formatShares(tx.shares)}
                      </td>
                    )}
                    {visibleCols.includes('price') && (
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                        {formatCurrency(tx.price, tx.currency)}
                      </td>
                    )}
                    {visibleCols.includes('fees') && (
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                        {tx.fees > 0 ? formatCurrency(tx.fees, tx.currency) : '—'}
                      </td>
                    )}
                    {visibleCols.includes('total') && (
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                        {formatCurrency(tx.totalLocal, tx.currency)}
                      </td>
                    )}
                    {visibleCols.includes('gain_status') && (
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                        {tx.type === 'BUY' ? (
                          (tx as any).isFullyClosed ? (
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                              {t('holdings.lot_status_closed', 'Closed')}
                            </span>
                          ) : gainPct !== undefined && !isNaN(gainPct) ? (
                            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                              <span style={{
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                color: gainPct >= 0 ? '#10b981' : '#ef4444'
                              }}>
                                {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(2)}%
                              </span>
                              {(tx as any).openShares < tx.shares && (
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  {t('holdings.lot_status_open', { open: (tx as any).openShares.toFixed(2), total: tx.shares, defaultValue: `${(tx as any).openShares.toFixed(2)}/${tx.shares} open` })}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                          )
                        ) : (
                          gainPct !== undefined && !isNaN(gainPct) ? (
                            <span style={{
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              color: gainPct >= 0 ? '#10b981' : '#ef4444'
                            }}>
                              {t('holdings.lot_status_realized', { gain: `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}%`, defaultValue: `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}% Realized` })}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                          )
                        )}
                      </td>
                    )}
                    {visibleCols.includes('actions') && (
                      <td style={{ textAlign: 'center' }}>
                        {activePortfolioRole === 'viewer' ? (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        ) : (
                          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', alignItems: 'center' }}>
                            <button 
                              onClick={() => onEditTransaction(tx)}
                              className="ledger-delete-btn"
                              style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '4px', borderRadius: '4px' }}
                              title={t('modals.add_tx.edit_title', 'Edit Transaction')}
                            >
                              <Edit2 size={13} />
                            </button>
                            <button 
                              onClick={() => onDeleteTransaction(tx.id)}
                              className="ledger-delete-btn"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '4px', borderRadius: '4px' }}
                              title={t('ledger.action_delete', 'Delete')}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {/* Bottom Clearance Spacer for Floating Action Buttons (FABs) */}
              {filteredTransactions.length > 0 && (
                <tr className="table-fab-clearance-row" aria-hidden="true">
                  <td colSpan={100} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
