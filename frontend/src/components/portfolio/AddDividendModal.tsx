import { useState, useEffect } from 'react';
import { X, Check, Save, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { updatePortfolioSettings } from '../../services/supabaseService';
import { searchAssets } from '../../services/calculationService';

interface AddDividendModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingDividend: any | null; // Can be a manual dividend or automatic dividend to override
  activePortfolioId: string | null;
  uniqueAccounts: string[];
  portfolioSettings: any;
  onSaveSuccess: (updatedSettings: any) => void;
  holdingSymbols?: string[];
  apiBaseUrl?: string;
  linkCash: boolean;
  setLinkCash: (val: boolean) => void;
}

export function AddDividendModal({
  isOpen,
  onClose,
  editingDividend,
  activePortfolioId,
  uniqueAccounts,
  portfolioSettings,
  onSaveSuccess,
  holdingSymbols = [],
  apiBaseUrl = 'http://localhost:8000',
  linkCash,
  setLinkCash
}: AddDividendModalProps) {
  const { t } = useTranslation();
  const [formSymbol, setFormSymbol] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formAccount, setFormAccount] = useState('Default');
  const [formShares, setFormShares] = useState('');
  const [formPayout, setFormPayout] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSuggestionSelected, setIsSuggestionSelected] = useState(false);

  // Debounced search for suggestions
  useEffect(() => {
    if (isSuggestionSelected) {
      return;
    }

    if (formSymbol.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const delayDebounce = setTimeout(() => {
      searchAssets(apiBaseUrl, formSymbol)
        .then((data) => {
          if (formSymbol.trim().length < 2) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
          }
          setSuggestions(data || []);
          setShowSuggestions(data && data.length > 0);
        })
        .catch((err) => {
          console.error('Error fetching suggestions:', err);
        });
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [formSymbol, apiBaseUrl, isSuggestionSelected]);

  const handleSelectSuggestion = (s: any) => {
    setFormSymbol(s.symbol.toUpperCase());
    setIsSuggestionSelected(true);
    setShowSuggestions(false);
  };

  useEffect(() => {
    if (isOpen) {
      if (editingDividend) {
        setFormSymbol(editingDividend.symbol || '');
        setFormDate(editingDividend.date || '');
        setFormAccount(editingDividend.account || 'Default');
        setFormShares(String(editingDividend.shares || ''));
        setFormPayout(String(editingDividend.payout_per_share || ''));
      } else {
        setFormSymbol('');
        setFormDate(new Date().toISOString().split('T')[0]);
        setFormAccount(uniqueAccounts[0] || 'Default');
        setFormShares('');
        setFormPayout('');
      }
      setFormError(null);
    }
  }, [isOpen, editingDividend, uniqueAccounts]);

  if (!isOpen || !activePortfolioId) return null;

  const isOverrideMode = editingDividend && !editingDividend.is_manual;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const symbol = formSymbol.trim().toUpperCase();
    const dateStr = formDate.trim();
    const account = formAccount.trim();
    const sharesNum = parseFloat(formShares);
    const payoutNum = parseFloat(formPayout);

    if (!symbol) {
      setFormError(t('modals.add_div.err_symbol'));
      return;
    }
    if (!dateStr) {
      setFormError(t('modals.add_div.err_date'));
      return;
    }
    const todayStr = new Date().toISOString().split('T')[0];
    if (dateStr > todayStr) {
      setFormError(t('modals.add_div.err_future_date', 'Dividend date cannot be in the future.'));
      return;
    }
    if (!account) {
      setFormError(t('modals.add_div.err_account'));
      return;
    }
    if (isNaN(sharesNum) || sharesNum <= 0) {
      setFormError(t('modals.add_div.err_shares'));
      return;
    }
    if (isNaN(payoutNum) || payoutNum <= 0) {
      setFormError(t('modals.add_div.err_payout'));
      return;
    }

    setSubmitting(true);
    try {
      const existingDividends = [...(portfolioSettings?.dividends || [])];

      if (editingDividend) {
        if (editingDividend.is_manual) {
          // Update manual dividend by ID
          const idx = existingDividends.findIndex(d => d.id === editingDividend.id);
          if (idx !== -1) {
            existingDividends[idx] = {
              ...existingDividends[idx],
              symbol,
              date: dateStr,
              account,
              shares: sharesNum,
              payout_per_share: payoutNum
            };
          }
        } else {
          // Update or add override for automatic dividend matching (symbol, date, account)
          const idx = existingDividends.findIndex(d => 
            !d.is_manual &&
            d.symbol?.toUpperCase() === symbol &&
            d.date === dateStr &&
            (d.account || 'Default') === account
          );

          if (idx !== -1) {
            existingDividends[idx] = {
              ...existingDividends[idx],
              shares: sharesNum,
              payout_per_share: payoutNum,
              is_deleted: false
            };
          } else {
            existingDividends.push({
              id: 'div_ovr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
              symbol,
              date: dateStr,
              account,
              shares: sharesNum,
              payout_per_share: payoutNum,
              is_manual: false,
              is_deleted: false
            });
          }
        }
      } else {
        // Create brand new manual dividend entry
        existingDividends.push({
          id: 'div_man_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          symbol,
          date: dateStr,
          account,
          shares: sharesNum,
          payout_per_share: payoutNum,
          is_manual: true,
          is_deleted: false
        });
      }

      const updatedSettings = {
        ...portfolioSettings,
        dividends: existingDividends
      };

      await updatePortfolioSettings(activePortfolioId, updatedSettings);
      onSaveSuccess(updatedSettings);
      onClose();
    } catch (err: any) {
      console.error('Error saving dividend:', err);
      setFormError(err.message || 'Failed to save dividend to portfolio settings.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} style={{ cursor: 'pointer' }} />
      <div className="modal-overlay-container">
        <div className="modal-content" style={{ maxWidth: '480px', width: '95%' }}>
          <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0, fontSize: '1.25rem' }}>
              <Check size={20} className="gradient-text" />
              <span style={{ fontWeight: 700 }}>
                {editingDividend 
                  ? (isOverrideMode ? t('modals.add_div.title_override') : t('modals.add_div.title_edit'))
                  : t('modals.add_div.title_record')
                }
              </span>
            </h3>
            <button 
              onClick={onClose}
              className="modal-close-btn"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            {formError && (
              <div className="form-error-banner" style={{ padding: '0.65rem 0.85rem', fontSize: '0.8rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                <span>{formError}</span>
              </div>
            )}

            {holdingSymbols.length > 0 && !editingDividend && (
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {t('modals.add_div.quick_select', 'Quick Select Holding Asset:')}
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.2rem' }}>
                  {holdingSymbols.map(sym => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => {
                        setFormSymbol(sym);
                        setIsSuggestionSelected(true);
                        setShowSuggestions(false);
                      }}
                      style={{
                        background: formSymbol.toUpperCase() === sym.toUpperCase() ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                        border: formSymbol.toUpperCase() === sym.toUpperCase() ? '1px solid var(--color-primary)' : '1px solid var(--panel-border)',
                        borderRadius: '4px',
                        padding: '0.25rem 0.55rem',
                        fontSize: '0.72rem',
                        color: formSymbol.toUpperCase() === sym.toUpperCase() ? 'white' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontWeight: formSymbol.toUpperCase() === sym.toUpperCase() ? 600 : 400,
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {/* Ticker Symbol */}
              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label">{t('modals.add_div.label_symbol')}</label>
                <input
                  type="text"
                  className="input-field"
                  disabled={!!editingDividend}
                  placeholder="e.g. AAPL"
                  value={formSymbol}
                  onChange={(e) => {
                    setFormSymbol(e.target.value);
                    setIsSuggestionSelected(false);
                  }}
                  style={{ width: '100%', textTransform: 'uppercase', cursor: editingDividend ? 'not-allowed' : 'text' }}
                />

                {/* Autocomplete Dropdown List */}
                {showSuggestions && (
                  <div className="search-suggestions-dropdown" style={{ top: '100%', left: 0, right: 0 }}>
                    {suggestions.map((s) => (
                      <div 
                        key={s.symbol} 
                        className="suggestion-item" 
                        onClick={() => handleSelectSuggestion(s)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span className="suggestion-symbol">{s.symbol}</span>
                          <span className="suggestion-badge">{s.exchange}</span>
                        </div>
                        <span className="suggestion-name" title={s.name}>{s.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Date */}
              <div className="form-group">
                <label className="form-label">{t('modals.add_div.label_date')}</label>
                <input
                  type="date"
                  max={new Date().toISOString().split('T')[0]}
                  className="input-field"
                  disabled={isOverrideMode}
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  style={{ width: '100%', cursor: isOverrideMode ? 'not-allowed' : 'text' }}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">{t('modals.add_div.label_account')}</label>
              {isOverrideMode ? (
                <input
                  type="text"
                  className="input-field"
                  disabled
                  value={formAccount}
                  style={{ width: '100%', cursor: 'not-allowed' }}
                />
              ) : (
                <select
                  className="input-field"
                  value={formAccount}
                  onChange={(e) => setFormAccount(e.target.value)}
                  style={{ width: '100%', cursor: 'pointer' }}
                >
                  {uniqueAccounts.map(acc => (
                    <option key={acc} value={acc}>{acc}</option>
                  ))}
                  {!uniqueAccounts.includes('Default') && (
                    <option value="Default">Default</option>
                  )}
                </select>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {/* Shares owned */}
              <div className="form-group">
                <label className="form-label">{t('modals.add_div.label_shares')}</label>
                <input
                  type="number"
                  step="any"
                  className="input-field"
                  placeholder="0.00"
                  value={formShares}
                  onChange={(e) => setFormShares(e.target.value)}
                  required
                  style={{ width: '100%' }}
                />
              </div>

              {/* Payout per share */}
              <div className="form-group">
                <label className="form-label">{t('modals.add_div.label_payout')}</label>
                <input
                  type="number"
                  step="any"
                  className="input-field"
                  placeholder="0.00"
                  value={formPayout}
                  onChange={(e) => setFormPayout(e.target.value)}
                  required
                  style={{ width: '100%' }}
                />
              </div>
            </div>

             {/* Link Cash Balance checkbox inside the dividend modal */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: '0.5rem', marginBottom: '0.5rem', padding: '0 0.25rem' }}>
              <input 
                id="form-link-cash-div"
                type="checkbox" 
                checked={linkCash}
                onChange={(e) => setLinkCash(e.target.checked)}
                style={{ cursor: 'pointer', width: '14px', height: '14px' }}
              />
              <label htmlFor="form-link-cash-div" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none', fontWeight: 500 }}>
                {t('modals.add_div.link_cash_desc', 'Link cash balance (auto-adjust cash position for dividend payouts)')}
              </label>
            </div>

            {isOverrideMode && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)' }}>
                {t('modals.add_div.note_override')}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="glow-btn"
                onClick={onClose}
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  color: 'var(--text-secondary)',
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  boxShadow: 'none'
                }}
              >
                {t('modals.common_cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="glow-btn"
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <Save size={14} />
                {submitting ? t('modals.add_div.btn_saving') : t('modals.add_div.btn_save')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
