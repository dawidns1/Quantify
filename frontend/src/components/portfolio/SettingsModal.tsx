import { useState, useEffect } from 'react';
import { X, Settings, Check, HelpCircle, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Portfolio } from '../../types/portfolio';
import { updatePortfolioSettings } from '../../services/supabaseService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolio: Portfolio | null;
  portfolioAccounts: string[];
  onSaveSuccess: (updatedSettings: any) => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  portfolio,
  portfolioAccounts,
  onSaveSuccess
}: SettingsModalProps) {
  const { t } = useTranslation();
  const [accountTaxRates, setAccountTaxRates] = useState<Record<string, number>>({});
  const [riskFreeRate, setRiskFreeRate] = useState<number>(2.0);
  const [betaBenchmark, setBetaBenchmark] = useState<string>('SPY');
  const [costBasisMethod, setCostBasisMethod] = useState<'average_cost' | 'fifo'>('average_cost');
  const [addDividendsToCash, setAddDividendsToCash] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && portfolio) {
      const existingRates = portfolio.settings?.accountTaxRates || {};
      const initialRates: Record<string, number> = {};
      
      portfolioAccounts.forEach(acc => {
        if (existingRates[acc] !== undefined) {
          initialRates[acc] = existingRates[acc];
        } else {
          // Default: IKE/IKZE is 0.0, other is 0.19
          const lowerAcc = acc.toLowerCase();
          if (lowerAcc.includes('ike') || lowerAcc.includes('ikze')) {
            initialRates[acc] = 0.0;
          } else {
            initialRates[acc] = 0.19;
          }
        }
      });
      setAccountTaxRates(initialRates);
      setRiskFreeRate(portfolio.settings?.risk_free_rate !== undefined ? portfolio.settings.risk_free_rate : 2.0);
      setBetaBenchmark(portfolio.settings?.beta_benchmark || 'SPY');
      setCostBasisMethod(portfolio.settings?.cost_basis_method || 'average_cost');
      setAddDividendsToCash(portfolio.settings?.add_dividends_to_cash !== false);
      setErrorMsg(null);
      setSuccessMsg(false);
    }
  }, [isOpen, portfolio, portfolioAccounts]);

  if (!isOpen || !portfolio) return null;

  const isViewer = portfolio.role === 'viewer';

  const handleTaxExemptChange = (account: string, isExempt: boolean) => {
    setAccountTaxRates(prev => ({
      ...prev,
      [account]: isExempt ? 0.0 : 0.19
    }));
  };

  const handleRatePercentChange = (account: string, percentVal: string) => {
    const parsed = parseFloat(percentVal);
    const rate = isNaN(parsed) ? 0.19 : parsed / 100;
    setAccountTaxRates(prev => ({
      ...prev,
      [account]: Math.max(0.0, Math.min(1.0, rate))
    }));
  };

  const handleSave = async () => {
    if (isViewer) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const updatedSettings = {
        ...portfolio.settings,
        accountTaxRates,
        risk_free_rate: riskFreeRate,
        beta_benchmark: betaBenchmark,
        cost_basis_method: costBasisMethod,
        add_dividends_to_cash: addDividendsToCash
      };
      await updatePortfolioSettings(portfolio.id, updatedSettings);
      setSuccessMsg(true);
      setTimeout(() => {
        onSaveSuccess(updatedSettings);
        onClose();
      }, 800);
    } catch (err: any) {
      console.error('Error saving portfolio settings:', err);
      setErrorMsg(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} style={{ cursor: 'pointer' }} />
      <div className="modal-overlay-container">
        <div className="modal-content" style={{ maxWidth: '520px', width: '95%' }}>
          <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0, fontSize: '1.2rem' }}>
              <Settings size={20} className="gradient-text" />
              <span style={{ fontWeight: 700 }}>{t('modals.settings.title')}</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 400 }}>({portfolio.name})</span>
            </h3>
            <button 
              onClick={onClose}
              className="modal-close-btn"
            >
              <X size={18} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.15)', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <HelpCircle size={16} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: '2px' }} />
              <div>
                {t('modals.settings.tax_mapping_desc')}
              </div>
            </div>

            {errorMsg && (
              <div className="form-error-banner" style={{ padding: '0.65rem 0.85rem', fontSize: '0.8rem', borderRadius: '6px' }}>
                {errorMsg}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', maxHeight: '240px', overflowY: 'auto', paddingRight: '4px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.25rem' }}>
                {t('modals.settings.tax_mapping_title')}
              </span>

              {portfolioAccounts.length === 0 ? (
                <div style={{ padding: '1rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  {t('modals.settings.no_accounts')}
                </div>
              ) : (
                portfolioAccounts.map(accName => {
                  const rate = accountTaxRates[accName] !== undefined ? accountTaxRates[accName] : 0.19;
                  const isExempt = rate === 0;
                  const percentDisplay = (rate * 100).toFixed(0);

                  return (
                    <div 
                      key={accName} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '8px',
                        gap: '1rem',
                        flexWrap: 'wrap'
                      }}
                    >
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '120px' }}>
                        {accName}
                      </span>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        {/* Tax Exempt Checkbox */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: isExempt ? 'var(--color-primary)' : 'var(--text-secondary)', cursor: isViewer ? 'default' : 'pointer', userSelect: 'none' }}>
                          <input 
                            type="checkbox"
                            disabled={isViewer}
                            checked={isExempt}
                            onChange={(e) => handleTaxExemptChange(accName, e.target.checked)}
                            style={{ accentColor: 'var(--color-primary)' }}
                          />
                          {t('modals.settings.tax_exempt')}
                        </label>

                        {/* Tax Rate Input */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <input 
                            type="number"
                            disabled={isViewer || isExempt}
                            value={isExempt ? 0 : percentDisplay}
                            onChange={(e) => handleRatePercentChange(accName, e.target.value)}
                            min="0"
                            max="100"
                            style={{ 
                              width: '55px', 
                              padding: '0.25rem', 
                              fontSize: '0.78rem', 
                              textAlign: 'center',
                              background: isExempt ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              borderRadius: '4px',
                              color: isExempt ? 'var(--text-muted)' : 'var(--text-primary)',
                              fontFamily: 'monospace'
                            }}
                          />
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('modals.settings.tax_suffix')}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Cost Basis Configuration */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', borderTop: '1px solid var(--panel-border)', paddingTop: '0.85rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.25rem' }}>
                {t('modals.settings.cost_basis_title')}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {t('modals.settings.cost_basis_method')}
                </label>
                <select
                  disabled={isViewer}
                  value={costBasisMethod}
                  onChange={(e) => setCostBasisMethod(e.target.value as 'average_cost' | 'fifo')}
                  style={{
                    padding: '0.5rem',
                    fontSize: '0.82rem',
                    background: 'rgba(15, 23, 42, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    cursor: 'pointer',
                    width: '100%'
                  }}
                >
                  <option value="average_cost">{t('modals.settings.average_cost')}</option>
                  <option value="fifo">{t('modals.settings.fifo')}</option>
                </select>
              </div>
              <div 
                onClick={() => !isViewer && setAddDividendsToCash(!addDividendsToCash)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: isViewer ? 'default' : 'pointer',
                  marginTop: '0.45rem',
                  userSelect: 'none'
                }}
              >
                <input 
                  type="checkbox"
                  disabled={isViewer}
                  checked={addDividendsToCash}
                  onChange={() => {}}
                  style={{ accentColor: 'var(--color-primary)', cursor: isViewer ? 'default' : 'pointer' }}
                />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {t('modals.settings.add_div_to_cash', 'Auto-add dividends to cash balance')}
                </span>
              </div>
            </div>

            {/* Analytics Configuration */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', borderTop: '1px solid var(--panel-border)', paddingTop: '0.85rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.25rem' }}>
                {t('modals.settings.analytics_title')}
              </span>
              
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                {/* Risk-Free Rate Input */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1, minWidth: '140px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {t('modals.settings.label_risk_free')}
                  </label>
                  <input 
                    type="number"
                    disabled={isViewer}
                    value={riskFreeRate}
                    onChange={(e) => setRiskFreeRate(parseFloat(e.target.value) || 0)}
                    step="0.01"
                    min="0"
                    max="100"
                    style={{
                      padding: '0.5rem',
                      fontSize: '0.82rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Beta Benchmark Select */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1, minWidth: '180px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {t('modals.settings.label_beta_bench')}
                  </label>
                  <select
                    disabled={isViewer}
                    value={betaBenchmark}
                    onChange={(e) => setBetaBenchmark(e.target.value)}
                    style={{
                      padding: '0.5rem',
                      fontSize: '0.82rem',
                      background: 'rgba(15, 23, 42, 0.95)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="SPY">SPY (S&P 500 ETF)</option>
                    <option value="^GSPC">S&P 500 Index (^GSPC)</option>
                    <option value="^IXIC">Nasdaq Composite (^IXIC)</option>
                    <option value="^DJI">Dow Jones Industrial Average (^DJI)</option>
                    <option value="^WIG20">WIG20 Index (^WIG20)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem', borderTop: '1px solid var(--panel-border)', paddingTop: '1rem' }}>
              <button 
                onClick={onClose}
                className="cancel-btn"
                style={{ padding: '0.45rem 1rem', fontSize: '0.8rem', borderRadius: '6px' }}
              >
                {t('modals.common_cancel')}
              </button>
              
              {!isViewer && (
                <button 
                  onClick={handleSave}
                  disabled={saving || successMsg}
                  className="glow-btn"
                  style={{ 
                    padding: '0.45rem 1rem', 
                    fontSize: '0.8rem', 
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    background: successMsg ? 'var(--color-green)' : 'var(--color-primary)',
                    borderColor: successMsg ? 'var(--color-green)' : 'var(--color-primary)'
                  }}
                >
                  {successMsg ? (
                    <>
                      <Check size={14} /> {t('modals.settings.btn_saved')}
                    </>
                  ) : (
                    <>
                      <Save size={14} /> {saving ? t('modals.settings.btn_saving') : t('modals.settings.btn_save')}
                    </>
                  )}
                </button>
              )}
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
