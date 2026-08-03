import { useState, useMemo, useEffect, useRef } from 'react';
import { History, Edit2, Trash2, Search, Upload, Download } from 'lucide-react';
import type { Transaction } from '../../types/portfolio';
import { useTranslation } from 'react-i18next';
import { getAccountNeonTheme } from '../../utils/accountColors';

interface LedgerTableProps {
  transactions: Transaction[];
  holdings?: any[];
  activePortfolioRole: string;
  onEditTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
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
  onImportCSVClick,
  onExportCSVClick,
  style,
  onScrollToBottomChange,
  accountColors = {}
}: LedgerTableProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<string>('date');
  const [sortAsc, setSortAsc] = useState<boolean>(false); // default: newest transactions first
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');

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
          {activePortfolioRole !== 'viewer' && onImportCSVClick && (
            <div style={{ display: 'flex', gap: '0.4rem' }}>
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
            </div>
          )}
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
                <th onClick={() => handleSort('date')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  {t('ledger.col_date', 'Date')} {renderSortArrow('date')}
                </th>
                <th onClick={() => handleSort('type')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  {t('ledger.col_type', 'Type')} {renderSortArrow('type')}
                </th>
                <th onClick={() => handleSort('symbol')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  {t('ledger.col_symbol', 'Symbol')} {renderSortArrow('symbol')}
                </th>
                <th onClick={() => handleSort('account')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  {t('ledger.col_account', 'Account')} {renderSortArrow('account')}
                </th>
                <th onClick={() => handleSort('shares')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>
                  {t('ledger.col_shares', 'Shares')} {renderSortArrow('shares')}
                </th>
                <th onClick={() => handleSort('price')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>
                  {t('ledger.col_price', 'Price')} {renderSortArrow('price')}
                </th>
                <th onClick={() => handleSort('fees')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>
                  {t('ledger.col_fees', 'Fees')} {renderSortArrow('fees')}
                </th>
                <th onClick={() => handleSort('total')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>
                  {t('ledger.col_value', 'Total Value')} {renderSortArrow('total')}
                </th>
                <th onClick={() => handleSort('return')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>
                  {t('ledger.col_return', 'Return')} {renderSortArrow('return')}
                </th>
                <th style={{ textAlign: 'center', cursor: 'default', background: 'rgba(255, 255, 255, 0.01)' }}>
                  {t('ledger.col_actions', 'Actions')}
                </th>
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
                    <td>
                      <span className={`ledger-type-badge ${tx.type === 'BUY' ? 'badge-buy' : 'badge-sell'}`}>
                        {tx.type === 'BUY' ? t('modals.add_tx.type_buy', 'Buy') : t('modals.add_tx.type_sell', 'Sell')}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {tx.symbol}
                    </td>
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
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {formatShares(tx.shares)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {formatCurrency(tx.price, tx.currency)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                      {tx.fees > 0 ? formatCurrency(tx.fees, tx.currency) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                      {formatCurrency(tx.totalLocal, tx.currency)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {tx.type === 'BUY' ? (
                        (tx as any).isFullyClosed ? (
                          <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)' }}>
                            Closed
                          </span>
                        ) : gainPct !== undefined && !isNaN(gainPct) ? (
                          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              background: gainPct >= 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                              color: gainPct >= 0 ? '#10b981' : '#ef4444',
                              border: gainPct >= 0 ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)'
                            }}>
                              {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(2)}%
                            </span>
                            {(tx as any).openShares < tx.shares && (
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {(tx as any).openShares.toFixed(2)}/{tx.shares} open
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                        )
                      ) : (
                        gainPct !== undefined && !isNaN(gainPct) ? (
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background: gainPct >= 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            color: gainPct >= 0 ? '#10b981' : '#ef4444',
                            border: gainPct >= 0 ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)'
                          }}>
                            {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(2)}% Realized
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                        )
                      )}
                    </td>
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
