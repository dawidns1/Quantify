import { useState, useEffect } from 'react';
import { X, Sparkles, ShieldCheck, Check } from 'lucide-react';
import { useAuth } from '../../AuthContext';

interface PremiumUpsellModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason: 'portfolio' | 'account' | 'general';
}

export function PremiumUpsellModal({ isOpen, onClose, reason }: PremiumUpsellModalProps) {
  const { setTier } = useAuth();
  const [countdown, setCountdown] = useState(5);
  const [upgrading, setUpgrading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    
    setCountdown(5);
    setSuccess(false);
    setUpgrading(false);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      // Simulate Stripe checkout success
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await setTier('premium');
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Error upgrading:', err);
      setUpgrading(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop" style={{ zIndex: 1100 }} />
      <div className="modal-overlay-container" style={{ zIndex: 1101 }}>
        <div className="modal-content glass-panel" style={{ maxWidth: '440px', padding: '2rem', textAlign: 'center', position: 'relative' }}>
          
          {/* Close button (only active if countdown is 0 or user upgraded) */}
          {(countdown === 0 || success) && (
            <button 
              onClick={onClose}
              className="modal-close-btn"
              style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>
          )}

          {success ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', padding: '1.5rem 0' }}>
              <div style={{ 
                width: '60px', 
                height: '60px', 
                borderRadius: '50%', 
                background: 'rgba(16, 185, 129, 0.15)', 
                color: 'var(--color-green)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                boxShadow: '0 0 20px rgba(16, 185, 129, 0.3)'
              }}>
                <Check size={32} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Upgrade Successful!
              </h3>
              <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text-secondary)' }}>
                Welcome to <strong>QuantiFi Premium</strong>. Limits have been removed!
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Premium Icon Badge */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{ 
                  background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.15), rgba(99, 102, 241, 0.15))',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  borderRadius: '50%',
                  width: '56px',
                  height: '56px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  color: 'var(--color-primary)',
                  boxShadow: '0 0 15px rgba(99, 102, 241, 0.2)'
                }}>
                  <Sparkles size={24} style={{ animation: 'pulse 2s infinite' }} />
                </div>
              </div>

              {/* Title & Limits Reason */}
              <div>
                <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Upgrade to QuantiFi Premium
                </h3>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  {reason === 'portfolio' && (
                    <span>You've hit the limit of <strong>1 portfolio</strong> on the Free Plan. Upgrade to create unlimited portfolios!</span>
                  )}
                  {reason === 'account' && (
                    <span>You've reached the limit of <strong>2 brokerage accounts</strong> per portfolio on the Free Plan. Upgrade to connect unlimited accounts!</span>
                  )}
                  {reason === 'general' && (
                    <span>Unlock advanced analytics, multi-account tax settings, and unlimited tracking tools!</span>
                  )}
                </p>
              </div>

              {/* Feature Checklist */}
              <div style={{ 
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '10px',
                padding: '1rem',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem' }}>
                  <ShieldCheck size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                  <span>Unlimited Portfolios & Sub-accounts</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem' }}>
                  <ShieldCheck size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                  <span>Custom Tax Settings (IKE/IKZE rates)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem' }}>
                  <ShieldCheck size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                  <span>Advanced Dividend Tracking (Gross vs Net)</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  onClick={handleUpgrade}
                  disabled={upgrading}
                  className="glow-btn"
                  style={{
                    padding: '0.75rem',
                    background: 'linear-gradient(90deg, var(--color-primary), hsl(263, 90%, 65%))',
                    color: 'white',
                    border: 'none',
                    fontWeight: 600,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    boxShadow: '0 0 15px rgba(99, 102, 241, 0.3)',
                    transition: 'all 0.2s',
                    width: '100%'
                  }}
                >
                  {upgrading ? 'Processing Upgrade...' : 'Upgrade Now — $9.99/mo'}
                </button>
                
                <button
                  onClick={onClose}
                  disabled={countdown > 0}
                  style={{
                    padding: '0.6rem',
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: countdown > 0 ? 'rgba(255, 255, 255, 0.3)' : 'var(--text-secondary)',
                    borderRadius: '8px',
                    cursor: countdown > 0 ? 'not-allowed' : 'pointer',
                    fontSize: '0.8rem',
                    transition: 'all 0.2s',
                    width: '100%',
                    fontWeight: 500
                  }}
                >
                  {countdown > 0 ? `Skip to free dashboard (${countdown}s)` : 'Skip for Now'}
                </button>
              </div>

            </div>
          )}

        </div>
      </div>
    </>
  );
}
