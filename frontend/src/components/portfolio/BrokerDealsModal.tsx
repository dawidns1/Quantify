import { useState, useRef, useEffect } from 'react';
import { X, Gift, Sparkles, ShieldCheck, ExternalLink, ChevronDown, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BROKER_DEALS, SUPPORTED_COUNTRIES, detectUserCountry, type CountryCode } from '../../utils/affiliates';
import { usePortfolio } from '../../context/PortfolioContext';

interface BrokerDealsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BrokerDealsModal({ isOpen, onClose }: BrokerDealsModalProps) {
  const { t, i18n } = useTranslation();
  const { baseCurrency } = usePortfolio();
  
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(() => {
    const cached = localStorage.getItem('quantifi_selected_deal_country') as CountryCode;
    if (cached && SUPPORTED_COUNTRIES.some(c => c.code === cached)) return cached;
    return detectUserCountry(i18n.language, baseCurrency);
  });

  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close country dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setCountryDropdownOpen(false);
      }
    }
    if (countryDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [countryDropdownOpen]);

  if (!isOpen) return null;

  const handleSelectCountry = (code: CountryCode) => {
    setSelectedCountry(code);
    localStorage.setItem('quantifi_selected_deal_country', code);
    setCountryDropdownOpen(false);
  };

  const activeCountry = SUPPORTED_COUNTRIES.find(c => c.code === selectedCountry) || SUPPORTED_COUNTRIES[0];

  // Filter deals matching user's selected country or global
  const visibleDeals = BROKER_DEALS.filter(
    (deal) => deal.countries.includes(selectedCountry) || deal.countries.includes('GLOBAL')
  );

  return (
    <>
      <div 
        className="modal-backdrop" 
        onClick={onClose} 
        style={{ zIndex: 1100, cursor: 'pointer' }} 
      />
      <div className="modal-overlay-container" style={{ zIndex: 1101 }}>
        <div 
          className="modal-content glass-panel" 
          style={{ 
            maxWidth: '500px', 
            width: '94%',
            padding: '1.75rem', 
            position: 'relative',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.7)'
          }}
        >
          {/* Close Button */}
          <button 
            onClick={onClose}
            className="modal-close-btn"
            style={{ 
              position: 'absolute', 
              top: '1.25rem', 
              right: '1.25rem',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '6px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'white')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            title={t('common.close', 'Close')}
          >
            <X size={18} />
          </button>

          {/* Header Icon */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
            <div style={{ 
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.15), rgba(16, 185, 129, 0.15))',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              borderRadius: '50%',
              width: '52px',
              height: '52px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              color: 'var(--color-primary)',
              boxShadow: '0 0 20px rgba(6, 182, 212, 0.2)'
            }}>
              <Gift size={24} />
            </div>
          </div>

          {/* Title & Subtitle */}
          <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {t('broker_deals.title', 'Broker Deals & Community Perks')}
            </h3>
            <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              {t('broker_deals.subtitle', 'Curated zero-commission partners, IKE/IKZE tax wrappers, and verified community perks.')}
            </p>
          </div>

          {/* Country Selector Dropdown Bar */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
            <div ref={dropdownRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setCountryDropdownOpen(!countryDropdownOpen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '20px',
                  padding: '0.35rem 0.85rem',
                  fontSize: '0.78rem',
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.4)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)')}
              >
                <span style={{ fontSize: '1rem', lineHeight: 1 }}>{activeCountry.flag}</span>
                <span style={{ fontWeight: 600 }}>{t(activeCountry.labelKey)}</span>
                <ChevronDown size={12} style={{ color: 'var(--text-muted)', transform: countryDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>

              {/* Dropdown Menu */}
              {countryDropdownOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginTop: '6px',
                    background: 'rgba(18, 24, 38, 0.98)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '10px',
                    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6)',
                    zIndex: 2000,
                    minWidth: '190px',
                    padding: '4px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}
                >
                  <div style={{ padding: '0.3rem 0.6rem', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                    {t('broker_deals.select_country', 'Select Region')}
                  </div>
                  {SUPPORTED_COUNTRIES.map((c) => {
                    const isSelected = c.code === selectedCountry;
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => handleSelectCountry(c.code)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.4rem 0.65rem',
                          background: isSelected ? 'rgba(6, 182, 212, 0.12)' : 'transparent',
                          color: isSelected ? 'var(--color-primary)' : 'var(--text-secondary)',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.78rem',
                          textAlign: 'left',
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '1rem' }}>{c.flag}</span>
                          <span style={{ fontWeight: isSelected ? 700 : 500 }}>{t(c.labelKey)}</span>
                        </div>
                        {isSelected && <Check size={13} style={{ color: 'var(--color-primary)' }} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Body: Deals List or Empty State */}
          {visibleDeals.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {visibleDeals.map((deal) => (
                <div 
                  key={deal.id}
                  className="glass-panel"
                  style={{
                    padding: '1rem',
                    borderRadius: '10px',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    background: 'rgba(255, 255, 255, 0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'white' }}>{deal.name}</span>
                    {deal.badge && (
                      <span style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        color: 'var(--color-primary)',
                        background: 'rgba(6, 182, 212, 0.12)',
                        border: '1px solid rgba(6, 182, 212, 0.25)',
                        padding: '2px 6px',
                        borderRadius: '4px'
                      }}>
                        {deal.badge}
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{deal.tagline}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
                    {deal.perks.map((perk, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        <ShieldCheck size={13} style={{ color: 'var(--color-green)', flexShrink: 0 }} />
                        <span>{perk}</span>
                      </div>
                    ))}
                  </div>
                  <a
                    href={deal.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glow-btn"
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.55rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      borderRadius: '6px',
                      textDecoration: 'none'
                    }}
                  >
                    <span>{t('broker_deals.open_account', 'Open Account')}</span>
                    <ExternalLink size={13} />
                  </a>
                </div>
              ))}
            </div>
          ) : (
            /* Regional Empty State */
            <div style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: '12px',
              padding: '1.25rem 1rem',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}>
              <div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--color-primary)', marginBottom: '0.35rem' }}>
                  <Sparkles size={16} />
                  <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>
                    {t('broker_deals.empty_title_country', 'Exclusive Deals for {{country}} Coming Soon', {
                      country: `${activeCountry.flag} ${t(activeCountry.labelKey)}`
                    })}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {t('broker_deals.empty_desc', 'We are currently negotiating exclusive commission discounts, sign-up perks, and free deposit bonuses for the QuantiFi community. Verified partner links will appear here soon!')}
                </p>
              </div>

              {/* Value Badges */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <ShieldCheck size={15} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                  <span>{t('broker_deals.benefit_1', '0% Commission on Real Stocks & ETFs')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <ShieldCheck size={15} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                  <span>{t('broker_deals.benefit_2', 'Tax-Advantaged IKE & IKZE Accounts')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <ShieldCheck size={15} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                  <span>{t('broker_deals.benefit_3', 'Verified & Regulated European Brokers')}</span>
                </div>
              </div>
            </div>
          )}

          {/* Action Footer */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button
              onClick={onClose}
              className="glow-btn"
              style={{
                width: '100%',
                padding: '0.65rem',
                fontSize: '0.82rem',
                fontWeight: 600,
                borderRadius: '8px',
                cursor: 'pointer',
                border: 'none'
              }}
            >
              {t('common.close', 'Got it')}
            </button>

            <span style={{ 
              fontSize: '0.68rem', 
              color: 'var(--text-muted)', 
              textAlign: 'center', 
              lineHeight: 1.4,
              padding: '0 0.5rem'
            }}>
              {t('broker_deals.affiliate_disclaimer', 'Transparency: QuantiFi will only partner with reputable, regulated financial institutions. Using partner links supports platform development at zero extra cost to you.')}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
