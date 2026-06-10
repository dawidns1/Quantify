import { useState, useMemo } from 'react';
import { History, Edit2, Trash2, Search } from 'lucide-react';
import type { Transaction } from '../../types/portfolio';

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
  const [searchQuery, setSearchQuery] = useState('');

  // Local filtering by Symbol or Account name
  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return transactions;
    const q = searchQuery.toLowerCase().trim();
    return transactions.filter(tx => 
      tx.symbol.toLowerCase().includes(q) || 
      (tx.account || 'Default').toLowerCase().includes(q)
    );
  }, [transactions, searchQuery]);

  const formatCurrency = (val: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h3 className="portfolio-section-title" style={{ margin: 0 }}>Recorded Transactions Ledger</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {/* Search Input */}
          {transactions.length > 0 && (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder="Search symbol/account..." 
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
            Total operations recorded: {transactions.length}
          </span>
        </div>
      </div>

      {transactions.length === 0 ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <History size={48} style={{ strokeWidth: 1, marginBottom: '1rem', opacity: 0.5 }} />
          <p>No transaction history recorded.</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Use "Add Transaction" to input buys/sells.</p>
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <p>No transactions match your search query.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="screener-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Action</th>
                <th>Symbol</th>
                <th>Account</th>
                <th style={{ textAlign: 'right' }}>Shares</th>
                <th style={{ textAlign: 'right' }}>Price (Local)</th>
                <th style={{ textAlign: 'right' }}>Fees (Local)</th>
                <th style={{ textAlign: 'right' }}>Total (Local)</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((tx) => {
                const totalLocal = (tx.shares * tx.price) + (tx.type === 'BUY' ? tx.fees : -tx.fees);
                return (
                  <tr key={tx.id} className="interactive-row">
                    <td style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      {tx.date}
                    </td>
                    <td>
                      <span className={`ledger-type-badge ${tx.type === 'BUY' ? 'badge-buy' : 'badge-sell'}`}>
                        {tx.type}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {tx.symbol}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      {tx.account || 'Default'}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {tx.shares}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {formatCurrency(tx.price, tx.currency)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                      {tx.fees > 0 ? formatCurrency(tx.fees, tx.currency) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                      {formatCurrency(totalLocal, tx.currency)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {activePortfolioRole === 'viewer' ? (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', alignItems: 'center' }}>
                          <button 
                            onClick={() => onEditTransaction(tx)}
                            className="ledger-delete-btn"
                            style={{ color: 'var(--text-secondary)' }}
                            title="Edit Transaction"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button 
                            onClick={() => onDeleteTransaction(tx.id)}
                            className="ledger-delete-btn"
                            title="Delete Transaction"
                          >
                            <Trash2 size={15} />
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
