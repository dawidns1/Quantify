import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, X, AlertCircle, Info } from 'lucide-react';
import type { Transaction } from '../../types/portfolio';
import { searchAssets } from '../../services/calculationService';
import { saveTransaction } from '../../services/transactionService';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingTransaction: Transaction | null;
  quickActionData: { symbol: string; type: 'BUY' | 'SELL' } | null;
  activePortfolioId: string | null;
  activePortfolioRole: string;
  apiBaseUrl: string;
  uniqueAccounts: string[];
  transactions: Transaction[];
  linkCash: boolean;
  setLinkCash: (val: boolean) => void;
  onSaveSuccess: () => void;
  tier: 'free' | 'premium';
  onLimitReached: (reason: 'portfolio' | 'account') => void;
}

export function AddTransactionModal({
  isOpen,
  onClose,
  editingTransaction,
  quickActionData,
  activePortfolioId,
  activePortfolioRole,
  apiBaseUrl,
  uniqueAccounts,
  transactions,
  linkCash,
  setLinkCash,
  onSaveSuccess,
  tier,
  onLimitReached
}: AddTransactionModalProps) {
  const [formSymbol, setFormSymbol] = useState('');
  const [formType, setFormType] = useState<'BUY' | 'SELL'>('BUY');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formShares, setFormShares] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formCurrency, setFormCurrency] = useState<'PLN' | 'USD' | 'EUR'>('USD');
  const [formFees, setFormFees] = useState('');
  const [formAccount, setFormAccount] = useState('Default');
  const [priceInputMode, setPriceInputMode] = useState<'per_share' | 'total' | 'adjust'>('per_share');

  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSuggestionSelected, setIsSuggestionSelected] = useState(false);
  const [showAccountSuggestions, setShowAccountSuggestions] = useState(false);
  const [isAccountInputDirty, setIsAccountInputDirty] = useState(false);
  
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Helper to calculate historical cash balance for a currency and account matching the backend zero floor rule
  const getCurrentCashBalance = (curr: string, acc: string) => {
    let balance = 0.0;
    
    // Sort transactions chronologically
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    
    for (const tx of sorted) {
      const tx_acc = tx.account || 'Default';
      if (tx_acc.toLowerCase() !== acc.toLowerCase()) continue;
      
      const tx_curr = tx.currency ? tx.currency.toUpperCase() : 'USD';
      const sym = tx.symbol.toUpperCase();
      
      if (sym === `CASH_${curr.toUpperCase()}`) {
        const amount = tx.shares * tx.price;
        if (tx.type === 'BUY') balance += amount;
        else if (tx.type === 'SELL') balance -= amount;
      } else if (!sym.startsWith('CASH_')) {
        if (linkCash && tx_curr === curr.toUpperCase()) {
          const amount = tx.shares * tx.price;
          if (tx.type === 'BUY') balance -= (amount + tx.fees);
          else if (tx.type === 'SELL') balance += (amount - tx.fees);
        }
      }
      
      // Apply zero floor rule
      if (balance < 0.0) {
        balance = 0.0;
      }
    }
    return balance;
  };

  // Filter accounts dynamically as user types
  const accountsToShow = useMemo(() => {
    const validAccounts = uniqueAccounts.filter(acc => acc && acc.trim() !== "");
    if (!isAccountInputDirty) {
      return validAccounts;
    }
    return validAccounts.filter(acc => 
      acc.toLowerCase().includes(formAccount.toLowerCase())
    );
  }, [uniqueAccounts, formAccount, isAccountInputDirty]);

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

  // Initialize and Reset Form fields
  useEffect(() => {
    if (editingTransaction) {
      setFormSymbol(editingTransaction.symbol);
      setFormType(editingTransaction.type);
      setFormDate(editingTransaction.date);
      setFormShares(editingTransaction.shares.toString());
      setFormPrice(editingTransaction.price.toString());
      setFormCurrency(editingTransaction.currency as 'PLN' | 'USD' | 'EUR');
      setFormFees(editingTransaction.fees ? editingTransaction.fees.toString() : '');
      setFormAccount(editingTransaction.account || 'Default');
      setIsSuggestionSelected(true);
      setPriceInputMode('per_share');
    } else if (quickActionData) {
      setFormSymbol(quickActionData.symbol);
      setFormType(quickActionData.type);
      setFormDate(new Date().toISOString().split('T')[0]);
      setFormShares('');
      setFormPrice('');
      
      const upperSymbol = quickActionData.symbol.toUpperCase().trim();
      if (upperSymbol.endsWith('.WA')) {
        setFormCurrency('PLN');
      } else if (upperSymbol.endsWith('.DE') || upperSymbol.endsWith('.F')) {
        setFormCurrency('EUR');
      } else {
        setFormCurrency('USD');
      }
      
      setFormFees('');
      setFormAccount('Default');
      setIsSuggestionSelected(true);
      setPriceInputMode('per_share');
    } else {
      setFormSymbol('');
      setFormType('BUY');
      setFormDate(new Date().toISOString().split('T')[0]);
      setFormShares('');
      setFormPrice('');
      setFormCurrency('USD');
      setFormFees('');
      setFormAccount('Default');
      setIsSuggestionSelected(false);
      setPriceInputMode('per_share');
    }
    setFormError(null);
  }, [editingTransaction, quickActionData, isOpen]);

  const handleTickerChange = (val: string) => {
    setFormSymbol(val);
    setIsSuggestionSelected(false);
    const upperVal = val.toUpperCase().trim();
    if (upperVal.endsWith('.WA')) {
      setFormCurrency('PLN');
    } else if (upperVal.endsWith('.DE')) {
      setFormCurrency('EUR');
    } else {
      setFormCurrency('USD');
    }
  };

  const handleSelectSuggestion = (s: any) => {
    setFormSymbol(s.symbol);
    setIsSuggestionSelected(true);
    setShowSuggestions(false);
    
    const sym = s.symbol.toUpperCase().trim();
    if (sym.endsWith('.WA') || s.exchange === 'WSE') {
      setFormCurrency('PLN');
    } else if (
      sym.endsWith('.DE') || 
      sym.endsWith('.F') || 
      sym.endsWith('.SG') || 
      ['FRA', 'GER', 'DUS', 'MUN', 'XETRA', 'STU'].includes(s.exchange)
    ) {
      setFormCurrency('EUR');
    } else {
      setFormCurrency('USD');
    }
  };

  const formatCurrency = (val: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const handleSubmitTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activePortfolioRole === 'viewer') return;
    setFormError(null);
    
    const symbol = formSymbol.toUpperCase().trim();
    let shares = parseFloat(formShares);
    let priceInput = parseFloat(formPrice);
    let fees = parseFloat(formFees) || 0;
    let type = formType;

    if (!symbol) {
      setFormError('Please enter a stock ticker symbol.');
      return;
    }

    if (symbol.startsWith('CASH_') && priceInputMode === 'adjust') {
      const targetVal = parseFloat(formPrice);
      if (isNaN(targetVal) || targetVal < 0) {
        setFormError('Target balance must be a valid non-negative number.');
        return;
      }
      const cashCurr = symbol.split('_')[1] || formCurrency;
      const currentBal = getCurrentCashBalance(cashCurr, formAccount);
      const diff = targetVal - currentBal;
      
      if (Math.abs(diff) < 0.001) {
        setFormError('Target balance matches current balance. No adjustment needed.');
        return;
      }
      
      shares = Math.abs(diff);
      priceInput = 1.0;
      fees = 0.0;
      type = diff > 0 ? 'BUY' : 'SELL';
    } else {
      if (isNaN(shares) || shares <= 0) {
        setFormError('Shares must be a positive number.');
        return;
      }
      if (isNaN(priceInput) || priceInput < 0) {
        setFormError('Price cannot be negative.');
        return;
      }
      if (isNaN(fees) || fees < 0) {
        setFormError('Fees cannot be negative.');
        return;
      }
    }

    if (!formDate) {
      setFormError('Please select a date.');
      return;
    }

    const accountName = (formAccount || 'Default').trim();
    if (tier === 'free' && (!editingTransaction || editingTransaction.account !== accountName)) {
      const isNewAccount = !uniqueAccounts.some(acc => acc.toLowerCase() === accountName.toLowerCase());
      if (isNewAccount && uniqueAccounts.length >= 2) {
        onLimitReached('account');
        return;
      }
    }

    const price = priceInputMode === 'total' ? (priceInput / shares) : priceInput;
    setSubmitting(true);

    const payload = {
      portfolio_id: activePortfolioId,
      symbol,
      type,
      date: formDate,
      shares,
      price,
      currency: formCurrency,
      fees,
      account: formAccount || 'Default'
    };

    try {
      await saveTransaction(payload, editingTransaction?.id);
      
      onSaveSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saving transaction:', err);
      setFormError(err.message || 'Error occurred while saving transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} style={{ cursor: 'pointer' }} />
      <div className="modal-overlay-container">
        <div className="modal-content" style={{ maxWidth: '500px', width: '90%' }}>
          <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              {editingTransaction ? (
                <>
                  <Edit2 size={20} className="gradient-text" /> Edit Transaction
                </>
              ) : (
                <>
                  <Plus size={20} className="gradient-text" /> Add New Transaction
                </>
              )}
            </h3>
            <button 
              onClick={onClose}
              className="modal-close-btn"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
            >
              <X size={20} />
            </button>
          </div>

          {formError && (
            <div className="form-error-banner" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.75rem', background: 'var(--color-red-glow)', border: '1px solid var(--color-red)', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
              <AlertCircle size={16} style={{ color: 'var(--color-red)', flexShrink: 0 }} />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmitTransaction} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            {/* Type selector */}
            <div className="form-group">
              <label className="form-label">Action Type</label>
              <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '3px' }}>
                <button
                  type="button"
                  className={`form-type-btn ${formType === 'BUY' ? 'active-buy' : ''}`}
                  onClick={() => setFormType('BUY')}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: formType === 'BUY' ? 'var(--color-green)' : 'transparent',
                    color: 'white',
                    padding: '0.5rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'var(--transition-smooth)'
                  }}
                >
                  BUY
                </button>
                <button
                  type="button"
                  className={`form-type-btn ${formType === 'SELL' ? 'active-sell' : ''}`}
                  onClick={() => setFormType('SELL')}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: formType === 'SELL' ? 'var(--color-red)' : 'transparent',
                    color: 'white',
                    padding: '0.5rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'var(--transition-smooth)'
                  }}
                >
                  SELL
                </button>
              </div>
            </div>

            {/* Ticker Input */}
            <div className="form-group" style={{ position: 'relative' }}>
              <label className="form-label" htmlFor="form-ticker">Stock Symbol / Ticker</label>
              <input 
                id="form-ticker"
                type="text" 
                placeholder="e.g. AAPL, CDR.WA, SXR8.DE" 
                className="input-field" 
                value={formSymbol}
                onChange={(e) => handleTickerChange(e.target.value)}
                autoComplete="off"
                required
              />
              
              {/* Quick Cash Buttons */}
              {(!formSymbol || formSymbol.toUpperCase().startsWith('CASH')) && (
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                  {['CASH_USD', 'CASH_PLN', 'CASH_EUR'].map((cashSym) => (
                    <button
                      key={cashSym}
                      type="button"
                      onClick={() => {
                        setFormSymbol(cashSym);
                        setIsSuggestionSelected(true);
                        setShowSuggestions(false);
                        const curr = cashSym.split('_')[1] as 'PLN' | 'USD' | 'EUR';
                        setFormCurrency(curr);
                        setFormPrice('1.0');
                      }}
                      style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid var(--panel-border)',
                        borderRadius: '4px',
                        padding: '0.2rem 0.5rem',
                        fontSize: '0.72rem',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'var(--transition-smooth)'
                      }}
                    >
                      + {cashSym.split('_')[1]} Cash
                    </button>
                  ))}
                </div>
              )}
              
              {/* Autocomplete Dropdown List */}
              {showSuggestions && (
                <div className="search-suggestions-dropdown">
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
              
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Info size={12} /> Suffixes: USA (no suffix), Poland GPW (<code>.WA</code>), Germany Xetra (<code>.DE</code>).
              </small>
            </div>

            {/* Grid: Date, Currency, and Account */}
            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="form-date">Date</label>
                <input 
                  id="form-date"
                  type="date" 
                  className="input-field"
                  style={{ width: '100%' }}
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                />
              </div>
              
              <div className="form-group">
                <label className="form-label" htmlFor="form-currency">Currency (Local)</label>
                <select 
                  id="form-currency"
                  className="input-field"
                  style={{ width: '100%', cursor: 'pointer' }}
                  value={formCurrency}
                  onChange={(e) => setFormCurrency(e.target.value as 'PLN' | 'USD' | 'EUR')}
                >
                  <option value="USD">USD ($)</option>
                  <option value="PLN">PLN (zł)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>

              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label" htmlFor="form-account">Brokerage Account</label>
                <input 
                  id="form-account"
                  type="text" 
                  placeholder="e.g. mBank, IBKR" 
                  className="input-field"
                  style={{ width: '100%' }}
                  value={formAccount}
                  onChange={(e) => {
                    setFormAccount(e.target.value);
                    setIsAccountInputDirty(true);
                  }}
                  onFocus={(e) => {
                    e.target.select();
                    setIsAccountInputDirty(false);
                    setShowAccountSuggestions(true);
                  }}
                  onBlur={() => setShowAccountSuggestions(false)}
                  autoComplete="off"
                  required
                />
                
                {showAccountSuggestions && accountsToShow.length > 0 && (
                  <div className="search-suggestions-dropdown" style={{ maxHeight: '150px', overflowY: 'auto' }}>
                    {accountsToShow.map((acc) => (
                      <div 
                        key={acc} 
                        className="suggestion-item"
                        style={{ padding: '0.45rem 0.75rem', fontSize: '0.82rem' }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setFormAccount(acc);
                          setShowAccountSuggestions(false);
                        }}
                      >
                        {acc}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Price Input Mode Selector */}
            <div className="form-group">
              <label className="form-label">Price Input Mode</label>
              <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '3px' }}>
                <button
                  type="button"
                  className={`form-type-btn ${priceInputMode === 'per_share' ? 'active-buy' : ''}`}
                  onClick={() => setPriceInputMode('per_share')}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: priceInputMode === 'per_share' ? 'var(--color-primary)' : 'transparent',
                    color: 'white',
                    padding: '0.4rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'var(--transition-smooth)'
                  }}
                >
                  Per Share
                </button>
                <button
                  type="button"
                  className={`form-type-btn ${priceInputMode === 'total' ? 'active-buy' : ''}`}
                  onClick={() => setPriceInputMode('total')}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: priceInputMode === 'total' ? 'var(--color-primary)' : 'transparent',
                    color: 'white',
                    padding: '0.4rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'var(--transition-smooth)'
                  }}
                >
                  Total Value
                </button>
                {formSymbol.toUpperCase().startsWith('CASH_') && (
                  <button
                    type="button"
                    className={`form-type-btn ${priceInputMode === 'adjust' ? 'active-buy' : ''}`}
                    onClick={() => setPriceInputMode('adjust')}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: priceInputMode === 'adjust' ? 'var(--color-primary)' : 'transparent',
                      color: 'white',
                      padding: '0.4rem',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'var(--transition-smooth)'
                    }}
                  >
                    Adjust Balance
                  </button>
                )}
              </div>
            </div>

            {/* Grid: Shares, Price & Fees OR Target Cash Balance */}
            {formSymbol.toUpperCase().startsWith('CASH_') && priceInputMode === 'adjust' ? (
              <div className="form-group">
                <label className="form-label" htmlFor="form-target-bal">Target Cash Balance ({formCurrency})</label>
                <div style={{ position: 'relative' }}>
                  <input 
                    id="form-target-bal"
                    type="number" 
                    step="0.01" 
                    placeholder="0.00" 
                    className="input-field"
                    style={{ width: '100%' }}
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    required
                  />
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: '1.4' }}>
                    Current Balance in <strong>{formAccount}</strong>: {formatCurrency(getCurrentCashBalance(formSymbol.split('_')[1] || formCurrency, formAccount), formCurrency)}.
                    <br />
                    Saving will automatically create a transaction for the difference.
                  </div>
                </div>
              </div>
            ) : (
              <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="form-shares">Shares</label>
                  <input 
                    id="form-shares"
                    type="number" 
                    step="any"
                    placeholder="0.00" 
                    className="input-field"
                    style={{ width: '100%' }}
                    value={formShares}
                    onChange={(e) => setFormShares(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="form-price">
                    {priceInputMode === 'per_share' ? 'Price (per share)' : 'Total Price (excl. fees)'}
                  </label>
                  <input 
                    id="form-price"
                    type="number" 
                    step="0.01" 
                    placeholder="0.00" 
                    className="input-field"
                    style={{ width: '100%' }}
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="form-fees">Transaction Fees</label>
                  <input 
                    id="form-fees"
                    type="number" 
                    step="0.01" 
                    placeholder="0.00" 
                    className="input-field"
                    style={{ width: '100%' }}
                    value={formFees}
                    onChange={(e) => setFormFees(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Cost Basis / Share calculation preview */}
            {formShares && formPrice && !isNaN(parseFloat(formShares)) && !isNaN(parseFloat(formPrice)) && parseFloat(formShares) > 0 && (
              <div style={{ 
                fontSize: '0.8rem', 
                color: 'var(--color-primary)', 
                background: 'rgba(59, 130, 246, 0.05)', 
                border: '1px dashed rgba(59, 130, 246, 0.2)',
                borderRadius: '6px', 
                padding: '0.5rem 0.75rem',
                marginTop: '0.1rem'
              }}>
                {(() => {
                  const shares = parseFloat(formShares);
                  const price = parseFloat(formPrice);
                  const fees = parseFloat(formFees) || 0;
                  
                  if (priceInputMode === 'per_share') {
                    const grossTotal = shares * price;
                    const netTotal = formType === 'BUY' ? grossTotal + fees : grossTotal - fees;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <div>
                          Gross Total: <strong>{formatCurrency(grossTotal, formCurrency)}</strong>
                        </div>
                        {fees > 0 && (
                          <div style={{ fontWeight: 600, color: formType === 'BUY' ? 'var(--color-primary)' : 'var(--color-green)' }}>
                            {formType === 'BUY' ? 'Total Cash Outlay (incl. fees):' : 'Net Cash Proceeds (after fees):'}{' '}
                            <strong>{formatCurrency(netTotal, formCurrency)}</strong>
                          </div>
                        )}
                      </div>
                    );
                  } else {
                    const calculatedPricePerShare = price / shares;
                    const adjustedPrice = formType === 'BUY' 
                      ? (price + fees) / shares 
                      : (price - fees) / shares;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <div>
                          Calculated Price Per Share: <strong>{formatCurrency(calculatedPricePerShare, formCurrency)}</strong>
                        </div>
                        {fees > 0 && (
                          <div style={{ fontWeight: 600, color: formType === 'BUY' ? 'var(--color-primary)' : 'var(--color-green)' }}>
                            {formType === 'BUY' ? 'Effective Buy Cost Per Share (incl. fees):' : 'Effective Sell Proceeds Per Share (after fees):'}{' '}
                            <strong>{formatCurrency(adjustedPrice, formCurrency)}</strong>
                          </div>
                        )}
                      </div>
                    );
                  }
                })()}
              </div>
            )}

            {/* Link Cash Balance checkbox inside the transaction form (only for non-cash transactions) */}
            {!formSymbol.toUpperCase().startsWith('CASH_') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: '0.75rem', padding: '0 0.25rem' }}>
                <input 
                  id="form-link-cash"
                  type="checkbox" 
                  checked={linkCash}
                  onChange={(e) => setLinkCash(e.target.checked)}
                  style={{ cursor: 'pointer', width: '14px', height: '14px' }}
                />
                <label htmlFor="form-link-cash" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none', fontWeight: 500 }}>
                  Link cash balance (auto-adjust cash position for stock transactions)
                </label>
              </div>
            )}

            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onClose}
                className="input-field"
                style={{ cursor: 'pointer', background: 'transparent' }}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="glow-btn"
                disabled={submitting}
              >
                {submitting 
                  ? (editingTransaction ? 'Updating...' : 'Adding...') 
                  : (editingTransaction ? 'Update Transaction' : 'Save Transaction')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
