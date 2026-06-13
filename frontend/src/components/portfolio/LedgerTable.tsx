import { useState, useMemo } from 'react';
import { History, Edit2, Trash2, Search } from 'lucide-react';
import type { Transaction } from '../../types/portfolio';
import { useTranslation } from 'react-i18next';

interface LedgerTableProps {
  transactions: Transaction[];
  activePortfolioRole: string;
  onEditTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
}

export function LedgerTable({
  transactions,
  activePortfolioRole,
  onEditTransaction,
  onDeleteTransaction
}: LedgerTableProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<string>('date');
  const [sortAsc, setSortAsc] = useState<boolean>(false); // default: newest transactions first

  // Local filtering by Symbol or Account name
  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return transactions;
    const q = searchQuery.toLowerCase().trim();
    return transactions.filter(tx => 
      tx.symbol.toLowerCase().includes(q) || 
      (tx.account || 'Default').toLowerCase().includes(q) ||
      tx.date.includes(q) ||
      tx.type.toLowerCase().includes(q)
    );
  }, [transactions, searchQuery]);

  // Sorting logic for all columns
  const sortedTransactions = useMemo(() => {
    // Precompute totalLocal to sort efficiently
    const list = filteredTransactions.map(tx => {
      const totalLocal = (tx.shares * tx.price) + (tx.type === 'BUY' ? tx.fees : -tx.fees);
      return {
        ...tx,
        totalLocal
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
  }, [filteredTransactions, sortField, sortAsc]);

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
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h3 className="portfolio-section-title" style={{ margin: 0 }}>{t('ledger.header', 'Transaction History Ledger')}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {/* Search Input */}
          {transactions.length > 0 && (
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
                  width: '200px',
                  borderRadius: '6px'
                }}
              />
            </div>
          )}
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {t('ledger.total_operations', 'Total operations recorded')}: {transactions.length}
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
          <p>{t('ledger.no_matches', 'No transactions match your search query.')}</p>
        </div>
      ) : (
        <div className="table-wrapper">
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
                  {t('ledger.col_price', 'Price')} (Local) {renderSortArrow('price')}
                </th>
                <th onClick={() => handleSort('fees')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>
                  {t('ledger.col_fees', 'Fees')} (Local) {renderSortArrow('fees')}
                </th>
                <th onClick={() => handleSort('total')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>
                  {t('ledger.col_value', 'Net Value')} (Local) {renderSortArrow('total')}
                </th>
                <th style={{ textAlign: 'center', cursor: 'default', background: 'rgba(255, 255, 255, 0.01)' }}>
                  {t('ledger.col_actions', 'Actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedTransactions.map((tx) => {
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
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      {tx.account || 'Default'}
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
