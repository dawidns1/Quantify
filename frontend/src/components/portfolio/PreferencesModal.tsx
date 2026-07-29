import { useState, useEffect } from 'react';
import { X, Check, Save, SlidersHorizontal, Globe, Coins, LayoutGrid, Cpu, Wallet, Activity, Trash2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BaseCurrencyType } from '../../context/PortfolioContext';
import { deleteUserAccount } from '../../services/supabaseService';

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  baseCurrency: BaseCurrencyType;
  setBaseCurrency: (val: BaseCurrencyType) => void;
  linkCash: boolean;
  setLinkCash: (val: boolean) => void;
  onOpenTelemetry?: () => void;
}

export function PreferencesModal({
  isOpen,
  onClose,
  baseCurrency,
  setBaseCurrency,
  linkCash,
  setLinkCash,
  onOpenTelemetry
}: PreferencesModalProps) {
  const { t, i18n } = useTranslation();
  
  const [selectedLanguage, setSelectedLanguage] = useState<string>('en');
  const [selectedCurrency, setSelectedCurrency] = useState<BaseCurrencyType>('USD');
  const [selectedDensity, setSelectedDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [lowPerfMode, setLowPerfMode] = useState<boolean>(false);
  const [selectedLinkCash, setSelectedLinkCash] = useState<boolean>(true);
  
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await deleteUserAccount();
      onClose();
    } catch (err) {
      console.error('Error deleting user account:', err);
    } finally {
      setDeletingAccount(false);
      setShowDeleteConfirm(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      // Load current settings from i18n, props, and localStorage
      let currentLang = 'en';
      if (i18n.language.startsWith('pl')) {
        currentLang = 'pl';
      } else if (i18n.language.startsWith('es')) {
        currentLang = 'es';
      }
      setSelectedLanguage(currentLang);
      setSelectedCurrency(baseCurrency);
      setSelectedLinkCash(linkCash);
      
      const currentDensity = (localStorage.getItem('settings_row_density') as 'comfortable' | 'compact') || 'comfortable';
      setSelectedDensity(currentDensity);
      
      const currentLowPerf = localStorage.getItem('settings_low_perf_mode') === 'true';
      setLowPerfMode(currentLowPerf);
      
      setSuccessMsg(false);
      setSaving(false);
    }
  }, [isOpen, baseCurrency, linkCash, i18n.language]);

  if (!isOpen) return null;

  const handleSave = () => {
    setSaving(true);

    // Apply currency & cash linking
    setBaseCurrency(selectedCurrency);
    setLinkCash(selectedLinkCash);

    // Apply language
    i18n.changeLanguage(selectedLanguage);

    // Apply local preferences
    localStorage.setItem('settings_row_density', selectedDensity);
    localStorage.setItem('settings_low_perf_mode', lowPerfMode ? 'true' : 'false');

    // Notify other components via custom event
    window.dispatchEvent(new Event('app-settings-changed'));

    setSuccessMsg(true);
    setTimeout(() => {
      onClose();
    }, 600);
  };

  const optionButtonStyle = (active: boolean) => ({
    flex: 1,
    padding: '0.55rem 0.8rem',
    fontSize: '0.78rem',
    fontWeight: 600,
    borderRadius: '6px',
    border: active ? '1px solid var(--color-primary)' : '1px solid rgba(255, 255, 255, 0.08)',
    background: active ? 'rgba(6, 182, 212, 0.12)' : 'rgba(255, 255, 255, 0.02)',
    color: active ? 'white' : 'var(--text-secondary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.35rem',
    transition: 'all 0.2s ease',
  });

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} style={{ cursor: 'pointer' }} />
      <div className="modal-overlay-container">
        <div className="modal-content" style={{ maxWidth: '440px', width: '95%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '1.25rem 1.25rem 1rem 1.25rem', overflow: 'hidden' }}>
          {/* Header (Fixed Sticky Top) */}
          <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexShrink: 0 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0, fontSize: '1.15rem' }}>
              <SlidersHorizontal size={18} className="gradient-text" />
              <span style={{ fontWeight: 700 }}>{t('modals.preferences.title', 'Application Preferences')}</span>
            </h3>
            <button onClick={onClose} className="modal-close-btn">
              <X size={18} />
            </button>
          </div>

          {/* Form Content (Custom Scrollable Body) */}
          <div className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
            
            {/* Subtitle / Description */}
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {t('modals.preferences.subtitle', 'Configure global settings for your session.')}
            </p>

            {/* Language Selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Globe size={12} style={{ color: 'var(--color-primary)' }} />
                {t('modals.preferences.label_language', 'App Language')}
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  type="button"
                  style={optionButtonStyle(selectedLanguage === 'en')}
                  onClick={() => setSelectedLanguage('en')}
                >
                  English
                </button>
                <button 
                  type="button"
                  style={optionButtonStyle(selectedLanguage === 'pl')}
                  onClick={() => setSelectedLanguage('pl')}
                >
                  Polski
                </button>
                <button 
                  type="button"
                  style={optionButtonStyle(selectedLanguage === 'es')}
                  onClick={() => setSelectedLanguage('es')}
                >
                  Español
                </button>
              </div>
            </div>

            {/* Currency Selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Coins size={12} style={{ color: 'var(--color-primary)' }} />
                {t('modals.preferences.label_currency', 'Base Currency')}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                {(['PLN', 'USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY'] as const).map((curr) => (
                  <button 
                    key={curr}
                    type="button"
                    style={optionButtonStyle(selectedCurrency === curr)}
                    onClick={() => setSelectedCurrency(curr)}
                  >
                    {curr}
                  </button>
                ))}
              </div>
            </div>

            {/* Link Cash Balance Selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Wallet size={12} style={{ color: 'var(--color-primary)' }} />
                {t('modals.preferences.label_link_cash', 'Link Cash Balance')}
              </label>
              <div 
                onClick={() => setSelectedLinkCash(!selectedLinkCash)}
                style={{
                  padding: '0.65rem 0.8rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(255, 255, 255, 0.01)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.01)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'white' }}>
                    {t('modals.preferences.link_cash_title', 'Auto-adjust Cash on Trades & Dividends')}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                    {t('modals.preferences.link_cash_desc', 'Automatically add dividend payouts and stock trades to fiat cash positions.')}
                  </span>
                </div>
                <div style={{
                  width: '36px',
                  height: '20px',
                  borderRadius: '10px',
                  background: selectedLinkCash ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)',
                  position: 'relative',
                  transition: 'all 0.2s ease',
                  flexShrink: 0
                }}>
                  <div style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: 'white',
                    position: 'absolute',
                    top: '2px',
                    left: selectedLinkCash ? '18px' : '2px',
                    transition: 'all 0.2s ease'
                  }} />
                </div>
              </div>
            </div>

            {/* Row Density Selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <LayoutGrid size={12} style={{ color: 'var(--color-primary)' }} />
                {t('modals.preferences.label_density', 'Table Row Density')}
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  type="button"
                  style={optionButtonStyle(selectedDensity === 'comfortable')}
                  onClick={() => setSelectedDensity('comfortable')}
                >
                  {t('modals.preferences.density_comfortable', 'Comfortable')}
                </button>
                <button 
                  type="button"
                  style={optionButtonStyle(selectedDensity === 'compact')}
                  onClick={() => setSelectedDensity('compact')}
                >
                  {t('modals.preferences.density_compact', 'Compact')}
                </button>
              </div>
            </div>

            {/* Performance Mode Selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Cpu size={12} style={{ color: 'var(--color-primary)' }} />
                {t('modals.preferences.label_performance', 'Performance Mode')}
              </label>
              <div 
                onClick={() => setLowPerfMode(!lowPerfMode)}
                style={{
                  padding: '0.65rem 0.8rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(255, 255, 255, 0.01)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.01)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                }}
              >
                <input 
                  type="checkbox"
                  checked={lowPerfMode}
                  onChange={() => {}} // handled by parent div click
                  style={{ accentColor: 'var(--color-primary)', pointerEvents: 'none' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'white' }}>
                    {t('modals.preferences.performance_low', 'Low Performance (Max Speed)')}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    {t('modals.preferences.performance_desc', 'Disables card glow tracking & transitions.')}
                  </span>
                </div>
              </div>
            </div>
            {/* Telemetry & System Diagnostics Button */}
            {onOpenTelemetry && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Activity size={12} style={{ color: '#06b6d4' }} />
                  {t('modals.preferences.label_telemetry', 'System Diagnostics')}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenTelemetry();
                  }}
                  style={{
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(6, 182, 212, 0.35)',
                    background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.08) 0%, rgba(15, 23, 42, 0.4) 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    width: '100%',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.6)';
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(6, 182, 212, 0.15) 0%, rgba(15, 23, 42, 0.6) 100%)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.35)';
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(6, 182, 212, 0.08) 0%, rgba(15, 23, 42, 0.4) 100%)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Activity size={14} style={{ color: '#06b6d4' }} />
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'white' }}>
                      {t('modals.preferences.btn_inspect_telemetry', 'System Telemetry & Performance Logs')}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#06b6d4', fontWeight: 700 }}>Inspect ➔</span>
                </button>
              </div>
            )}

            {/* 7. Danger Zone - Delete Account */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-red)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertTriangle size={15} style={{ color: 'var(--color-red)' }} />
                {t('modals.preferences.danger_zone', 'Danger Zone')}
              </label>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  background: 'rgba(239, 68, 68, 0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  width: '100%',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.6)';
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.35)';
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.06)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Trash2 size={14} style={{ color: 'var(--color-red)' }} />
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#f87171' }}>
                    {t('modals.preferences.btn_delete_account', 'Delete My Account')}
                  </span>
                </div>
                <span style={{ fontSize: '0.72rem', color: '#f87171', fontWeight: 700 }}>Delete ➔</span>
              </button>
            </div>

          </div>

          {/* Footer Buttons (Fixed Sticky Bottom) */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.75rem', borderTop: '1px solid var(--panel-border)', paddingTop: '0.75rem', flexShrink: 0 }}>
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
                  <Check size={14} /> {t('modals.preferences.btn_saved', 'Saved!')}
                </>
              ) : (
                <>
                  <Save size={14} /> {saving ? t('modals.preferences.btn_saving', 'Saving...') : t('modals.preferences.btn_save', 'Save Preferences')}
                </>
              )}
            </button>
          </div>

        </div>
      </div>

      {/* Confirmation Modal for Account Deletion */}
      {showDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(6px)', padding: '1rem' }}>
          <div className="glass-panel" style={{ maxWidth: '420px', width: '100%', padding: '1.5rem', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <AlertTriangle size={22} style={{ color: 'var(--color-red)' }} />
              <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'white' }}>
                {t('modals.preferences.confirm_delete_title', 'Delete Account?')}
              </h4>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              {t('modals.preferences.confirm_delete_desc', 'Are you sure you want to permanently delete your QuantiFi account? All your portfolios, transaction histories, and settings will be permanently erased. This action cannot be undone.')}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="cancel-btn"
                style={{ padding: '0.45rem 1rem', fontSize: '0.8rem', borderRadius: '6px' }}
              >
                {t('modals.common_cancel', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deletingAccount}
                style={{
                  padding: '0.45rem 1rem',
                  fontSize: '0.8rem',
                  borderRadius: '6px',
                  background: 'var(--color-red)',
                  borderColor: 'var(--color-red)',
                  color: 'white',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none'
                }}
              >
                {deletingAccount ? t('modals.preferences.deleting', 'Deleting...') : t('modals.preferences.btn_confirm_delete', 'Yes, Delete My Account')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
