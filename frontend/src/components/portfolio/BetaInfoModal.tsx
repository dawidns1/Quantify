import { X, Sparkles, MessageSquare, ShieldCheck, Cpu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import pkg from '../../../package.json';

interface BetaInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFeedback: () => void;
}

export const APP_VERSION = `v${pkg.version}`;

export function BetaInfoModal({ isOpen, onClose, onOpenFeedback }: BetaInfoModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} style={{ cursor: 'pointer' }} />
      <div className="modal-overlay-container">
        <div className="modal-content" style={{ maxWidth: '460px', width: '95%' }}>
          
          {/* Header */}
          <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{
                padding: '0.4rem',
                borderRadius: '8px',
                background: 'rgba(6, 182, 212, 0.15)',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                color: '#06b6d4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Sparkles size={18} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#fff', fontWeight: 700 }}>
                  Quanti<span className="gradient-text">Fi</span> Beta
                </h3>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Version {APP_VERSION}
                </span>
              </div>
            </div>

            <button 
              type="button"
              onClick={onClose}
              className="modal-close-btn"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body Content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            
            <div className="glass-panel" style={{ padding: '0.85rem 1rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.88rem' }}>
                <ShieldCheck size={16} style={{ color: '#06b6d4' }} />
                <span>{t('beta_modal.welcome_title', 'Welcome to Early Beta Access')}</span>
              </div>
              <p style={{ margin: 0, lineHeight: 1.45, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {t('beta_modal.welcome_desc', 'You are testing an early version of QuantiFi Portfolio Intelligence. Features, calculations, and UI elements are undergoing active refinement.')}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--panel-border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Build Release</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>{APP_VERSION}</div>
              </div>

              <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--panel-border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Environment</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#22c55e', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Cpu size={14} /> Live Beta
                </div>
              </div>
            </div>

            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
              {t('beta_modal.help_us', 'Spotted a bug, missing stock data, or have an idea? Your feedback directly impacts upcoming updates.')}
            </div>

            {/* Action Buttons */}
            <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '1rem', marginTop: '0.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.8rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                {t('modals.common_close', 'Close')}
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFeedback();
                }}
                className="glow-btn"
                style={{
                  padding: '0.5rem 1.1rem',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  cursor: 'pointer'
                }}
              >
                <MessageSquare size={15} />
                {t('beta_modal.btn_give_feedback', 'Send Feedback or Bug')}
              </button>
            </div>

          </div>

        </div>
      </div>
    </>
  );
}
