import React, { useState, useRef } from 'react';
import { X, Upload, Check, AlertCircle, FileText, Loader2, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { saveTransactionsBulk } from '../../services/transactionService';

interface ParsedTx {
  symbol: string;
  type: 'BUY' | 'SELL';
  date: string;
  shares: number;
  price: number;
  fees: number;
  currency: string;
  account: string;
}

interface ImportCSVModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: string;
  apiBaseUrl: string;
  accounts: string[];
  onImportComplete: () => void;
}

export function ImportCSVModal({
  isOpen,
  onClose,
  portfolioId,
  apiBaseUrl,
  accounts,
  onImportComplete
}: ImportCSVModalProps) {
  const { t } = useTranslation();
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1); // 1: Upload, 2: Preview
  const [detectedBroker, setDetectedBroker] = useState<string>('generic');
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTx[]>([]);
  const [selectedTxs, setSelectedTxs] = useState<boolean[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>(accounts[0] || 'Default');
  const [newAccountName, setNewAccountName] = useState('');
  const [showNewAccountInput, setShowNewAccountInput] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.csv')) {
        setFile(droppedFile);
        setError(null);
      } else {
        setError(t('import.err_invalid_type', 'Please upload a CSV file only.'));
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.name.endsWith('.csv')) {
        setFile(selectedFile);
        setError(null);
      } else {
        setError(t('import.err_invalid_type', 'Please upload a CSV file only.'));
      }
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleParseCSV = async () => {
    if (!file) return;
    setParsing(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${apiBaseUrl}/api/portfolio/${portfolioId}/import-csv`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Failed to parse CSV file.');
      }

      const data = await response.json();
      if (data.transactions && data.transactions.length > 0) {
        setParsedTransactions(data.transactions);
        setDetectedBroker(data.broker);
        setSelectedTxs(new Array(data.transactions.length).fill(true));
        setStep(2);
      } else {
        setError(t('import.err_no_txs', 'No valid transactions found in the CSV file. Please check column headers.'));
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while uploading.');
    } finally {
      setParsing(false);
    }
  };

  const handleToggleSelectAll = (checked: boolean) => {
    setSelectedTxs(new Array(parsedTransactions.length).fill(checked));
  };

  const handleToggleRow = (index: number) => {
    setSelectedTxs(prev => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  const handleEditCell = (index: number, field: keyof ParsedTx, value: any) => {
    setParsedTransactions(prev => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [field]: value
      };
      return next;
    });
  };

  const handleImportSubmit = async () => {
    const finalAccount = showNewAccountInput ? newAccountName.trim() : selectedAccount;
    if (!finalAccount) {
      setError(t('import.err_no_account', 'Please specify a brokerage account.'));
      return;
    }

    const payload = parsedTransactions
      .filter((_, idx) => selectedTxs[idx])
      .map(tx => ({
        portfolio_id: portfolioId,
        symbol: tx.symbol,
        type: tx.type,
        date: tx.date,
        shares: tx.shares,
        price: tx.price,
        currency: tx.currency,
        fees: tx.fees,
        account: finalAccount
      }));

    if (payload.length === 0) {
      setError(t('import.err_no_selected', 'Please select at least one transaction to import.'));
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const validPayload = payload.filter(tx => 
      tx.symbol &&
      tx.shares > 0 &&
      tx.price >= 0 &&
      tx.fees >= 0 &&
      (!tx.date || tx.date <= todayStr)
    );

    if (validPayload.length === 0) {
      setError(t('import.err_invalid_rows', 'No valid transactions to import (all selected rows had invalid numbers or future dates).'));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await saveTransactionsBulk(validPayload);
      onImportComplete();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to import transactions to database.');
    } finally {
      setSaving(false);
    }
  };

  const countSelected = selectedTxs.filter(Boolean).length;

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: step === 1 ? '480px' : '720px', padding: '1.75rem', position: 'relative', display: 'flex', flexDirection: 'column', gap: '1.25rem', maxHeight: '90vh', overflow: 'hidden' }}>
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          title={t('common.close', 'Close')}
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div>
          <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Upload size={20} style={{ color: 'var(--color-primary)' }} />
            {t('import.header', 'Import Transactions CSV')}
          </h3>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {step === 1 
              ? t('import.desc_upload', 'Upload a CSV export statement from your brokerage.') 
              : t('import.desc_preview', 'Review parsed transactions before importing to database.')}
          </p>
        </div>

        {error && (
          <div className="form-error-banner" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.65rem 0.85rem', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid var(--color-red)', color: 'var(--color-red)', borderRadius: '8px', fontSize: '0.78rem' }}>
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Upload Dropzone */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={handleUploadClick}
              style={{
                border: `1.5px dashed ${dragActive ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.15)'}`,
                borderRadius: '12px',
                padding: '2.5rem 1.5rem',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragActive ? 'rgba(6, 182, 212, 0.04)' : 'rgba(255, 255, 255, 0.01)',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.75rem'
              }}
            >
              <input 
                ref={fileInputRef}
                type="file" 
                accept=".csv" 
                onChange={handleFileChange} 
                style={{ display: 'none' }}
              />
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                {file ? <FileText size={20} style={{ color: 'var(--color-primary)' }} /> : <Upload size={20} style={{ color: 'var(--text-secondary)' }} />}
              </div>
              <div>
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {file ? file.name : t('import.drop_prompt', 'Drag & drop your CSV file here')}
                </span>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {file 
                    ? `${(file.size / 1024).toFixed(1)} KB` 
                    : t('import.click_prompt', 'or click to browse files')}
                </p>
              </div>
            </div>

            {/* List of Supported Brokers */}
            <div style={{ background: 'rgba(255,255,255,0.01)', borderRadius: '8px', padding: '0.85rem', border: '1px solid rgba(255,255,255,0.03)' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                {t('import.supported_title', 'Auto-Detected Formats')}
              </span>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                {['XTB', 'Revolut', 'IBKR', 'Trading212', 'Degiro', 'mBank eMakler', 'Generic CSV'].map(b => (
                  <div key={b} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                    <Check size={12} style={{ color: 'var(--color-green)' }} />
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Help / Guide */}
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.45 }}>
              {t('import.generic_tip', 'Using another broker? Make sure headers contain standard columns: ')}
              <code style={{ color: 'var(--color-primary)', fontFamily: 'monospace' }}>Date</code>, <code style={{ color: 'var(--color-primary)', fontFamily: 'monospace' }}>Ticker</code>, <code style={{ color: 'var(--color-primary)', fontFamily: 'monospace' }}>Type</code> (Buy/Sell), <code style={{ color: 'var(--color-primary)', fontFamily: 'monospace' }}>Shares</code>, <code style={{ color: 'var(--color-primary)', fontFamily: 'monospace' }}>Price</code>.
            </p>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button 
                type="button" 
                onClick={onClose}
                className="cancel-btn"
                style={{ padding: '0.55rem 1.25rem', fontSize: '0.82rem', borderRadius: '6px' }}
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button 
                type="button"
                onClick={handleParseCSV}
                disabled={!file || parsing}
                className="glow-btn"
                style={{ padding: '0.55rem 1.5rem', fontSize: '0.82rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                {parsing ? <Loader2 size={14} className="animate-spin" /> : null}
                {t('import.btn_continue', 'Analyze File')}
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Preview & Select */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', overflow: 'hidden' }}>
            
            {/* Parser logs summary */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(6, 182, 212, 0.05)', border: '1px solid rgba(6, 182, 212, 0.12)', borderRadius: '8px', fontSize: '0.8rem' }}>
              <div>
                {t('import.log_broker', 'Detected Statement Format:')} <strong style={{ textTransform: 'uppercase', color: 'var(--color-primary)' }}>{detectedBroker}</strong>
              </div>
              <div>
                {t('import.log_found', 'Found:')} <strong>{parsedTransactions.length} {t('import.log_txs', 'transactions')}</strong>
              </div>
            </div>

            {/* Account Mapping Selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {t('import.map_account', 'Select Brokerage Account to import into:')}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {!showNewAccountInput ? (
                  <>
                    <select
                      value={selectedAccount}
                      onChange={(e) => {
                        if (e.target.value === '__new__') {
                          setShowNewAccountInput(true);
                        } else {
                          setSelectedAccount(e.target.value);
                        }
                      }}
                      style={{
                        flex: 1,
                        background: 'rgba(15,23,42,0.6)',
                        border: '1px solid var(--panel-border)',
                        color: 'white',
                        padding: '0.45rem 0.75rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        outline: 'none'
                      }}
                    >
                      {accounts.map(acc => (
                        <option key={acc} value={acc}>{acc}</option>
                      ))}
                      <option value="__new__">+ {t('import.new_account_option', 'Create New Account...')}</option>
                    </select>
                  </>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder={t('import.placeholder_account', 'Enter account name (e.g. XTB Broker)')}
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                      style={{
                        flex: 1,
                        background: 'rgba(15,23,42,0.6)',
                        border: '1px solid var(--panel-border)',
                        color: 'white',
                        padding: '0.45rem 0.75rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        outline: 'none'
                      }}
                    />
                    <button
                      type="button"
                      className="cancel-btn"
                      onClick={() => {
                        setShowNewAccountInput(false);
                        setNewAccountName('');
                      }}
                      style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem', borderRadius: '6px' }}
                    >
                      {t('common.cancel', 'Cancel')}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Preview Grid Table */}
            <div className="table-wrapper custom-scrollbar" style={{ flex: 1, overflowY: 'auto', maxHeight: '350px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <table className="screener-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <th style={{ padding: '0.65rem 0.85rem', width: '40px', textAlign: 'center' }}>
                      <input 
                        type="checkbox"
                        checked={countSelected === parsedTransactions.length}
                        onChange={(e) => handleToggleSelectAll(e.target.checked)}
                        style={{ cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                      />
                    </th>
                    <th style={{ padding: '0.65rem 0.85rem' }}>{t('holdings.col_ticker', 'Ticker')}</th>
                    <th style={{ padding: '0.65rem 0.85rem' }}>{t('ledger.col_type', 'Type')}</th>
                    <th style={{ padding: '0.65rem 0.85rem' }}>{t('ledger.col_date', 'Date')}</th>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>{t('ledger.col_shares', 'Shares')}</th>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>{t('ledger.col_price', 'Price')}</th>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>{t('ledger.col_fees', 'Commission')}</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedTransactions.map((tx, idx) => (
                    <tr 
                      key={idx} 
                      style={{ 
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                        background: selectedTxs[idx] ? 'rgba(255,255,255,0.01)' : 'transparent',
                        opacity: selectedTxs[idx] ? 1 : 0.45,
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <td style={{ padding: '0.45rem 0.65rem', textAlign: 'center' }}>
                        <input 
                          type="checkbox"
                          checked={selectedTxs[idx]}
                          onChange={() => handleToggleRow(idx)}
                          style={{ cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                        />
                      </td>
                      <td style={{ padding: '0.45rem 0.65rem' }}>
                        <input 
                          type="text"
                          value={tx.symbol}
                          onChange={(e) => handleEditCell(idx, 'symbol', e.target.value.toUpperCase().trim())}
                          style={{
                            background: 'transparent',
                            border: '1px solid transparent',
                            color: 'white',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                            width: '80px',
                            outline: 'none',
                            padding: '2px 4px',
                            borderRadius: '3px'
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'}
                          onBlur={(e) => e.currentTarget.style.borderColor = 'transparent'}
                        />
                      </td>
                      <td style={{ padding: '0.45rem 0.65rem' }}>
                        <span className={`badge ${tx.type === 'BUY' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem' }}>
                          {tx.type === 'BUY' ? t('rebalance.buy', 'BUY') : t('rebalance.sell', 'SELL')}
                        </span>
                      </td>
                      <td style={{ padding: '0.45rem 0.65rem', color: 'var(--text-secondary)' }}>{tx.date}</td>
                      <td style={{ padding: '0.45rem 0.65rem', textAlign: 'right' }}>
                        <input 
                          type="number"
                          step="any"
                          value={tx.shares}
                          onChange={(e) => handleEditCell(idx, 'shares', parseFloat(e.target.value) || 0)}
                          style={{
                            background: 'transparent',
                            border: '1px solid transparent',
                            color: 'white',
                            fontWeight: 600,
                            fontSize: '0.78rem',
                            width: '70px',
                            textAlign: 'right',
                            outline: 'none',
                            padding: '2px 4px',
                            borderRadius: '3px'
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'}
                          onBlur={(e) => e.currentTarget.style.borderColor = 'transparent'}
                        />
                      </td>
                      <td style={{ padding: '0.45rem 0.65rem', textAlign: 'right' }}>
                        <input 
                          type="number"
                          step="any"
                          value={tx.price}
                          onChange={(e) => handleEditCell(idx, 'price', parseFloat(e.target.value) || 0)}
                          style={{
                            background: 'transparent',
                            border: '1px solid transparent',
                            color: 'white',
                            fontSize: '0.78rem',
                            width: '60px',
                            textAlign: 'right',
                            outline: 'none',
                            padding: '2px 4px',
                            borderRadius: '3px'
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'}
                          onBlur={(e) => e.currentTarget.style.borderColor = 'transparent'}
                        />
                        <span style={{ fontSize: '0.68rem', opacity: 0.6, marginLeft: '4px' }}>{tx.currency}</span>
                      </td>
                      <td style={{ padding: '0.45rem 0.65rem', textAlign: 'right' }}>
                        <input 
                          type="number"
                          step="any"
                          value={tx.fees}
                          onChange={(e) => handleEditCell(idx, 'fees', parseFloat(e.target.value) || 0)}
                          style={{
                            background: 'transparent',
                            border: '1px solid transparent',
                            color: 'var(--text-muted)',
                            fontSize: '0.78rem',
                            width: '60px',
                            textAlign: 'right',
                            outline: 'none',
                            padding: '2px 4px',
                            borderRadius: '3px'
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'}
                          onBlur={(e) => e.currentTarget.style.borderColor = 'transparent'}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {t('import.selected_count', 'Selected:')} <strong style={{ color: 'white' }}>{countSelected}</strong> / {parsedTransactions.length}
              </span>
              
              <div style={{ display: 'flex', gap: '0.75rem', marginLeft: 'auto' }}>
                <button 
                  type="button" 
                  onClick={() => setStep(1)}
                  className="cancel-btn"
                  style={{ padding: '0.55rem 1.25rem', fontSize: '0.82rem', borderRadius: '6px' }}
                >
                  {t('import.btn_back', 'Back')}
                </button>
                <button 
                  type="button"
                  onClick={handleImportSubmit}
                  disabled={saving || countSelected === 0}
                  className="glow-btn"
                  style={{ padding: '0.55rem 1.75rem', fontSize: '0.82rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                  {t('import.btn_confirm', 'Confirm Import')}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
