import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Circle } from 'lucide-react';

export interface PasswordRules {
  minLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}

export function getPasswordRules(password: string): PasswordRules {
  return {
    minLength: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[@$!%*?&#]/.test(password),
  };
}

interface PasswordStrengthMeterProps {
  password: string;
}

export const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({ password }) => {
  const { t } = useTranslation();
  const passwordRules = getPasswordRules(password);
  const metRulesCount = Object.values(passwordRules).filter(Boolean).length;

  return (
    <div
      style={{
        marginTop: '0.5rem',
        padding: '0.65rem 0.75rem',
        background: 'rgba(15, 23, 42, 0.6)',
        borderRadius: '8px',
        border: '1px solid var(--panel-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
        fontSize: '0.75rem'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
          {t('auth.passwordStrength', 'Password Requirements')}:
        </span>
        <span
          style={{
            fontWeight: 700,
            color: metRulesCount === 5 ? '#10b981' : metRulesCount >= 3 ? '#06b6d4' : metRulesCount >= 1 ? '#ec4899' : 'var(--text-muted)'
          }}
        >
          {metRulesCount === 5
            ? t('auth.strengthStrong', 'Strong')
            : metRulesCount >= 3
            ? t('auth.strengthMedium', 'Medium')
            : metRulesCount >= 1
            ? t('auth.strengthWeak', 'Weak')
            : t('auth.strengthEmpty', 'Required')}
        </span>
      </div>

      {/* App Theme Gradient Strength meter bar */}
      <div style={{ width: '100%', height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${(metRulesCount / 5) * 100}%`,
            background:
              metRulesCount === 5
                ? 'linear-gradient(135deg, #06b6d4 0%, #10b981 100%)'
                : 'linear-gradient(135deg, #06b6d4 0%, #ec4899 100%)',
            boxShadow: metRulesCount > 0 ? '0 0 10px rgba(6, 182, 212, 0.4)' : 'none',
            transition: 'all 0.3s ease'
          }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', marginTop: '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: passwordRules.minLength ? '#10b981' : 'var(--text-muted)' }}>
          {passwordRules.minLength ? <Check size={12} /> : <Circle size={10} />}
          <span>{t('auth.ruleMinLength', 'Min. 8 chars')}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: passwordRules.hasUpper ? '#10b981' : 'var(--text-muted)' }}>
          {passwordRules.hasUpper ? <Check size={12} /> : <Circle size={10} />}
          <span>{t('auth.ruleUppercase', 'Uppercase (A-Z)')}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: passwordRules.hasLower ? '#10b981' : 'var(--text-muted)' }}>
          {passwordRules.hasLower ? <Check size={12} /> : <Circle size={10} />}
          <span>{t('auth.ruleLowercase', 'Lowercase (a-z)')}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: passwordRules.hasNumber ? '#10b981' : 'var(--text-muted)' }}>
          {passwordRules.hasNumber ? <Check size={12} /> : <Circle size={10} />}
          <span>{t('auth.ruleNumber', 'Number (0-9)')}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', gridColumn: 'span 2', color: passwordRules.hasSpecial ? '#10b981' : 'var(--text-muted)' }}>
          {passwordRules.hasSpecial ? <Check size={12} /> : <Circle size={10} />}
          <span>{t('auth.ruleSpecial', 'Special char (@$!%*?&#)')}</span>
        </div>
      </div>
    </div>
  );
};
