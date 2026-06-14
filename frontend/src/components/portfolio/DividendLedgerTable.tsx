import { useState, useMemo } from 'react';
import { Search, Edit2, Trash2, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface DividendLedgerTableProps {
  dividends: any[];
  activePortfolioRole: string;
  baseCurrency: string;
  onEditDividendClick: (div: any) => void;
  onDeleteDividendClick: (div: any) => void;
}

export function DividendLedgerTable({
  dividends,
  activePortfolioRole,
  baseCurrency,
  onEditDividendClick,
  onDeleteDividendClick
}: DividendLedgerTableProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<string>('date');
  const [sortAsc, setSortAsc] = useState<boolean>(false); // default: newest dividends first

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
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const isViewer = activePortfolioRole === 'viewer';

  return (
    <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      
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
          <div className="search-container" style={{ position: 'relative', minWidth: '220px' }}>
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
        </div>
      </div>

      {/* Table Container */}
      <div className="custom-scrollbar" style={{ overflowX: 'auto' }}>
        <table className="portfolio-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr>
              <th onClick={() => handleSort('date')} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {t('calendar.col_date', 'Payment Date')} {renderSortArrow('date')}
              </th>
              <th onClick={() => handleSort('symbol')} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {t('holdings.col_ticker', 'Ticker')} {renderSortArrow('symbol')}
              </th>
              <th onClick={() => handleSort('account')} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {t('ledger.col_account', 'Account')} {renderSortArrow('account')}
              </th>
              <th onClick={() => handleSort('shares')} style={{ cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'right' }}>
                {t('ledger.col_shares', 'Shares')} {renderSortArrow('shares')}
              </th>
              <th onClick={() => handleSort('payout')} style={{ cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'right' }}>
                {t('calendar.col_payout_share', 'Payout/Share')} {renderSortArrow('payout')}
              </th>
              <th onClick={() => handleSort('gross')} style={{ cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'right' }}>
                {t('metrics.gross', 'Gross')} ({baseCurrency}) {renderSortArrow('gross')}
              </th>
              <th onClick={() => handleSort('net')} style={{ cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'right' }}>
                {t('calendar.col_net', 'Net')} ({baseCurrency}) {renderSortArrow('net')}
              </th>
              <th onClick={() => handleSort('type')} style={{ cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'center' }}>
                {t('ledger.col_type', 'Type')} {renderSortArrow('type')}
              </th>
              {!isViewer && <th style={{ textAlign: 'right', paddingRight: '1rem' }}>{t('ledger.col_actions', 'Actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {sortedDividends.length === 0 ? (
              <tr>
                <td colSpan={isViewer ? 8 : 9} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
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
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {div.account || 'Default'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 500, fontSize: '0.8rem' }}>
                      {div.shares}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 500, fontSize: '0.8rem' }}>
                      {div.payout_per_share}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                      {formatCurrency(div.gross_base, baseCurrency)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.8rem', color: 'var(--color-green)' }}>
                      {formatCurrency(div.net_base, baseCurrency)}
                    </td>
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
                    {!isViewer && (
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
          </tbody>
        </table>
      </div>
    </div>
  );
}
