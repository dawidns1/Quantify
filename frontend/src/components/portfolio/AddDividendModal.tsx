import { useState, useEffect } from 'react';
import { X, Check, Save, AlertCircle } from 'lucide-react';
import { updatePortfolioSettings } from '../../services/supabaseService';

interface AddDividendModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingDividend: any | null; // Can be a manual dividend or automatic dividend to override
  activePortfolioId: string | null;
  uniqueAccounts: string[];
  portfolioSettings: any;
  onSaveSuccess: (updatedSettings: any) => void;
}

export function AddDividendModal({
  isOpen,
  onClose,
  editingDividend,
  activePortfolioId,
  uniqueAccounts,
  portfolioSettings,
  onSaveSuccess
}: AddDividendModalProps) {
  const [formSymbol, setFormSymbol] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formAccount, setFormAccount] = useState('Default');
  const [formShares, setFormShares] = useState('');
  const [formPayout, setFormPayout] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      setFormError('Ticker symbol is required.');
      return;
    }
    if (!dateStr) {
      setFormError('Payment date is required.');
      return;
    }
    if (!account) {
      setFormError('Account is required.');
      return;
    }
    if (isNaN(sharesNum) || sharesNum <= 0) {
      setFormError('Shares must be a positive number.');
      return;
    }
    if (isNaN(payoutNum) || payoutNum <= 0) {
      setFormError('Payout per share must be a positive number.');
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
                  ? (isOverrideMode ? 'Override Automatic Dividend' : 'Edit Manual Dividend')
                  : 'Record Manual Dividend'
                }
              </span>
            </h3>
            <button 
              onClick={onClose}
              className="modal-close-btn"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.25rem' }}
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {/* Ticker Symbol */}
              <div className="form-group">
                <label className="form-label">Ticker / Symbol</label>
                <input
                  type="text"
                  className="form-input"
                  disabled={!!editingDividend}
                  placeholder="e.g. AAPL"
                  value={formSymbol}
                  onChange={(e) => setFormSymbol(e.target.value)}
                  style={{ textTransform: 'uppercase', cursor: editingDividend ? 'not-allowed' : 'text' }}
                />
              </div>

              {/* Date */}
              <div className="form-group">
                <label className="form-label">Payment Date</label>
                <input
                  type="date"
                  className="form-input"
                  disabled={isOverrideMode}
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  style={{ cursor: isOverrideMode ? 'not-allowed' : 'text' }}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Brokerage Account</label>
              {isOverrideMode ? (
                <input
                  type="text"
                  className="form-input"
                  disabled
                  value={formAccount}
                  style={{ cursor: 'not-allowed' }}
                />
              ) : (
                <select
                  className="form-input"
                  value={formAccount}
                  onChange={(e) => setFormAccount(e.target.value)}
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
                <label className="form-label">Shares Owned</label>
                <input
                  type="number"
                  step="any"
                  className="form-input"
                  placeholder="0.00"
                  value={formShares}
                  onChange={(e) => setFormShares(e.target.value)}
                  required
                />
              </div>

              {/* Payout per share */}
              <div className="form-group">
                <label className="form-label">Gross Payout / Share</label>
                <input
                  type="number"
                  step="any"
                  className="form-input"
                  placeholder="0.00"
                  value={formPayout}
                  onChange={(e) => setFormPayout(e.target.value)}
                  required
                />
              </div>
            </div>

            {isOverrideMode && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)' }}>
                <strong>Note:</strong> You are overriding an automatic dividend entry calculated from Yahoo Finance. Symbol, ex-date, and account fields cannot be changed.
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
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="glow-btn"
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <Save size={14} />
                {submitting ? 'Saving...' : 'Save Dividend'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
