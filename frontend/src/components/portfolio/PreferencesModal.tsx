import { useState, useEffect } from 'react';
import { X, Check, Save, SlidersHorizontal, Globe, Coins, LayoutGrid, Cpu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BaseCurrencyType } from '../../context/PortfolioContext';

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  baseCurrency: BaseCurrencyType;
  setBaseCurrency: (val: BaseCurrencyType) => void;
}

export function PreferencesModal({
  isOpen,
  onClose,
  baseCurrency,
  setBaseCurrency
}: PreferencesModalProps) {
  const { t, i18n } = useTranslation();
  
  const [selectedLanguage, setSelectedLanguage] = useState<string>('en');
  const [selectedCurrency, setSelectedCurrency] = useState<BaseCurrencyType>('USD');
  const [selectedDensity, setSelectedDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [lowPerfMode, setLowPerfMode] = useState<boolean>(false);
  
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);

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
      
      const currentDensity = (localStorage.getItem('settings_row_density') as 'comfortable' | 'compact') || 'comfortable';
      setSelectedDensity(currentDensity);
      
      const currentLowPerf = localStorage.getItem('settings_low_perf_mode') === 'true';
      setLowPerfMode(currentLowPerf);
      
      setSuccessMsg(false);
      setSaving(false);
    }
  }, [isOpen, baseCurrency, i18n.language]);

  if (!isOpen) return null;

  const handleSave = () => {
    setSaving(true);

    // Apply currency
    setBaseCurrency(selectedCurrency);

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
        <div className="modal-content" style={{ maxWidth: '420px', width: '95%' }}>
          {/* Header */}
          <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0, fontSize: '1.15rem' }}>
              <SlidersHorizontal size={18} className="gradient-text" />
              <span style={{ fontWeight: 700 }}>{t('modals.preferences.title', 'Application Preferences')}</span>
            </h3>
            <button onClick={onClose} className="modal-close-btn">
              <X size={18} />
            </button>
          </div>

          {/* Form Content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            
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
              <div style={{ display: 'flex', gap: '0.5rem' }}>
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

            {/* Footer Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem', borderTop: '1px solid var(--panel-border)', paddingTop: '1rem' }}>
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
      </div>
    </>
  );
}
