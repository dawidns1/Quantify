import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { AlertCircle, Lock, Mail, UserPlus, LogIn, KeyRound } from 'lucide-react';
import { useAuth } from '../AuthContext';

export function AuthView() {
  const { recoveryMode, setRecoveryMode } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Validate password strength according to rules
  const validatePasswordStrength = (pw: string): boolean => {
    if (pw.length < 8) {
      setError("Password must be at least 8 characters long.");
      return false;
    }
    if (!/[A-Z]/.test(pw)) {
      setError("Password must contain at least one uppercase letter.");
      return false;
    }
    if (!/[a-z]/.test(pw)) {
      setError("Password must contain at least one lowercase letter.");
      return false;
    }
    if (!/[0-9]/.test(pw)) {
      setError("Password must contain at least one number.");
      return false;
    }
    if (!/[@$!%*?&#]/.test(pw)) {
      setError("Password must contain at least one special character (e.g. @$!%*?&#).");
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
        setError("Passwords do not match.");
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
        setMessage("Success! Check your email for the confirmation link.");
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
      setError("Please enter your email address.");
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
        setMessage("Password reset email sent! Check your inbox.");
        setEmail('');
      }
    } catch (err: any) {
      setError(err.message || "An error occurred.");
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
      setError("Passwords do not match.");
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
        setMessage("Password updated successfully! Redirecting...");
        setTimeout(() => {
          setRecoveryMode(false); // redirects to portfolio
        }, 1500);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred.");
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
            alt="Quantify Logo" 
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
              Quant<span className="gradient-text">ify</span>
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              {recoveryMode 
                ? 'Set your new secure password below' 
                : isForgotPassword 
                  ? 'Enter your email to receive a password reset link' 
                  : isSignUp 
                    ? 'Create a secure account to track portfolios' 
                    : 'Sign in to access your portfolios across devices'}
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
              <label className="form-label" htmlFor="recovery-password-input">New Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  id="recovery-password-input"
                  type="password"
                  className="input-field"
                  style={{ paddingLeft: '38px', width: '100%' }}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="recovery-confirm-password-input">Confirm New Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  id="recovery-confirm-password-input"
                  type="password"
                  className="input-field"
                  style={{ paddingLeft: '38px', width: '100%' }}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
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
              {submitting ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        ) : isForgotPassword ? (
          /* 2. REQUEST FORGOT PASSWORD RESET EMAIL FORM */
          <form onSubmit={handleRequestReset} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="forgot-email-input">Email Address</label>
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
              {submitting ? 'Sending...' : 'Send Reset Link'}
            </button>

            <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '1rem', textAlign: 'center', fontSize: '0.85rem' }}>
              <button
                type="button"
                onClick={() => {
                  setIsForgotPassword(false);
                  setError(null);
                  setMessage(null);
                }}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 600 }}
              >
                Back to Sign In
              </button>
            </div>
          </form>
        ) : (
          /* 3. STANDARD SIGN IN / SIGN UP FORM */
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="login-email-input">Email Address</label>
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
              <label className="form-label" htmlFor="login-password-input">Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  id="login-password-input"
                  type="password"
                  className="input-field"
                  style={{ paddingLeft: '38px', width: '100%' }}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {isSignUp && (
              <div className="form-group">
                <label className="form-label" htmlFor="login-confirm-password-input">Confirm Password</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    id="login-confirm-password-input"
                    type="password"
                    className="input-field"
                    style={{ paddingLeft: '38px', width: '100%' }}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
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
                  Forgot Password?
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
              {submitting ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
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
                {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Create one"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
