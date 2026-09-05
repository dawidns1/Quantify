import { X, Gift, Sparkles, ShieldCheck, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BROKER_DEALS } from '../../utils/affiliates';

interface BrokerDealsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BrokerDealsModal({ isOpen, onClose }: BrokerDealsModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

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
            maxWidth: '480px', 
            width: '92%',
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
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
            <div style={{ 
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.15), rgba(16, 185, 129, 0.15))',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              borderRadius: '50%',
              width: '54px',
              height: '54px',
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
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {t('broker_deals.title', 'Broker Deals & Community Perks')}
            </h3>
            <p style={{ margin: '0.45rem 0 0 0', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              {t('broker_deals.subtitle', 'Curated zero-commission partners, IKE/IKZE tax wrappers, and verified community perks.')}
            </p>
          </div>

          {/* Body: Deals List or Empty State */}
          {BROKER_DEALS.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {BROKER_DEALS.map((deal) => (
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
            /* Elegant Empty State */
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
                    {t('broker_deals.empty_title', 'Exclusive Deals Coming Soon')}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {t('broker_deals.empty_desc', 'We are currently negotiating exclusive commission discounts, sign-up perks, and free deposit bonuses for the QuantiFi community. Verified partner links will appear here soon!')}
                </p>
              </div>

              {/* Preview Value Badges */}
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
