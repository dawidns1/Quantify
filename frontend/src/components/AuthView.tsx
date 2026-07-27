import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { AlertCircle, Lock, Mail, UserPlus, LogIn, KeyRound, Eye, EyeOff, Check, Circle } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useTranslation } from 'react-i18next';

export function AuthView() {
  const { t } = useTranslation();
  const { recoveryMode, setRecoveryMode } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [otpToken, setOtpToken] = useState('');

  const passwordRules = {
    minLength: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[@$!%*?&#]/.test(password),
  };
  const metRulesCount = Object.values(passwordRules).filter(Boolean).length;

  // Validate password strength according to rules
  const validatePasswordStrength = (pw: string): boolean => {
    if (pw.length < 8) {
      setError(t('auth.errorPasswordLength', 'Password must be at least 8 characters long.'));
      return false;
    }
    if (!/[A-Z]/.test(pw)) {
      setError(t('auth.errorPasswordUppercase', 'Password must contain at least one uppercase letter.'));
      return false;
    }
    if (!/[a-z]/.test(pw)) {
      setError(t('auth.errorPasswordLowercase', 'Password must contain at least one lowercase letter.'));
      return false;
    }
    if (!/[0-9]/.test(pw)) {
      setError(t('auth.errorPasswordNumber', 'Password must contain at least one number.'));
      return false;
    }
    if (!/[@$!%*?&#]/.test(pw)) {
      setError(t('auth.errorPasswordSpecial', 'Password must contain at least one special character (e.g. @$!%*?&#).'));
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);

    if (isSignUp) {
      if (password !== confirmPassword) {
        setError(t('auth.errorPasswordsMatch', 'Passwords do not match.'));
        setSubmitting(false);
        return;
      }
      if (!validatePasswordStrength(password)) {
        setSubmitting(false);
        return;
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setError(error.message);
      } else {
        setMessage(t('auth.msgConfirmLinkSent', 'Success! Check your email for the confirmation link.'));
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
      }
    }
    setSubmitting(false);
  };

  // Request password reset email link
  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);

    const emailAddress = email.trim().toLowerCase();
    if (!emailAddress) {
      setError(t('auth.errorEnterEmail', 'Please enter your email address.'));
      setSubmitting(false);
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailAddress, {
        redirectTo: window.location.origin,
      });

      if (error) {
        setError(error.message);
      } else {
        setMessage(t('auth.msgRecoveryLinkSent', 'Check your email for the recovery link or 6-digit code.'));
        setShowOtpInput(true);
      }
    } catch (err: any) {
      setError(err.message || t('auth.errorDefault', 'An error occurred.'));
    } finally {
      setSubmitting(false);
    }
  };

  // Verify OTP for password recovery
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);

    const token = otpToken.trim();
    if (token.length < 6) {
      setError(t('auth.errorEnterOtp', 'Please enter a valid verification code.'));
      setSubmitting(false);
      return;
    }

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token,
        type: 'recovery',
      });

      if (error) {
        setError(error.message);
      } else {
        setMessage(t('auth.msgOtpVerified', 'Code verified! Set your new password below.'));
        setRecoveryMode(true);
      }
    } catch (err: any) {
      setError(err.message || t('auth.errorDefault', 'An error occurred.'));
    } finally {
      setSubmitting(false);
    }
  };

  // Update password in recovery mode
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);

    if (password !== confirmPassword) {
      setError(t('auth.errorPasswordsMatch', 'Passwords do not match.'));
      setSubmitting(false);
      return;
    }
    if (!validatePasswordStrength(password)) {
      setSubmitting(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        setError(error.message);
      } else {
        setMessage(t('auth.msgPasswordUpdated', 'Password updated successfully! Redirecting...'));
        setTimeout(() => {
          setRecoveryMode(false); // redirects to portfolio
        }, 1500);
      }
    } catch (err: any) {
      setError(err.message || t('auth.errorDefault', 'An error occurred.'));
    } finally {
      setSubmitting(false);
    }
  };

  // Determine what layout to show
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh', padding: '1rem' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', textAlign: 'center' }}>
          <img 
            src="/favicon.png" 
            alt="QuantiFi Logo" 
            style={{ 
              width: '48px', 
              height: '48px', 
              borderRadius: '10px', 
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 0 15px rgba(6, 182, 212, 0.4)' 
            }} 
          />
          <div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: '0 0 0.25rem 0' }}>
              Quanti<span className="gradient-text">Fi</span>
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              {recoveryMode 
              ? t('auth.subtitleRecovery', 'Set your new secure password below') 
              : isForgotPassword 
                ? t('auth.subtitleForgot', 'Enter your email to receive a password reset link') 
                : isSignUp 
                  ? t('auth.subtitleSignUp', 'Create a secure account to track portfolios') 
                  : t('auth.subtitleSignIn', 'Sign in to access your portfolios across devices')}
            </p>
          </div>
        </div>

        {error && (
          <div className="form-error-banner" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.75rem', background: 'var(--color-red-glow)', border: '1px solid var(--color-red)', borderRadius: '8px', fontSize: '0.85rem' }}>
            <AlertCircle size={16} style={{ color: 'var(--color-red)', flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="form-error-banner" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.75rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid var(--color-green)', borderRadius: '8px', color: '#22c55e', fontSize: '0.85rem' }}>
            <span>{message}</span>
          </div>
        )}

        {/* 1. PASSWORD RECOVERY UPDATE FORM */}
        {recoveryMode ? (
          <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="recovery-password-input">{t('auth.labelNewPassword', 'New Password')}</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  id="recovery-password-input"
                  type={showPassword ? 'text' : 'password'}
                  className="input-field"
                  style={{ paddingLeft: '38px', paddingRight: '38px', width: '100%' }}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {password.length > 0 && (
                <div style={{
                  marginTop: '0.6rem',
                  padding: '0.65rem 0.75rem',
                  background: 'rgba(15, 23, 42, 0.6)',
                  borderRadius: '8px',
                  border: '1px solid var(--panel-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                  fontSize: '0.75rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                      {t('auth.passwordStrength', 'Password Requirements')}:
                    </span>
                    <span style={{
                      fontWeight: 700,
                      color: metRulesCount === 5 ? '#22c55e' : metRulesCount >= 3 ? '#eab308' : '#ef4444'
                    }}>
                      {metRulesCount === 5 ? t('auth.strengthStrong', 'Strong') : metRulesCount >= 3 ? t('auth.strengthMedium', 'Medium') : t('auth.strengthWeak', 'Weak')}
                    </span>
                  </div>

                  <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${(metRulesCount / 5) * 100}%`,
                      background: metRulesCount === 5 ? '#22c55e' : metRulesCount >= 3 ? '#eab308' : '#ef4444',
                      transition: 'all 0.3s ease'
                    }} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', marginTop: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: passwordRules.minLength ? '#22c55e' : 'var(--text-muted)' }}>
                      {passwordRules.minLength ? <Check size={12} /> : <Circle size={10} />}
                      <span>{t('auth.ruleMinLength', 'Min. 8 chars')}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: passwordRules.hasUpper ? '#22c55e' : 'var(--text-muted)' }}>
                      {passwordRules.hasUpper ? <Check size={12} /> : <Circle size={10} />}
                      <span>{t('auth.ruleUppercase', 'Uppercase (A-Z)')}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: passwordRules.hasLower ? '#22c55e' : 'var(--text-muted)' }}>
                      {passwordRules.hasLower ? <Check size={12} /> : <Circle size={10} />}
                      <span>{t('auth.ruleLowercase', 'Lowercase (a-z)')}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: passwordRules.hasNumber ? '#22c55e' : 'var(--text-muted)' }}>
                      {passwordRules.hasNumber ? <Check size={12} /> : <Circle size={10} />}
                      <span>{t('auth.ruleNumber', 'Number (0-9)')}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', gridColumn: 'span 2', color: passwordRules.hasSpecial ? '#22c55e' : 'var(--text-muted)' }}>
                      {passwordRules.hasSpecial ? <Check size={12} /> : <Circle size={10} />}
                      <span>{t('auth.ruleSpecial', 'Special char (@$!%*?&#)')}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="recovery-confirm-password-input">{t('auth.labelConfirmNewPassword', 'Confirm New Password')}</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  id="recovery-confirm-password-input"
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="input-field"
                  style={{ paddingLeft: '38px', paddingRight: '38px', width: '100%' }}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {confirmPassword.length > 0 && (
                <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem', color: password === confirmPassword ? '#22c55e' : '#ef4444' }}>
                  {password === confirmPassword ? <Check size={12} /> : <Circle size={10} />}
                  <span>{password === confirmPassword ? t('auth.passwordsMatch', 'Passwords match') : t('auth.passwordsDoNotMatch', 'Passwords do not match')}</span>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="glow-btn"
              style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
              disabled={submitting}
            >
              <KeyRound size={18} />
              {submitting ? t('auth.btnUpdating', 'Updating...') : t('auth.btnUpdatePassword', 'Update Password')}
            </button>
          </form>
        ) : isForgotPassword ? (
          showOtpInput ? (
            /* 2a. VERIFY OTP CODE FORM */
            <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <div className="form-group">
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 0.75rem 0', lineHeight: '1.4' }}>
                  {t('auth.recoveryEmailSentText', 'We sent a recovery email to {{email}}. Enter the 6-digit verification code below:', { email })}
                </p>
                <label className="form-label" htmlFor="otp-token-input">{t('auth.labelVerificationCode', 'Verification Code (6-digit)')}</label>
                <div style={{ position: 'relative' }}>
                  <KeyRound size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    id="otp-token-input"
                    type="text"
                    className="input-field"
                    style={{ paddingLeft: '38px', width: '100%', letterSpacing: '3px', textAlign: 'center', fontSize: '1.2rem', fontWeight: 700 }}
                    placeholder="12345678"
                    maxLength={10}
                    value={otpToken}
                    onChange={(e) => setOtpToken(e.target.value.replace(/\D/g, ''))}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="glow-btn"
                style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
                disabled={submitting}
              >
                <KeyRound size={18} />
                {submitting ? t('auth.btnVerifying', 'Verifying...') : t('auth.btnVerifyCode', 'Verify Code')}
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--panel-border)', paddingTop: '1rem', fontSize: '0.85rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowOtpInput(false);
                    setError(null);
                    setMessage(null);
                  }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 600 }}
                >
                  {t('auth.btnBack', 'Back')}
                </button>
                <button
                  type="button"
                  onClick={(e) => handleRequestReset(e)}
                  disabled={submitting}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  {t('auth.btnResendCode', 'Resend Code')}
                </button>
              </div>
            </form>
          ) : (
            /* 2b. REQUEST FORGOT PASSWORD RESET EMAIL FORM */
            <form onSubmit={handleRequestReset} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="forgot-email-input">{t('auth.labelEmail', 'Email Address')}</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    id="forgot-email-input"
                    type="email"
                    className="input-field"
                    style={{ paddingLeft: '38px', width: '100%' }}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="glow-btn"
                style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
                disabled={submitting}
              >
                <Mail size={18} />
                {submitting ? t('auth.btnSending', 'Sending...') : t('auth.btnSendResetLink', 'Send Reset Link')}
              </button>

              <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '1rem', textAlign: 'center', fontSize: '0.85rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(false);
                    setShowOtpInput(false);
                    setError(null);
                    setMessage(null);
                  }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 600 }}
                >
                  {t('auth.btnBackToSignIn', 'Back to Sign In')}
                </button>
              </div>
            </form>
          )
        ) : (
          /* 3. STANDARD SIGN IN / SIGN UP FORM */
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="login-email-input">{t('auth.labelEmail', 'Email Address')}</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  id="login-email-input"
                  type="email"
                  className="input-field"
                  style={{ paddingLeft: '38px', width: '100%' }}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="login-password-input">{t('auth.labelPassword', 'Password')}</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  id="login-password-input"
                  type={showPassword ? 'text' : 'password'}
                  className="input-field"
                  style={{ paddingLeft: '38px', paddingRight: '38px', width: '100%' }}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Live Password Conformity Checklist when signing up */}
              {isSignUp && password.length > 0 && (
                <div style={{
                  marginTop: '0.6rem',
                  padding: '0.65rem 0.75rem',
                  background: 'rgba(15, 23, 42, 0.6)',
                  borderRadius: '8px',
                  border: '1px solid var(--panel-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                  fontSize: '0.75rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                      {t('auth.passwordStrength', 'Password Requirements')}:
                    </span>
                    <span style={{
                      fontWeight: 700,
                      color: metRulesCount === 5 ? '#22c55e' : metRulesCount >= 3 ? '#eab308' : '#ef4444'
                    }}>
                      {metRulesCount === 5 ? t('auth.strengthStrong', 'Strong') : metRulesCount >= 3 ? t('auth.strengthMedium', 'Medium') : t('auth.strengthWeak', 'Weak')}
                    </span>
                  </div>

                  {/* Strength meter bar */}
                  <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${(metRulesCount / 5) * 100}%`,
                      background: metRulesCount === 5 ? '#22c55e' : metRulesCount >= 3 ? '#eab308' : '#ef4444',
                      transition: 'all 0.3s ease'
                    }} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', marginTop: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: passwordRules.minLength ? '#22c55e' : 'var(--text-muted)' }}>
                      {passwordRules.minLength ? <Check size={12} /> : <Circle size={10} />}
                      <span>{t('auth.ruleMinLength', 'Min. 8 chars')}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: passwordRules.hasUpper ? '#22c55e' : 'var(--text-muted)' }}>
                      {passwordRules.hasUpper ? <Check size={12} /> : <Circle size={10} />}
                      <span>{t('auth.ruleUppercase', 'Uppercase (A-Z)')}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: passwordRules.hasLower ? '#22c55e' : 'var(--text-muted)' }}>
                      {passwordRules.hasLower ? <Check size={12} /> : <Circle size={10} />}
                      <span>{t('auth.ruleLowercase', 'Lowercase (a-z)')}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: passwordRules.hasNumber ? '#22c55e' : 'var(--text-muted)' }}>
                      {passwordRules.hasNumber ? <Check size={12} /> : <Circle size={10} />}
                      <span>{t('auth.ruleNumber', 'Number (0-9)')}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', gridColumn: 'span 2', color: passwordRules.hasSpecial ? '#22c55e' : 'var(--text-muted)' }}>
                      {passwordRules.hasSpecial ? <Check size={12} /> : <Circle size={10} />}
                      <span>{t('auth.ruleSpecial', 'Special char (@$!%*?&#)')}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {isSignUp && (
              <div className="form-group">
                <label className="form-label" htmlFor="login-confirm-password-input">{t('auth.labelConfirmPassword', 'Confirm Password')}</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    id="login-confirm-password-input"
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="input-field"
                    style={{ paddingLeft: '38px', paddingRight: '38px', width: '100%' }}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {confirmPassword.length > 0 && (
                  <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem', color: password === confirmPassword ? '#22c55e' : '#ef4444' }}>
                    {password === confirmPassword ? <Check size={12} /> : <Circle size={10} />}
                    <span>{password === confirmPassword ? t('auth.passwordsMatch', 'Passwords match') : t('auth.passwordsDoNotMatch', 'Passwords do not match')}</span>
                  </div>
                )}
              </div>
            )}

            {!isSignUp && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(true);
                    setError(null);
                    setMessage(null);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    fontWeight: 500,
                    textDecoration: 'underline'
                  }}
                >
                  {t('auth.btnForgotPassword', 'Forgot Password?')}
                </button>
              </div>
            )}

            <button
              type="submit"
              className="glow-btn"
              style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
              disabled={submitting}
            >
              {isSignUp ? <UserPlus size={18} /> : <LogIn size={18} />}
              {submitting ? t('auth.btnPleaseWait', 'Please wait...') : isSignUp ? t('auth.btnCreateAccount', 'Create Account') : t('auth.btnSignIn', 'Sign In')}
            </button>

            <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '1rem', textAlign: 'center', fontSize: '0.85rem' }}>
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                  setMessage(null);
                }}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 600 }}
              >
                {isSignUp ? t('auth.linkAlreadyHaveAccount', 'Already have an account? Sign In') : t('auth.linkDontHaveAccount', "Don't have an account? Create one")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
