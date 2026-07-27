import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { AlertCircle, Lock, Mail, UserPlus, LogIn, KeyRound, Eye, EyeOff, Check, Circle, RotateCcw } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useTranslation } from 'react-i18next';

export function AuthView() {
  const { t } = useTranslation();
  const { recoveryMode, setRecoveryMode } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
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

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

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

    const emailAddress = email.trim().toLowerCase();
    if (!emailAddress) {
      setError(t('auth.errorEnterEmail', 'Please enter your email address.'));
      return;
    }
    if (!password) {
      setError(t('auth.errorEnterPassword', 'Please enter a password.'));
      return;
    }

    setSubmitting(true);

    if (isSignUp) {
      if (!confirmPassword) {
        setError(t('auth.errorEnterConfirmPassword', 'Please confirm your password.'));
        setSubmitting(false);
        return;
      }
      if (password !== confirmPassword) {
        setError(t('auth.errorPasswordsMatch', 'Passwords do not match.'));
        setSubmitting(false);
        return;
      }
      if (!validatePasswordStrength(password)) {
        setSubmitting(false);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: emailAddress,
        password,
      });

      if (error) {
        console.error('[SUPABASE AUTH SIGNUP ERROR]:', error);
        setError(error.code ? `${error.message} (Code: ${error.code})` : error.message);
      } else {
        console.log('[SUPABASE AUTH SIGNUP SUCCESS]:', data);
        setSignUpSuccess(true);
        setResendCooldown(60);
        setMessage(t('auth.msgConfirmLinkSent', 'Activation email sent! Check your inbox.'));
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailAddress,
        password,
      });

      if (error) {
        console.error('[SUPABASE AUTH SIGNIN ERROR]:', error);
        setError(error.code ? `${error.message} (Code: ${error.code})` : error.message);
      } else {
        console.log('[SUPABASE AUTH SIGNIN SUCCESS]:', data);
      }
    }
    setSubmitting(false);
  };

  const handleResendSignUpEmail = async () => {
    if (resendCooldown > 0 || submitting) return;
    setError(null);
    setMessage(null);
    setSubmitting(true);

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
      });

      if (error) {
        console.error('[SUPABASE RESEND SIGNUP ERROR]:', error);
        setError(error.code ? `${error.message} (Code: ${error.code})` : error.message);
      } else {
        setMessage(t('auth.msgResentSignUp', 'Activation email resent! Check your inbox.'));
        setResendCooldown(60);
      }
    } catch (err: any) {
      setError(err.message || t('auth.errorDefault', 'An error occurred.'));
    } finally {
      setSubmitting(false);
    }
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
        console.error('[SUPABASE AUTH RESET ERROR]:', error);
        setError(error.code ? `${error.message} (Code: ${error.code})` : error.message);
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
          <form noValidate onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
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

              {/* Password Conformity Checklist - Always visible in recovery mode */}
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
                    color: metRulesCount === 5 ? '#10b981' : metRulesCount >= 3 ? '#06b6d4' : metRulesCount >= 1 ? '#ec4899' : 'var(--text-muted)'
                  }}>
                    {metRulesCount === 5 ? t('auth.strengthStrong', 'Strong') : metRulesCount >= 3 ? t('auth.strengthMedium', 'Medium') : metRulesCount >= 1 ? t('auth.strengthWeak', 'Weak') : t('auth.strengthEmpty', 'Required')}
                  </span>
                </div>

                {/* App Theme Gradient Strength meter bar */}
                <div style={{ width: '100%', height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${(metRulesCount / 5) * 100}%`,
                    background: metRulesCount === 5 
                      ? 'linear-gradient(135deg, #06b6d4 0%, #10b981 100%)' 
                      : 'linear-gradient(135deg, #06b6d4 0%, #ec4899 100%)',
                    boxShadow: metRulesCount > 0 ? '0 0 10px rgba(6, 182, 212, 0.4)' : 'none',
                    transition: 'all 0.3s ease'
                  }} />
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
        ) : signUpSuccess ? (
          /* DEDICATED CHECK YOUR EMAIL SUCCESS SCREEN */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', textAlign: 'center', padding: '0.5rem 0' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(6, 182, 212, 0.12)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              boxShadow: '0 0 20px rgba(6, 182, 212, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#06b6d4'
            }}>
              <Mail size={32} />
            </div>

            <div>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff', margin: '0 0 0.5rem 0' }}>
                {t('auth.checkEmailTitle', 'Check your inbox')}
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                {t('auth.checkEmailDesc', 'We sent an activation link to:')}
              </p>
              <div style={{
                marginTop: '0.4rem',
                fontSize: '0.92rem',
                fontWeight: 700,
                color: '#06b6d4',
                wordBreak: 'break-all',
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--panel-border)'
              }}>
                {email}
              </div>
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.45 }}>
              {t('auth.checkEmailSpamNotice', 'Click the link in the email to activate your account. If you do not see it, check your spam folder.')}
            </p>

            <div style={{ width: '100%', borderTop: '1px solid var(--panel-border)', paddingTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={handleResendSignUpEmail}
                disabled={resendCooldown > 0 || submitting}
                className="glow-btn"
                style={{
                  width: '100%',
                  padding: '0.7rem',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: resendCooldown > 0 || submitting ? 'not-allowed' : 'pointer',
                  opacity: resendCooldown > 0 || submitting ? 0.6 : 1
                }}
              >
                <RotateCcw size={16} />
                {submitting
                  ? t('auth.btnResending', 'Resending...')
                  : resendCooldown > 0
                    ? t('auth.btnResendCooldown', 'Resend Email ({{seconds}}s)', { seconds: resendCooldown })
                    : t('auth.btnResendEmail', 'Resend Activation Email')}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSignUpSuccess(false);
                  setIsSignUp(false);
                  setError(null);
                  setMessage(null);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-primary)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                {t('auth.btnBackToSignIn', 'Back to Sign In')}
              </button>
            </div>
          </div>
        ) : isForgotPassword ? (
          showOtpInput ? (
            /* 2a. VERIFY OTP CODE FORM */
            <form noValidate onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
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
            <form noValidate onSubmit={handleRequestReset} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
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
          <form noValidate onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
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

              {/* Live Password Conformity Checklist - Always visible when signing up */}
              {isSignUp && (
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
                      color: metRulesCount === 5 ? '#10b981' : metRulesCount >= 3 ? '#06b6d4' : metRulesCount >= 1 ? '#ec4899' : 'var(--text-muted)'
                    }}>
                      {metRulesCount === 5 ? t('auth.strengthStrong', 'Strong') : metRulesCount >= 3 ? t('auth.strengthMedium', 'Medium') : metRulesCount >= 1 ? t('auth.strengthWeak', 'Weak') : t('auth.strengthEmpty', 'Required')}
                    </span>
                  </div>

                  {/* App Theme Gradient Strength meter bar */}
                  <div style={{ width: '100%', height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${(metRulesCount / 5) * 100}%`,
                      background: metRulesCount === 5 
                        ? 'linear-gradient(135deg, #06b6d4 0%, #10b981 100%)' 
                        : 'linear-gradient(135deg, #06b6d4 0%, #ec4899 100%)',
                      boxShadow: metRulesCount > 0 ? '0 0 10px rgba(6, 182, 212, 0.4)' : 'none',
                      transition: 'all 0.3s ease'
                    }} />
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
