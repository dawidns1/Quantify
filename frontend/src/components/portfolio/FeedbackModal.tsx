import React, { useState } from 'react';
import { X, MessageSquare, Check, Send } from 'lucide-react';
import { useAuth } from '../../AuthContext';
import { usePortfolio } from '../../context/PortfolioContext';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const { user, session } = useAuth();
  const { apiBaseUrl } = usePortfolio();
  const [category, setCategory] = useState<'bug' | 'feedback' | 'question' | 'feature_request'>('feedback');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setErrorMsg('Please enter a message.');
      return;
    }
    setSending(true);
    setErrorMsg(null);

    try {
      const token = session?.access_token;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${apiBaseUrl}/api/feedback`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          category,
          message,
          email: email || null
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'Failed to submit feedback');
      }

      setSuccess(true);
      setTimeout(() => {
        setMessage('');
        setSuccess(false);
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error('Error submitting feedback:', err);
      setErrorMsg(err.message || 'An error occurred. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} style={{ cursor: 'pointer' }} />
      <div className="modal-overlay-container">
        <div className="modal-content" style={{ maxWidth: '480px', width: '95%' }}>
          <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0, fontSize: '1.2rem', color: '#fff' }}>
              <MessageSquare size={20} style={{ color: 'var(--color-primary)' }} />
              <span style={{ fontWeight: 700 }}>Feedback & Bug Report</span>
            </h3>
            <button 
              type="button"
              onClick={onClose}
              className="modal-close-btn"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.25rem' }}
            >
              <X size={18} />
            </button>
          </div>

          {success ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--color-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-green)' }}>
                <Check size={24} />
              </div>
              <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'white' }}>Thank You!</h4>
              <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Your feedback has been submitted successfully. We appreciate your help in making Quantify better!
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                Help us improve Quantify. Report bugs, suggest new features, or ask a question directly to the developer.
              </p>

              {errorMsg && (
                <div className="form-error-banner" style={{ padding: '0.65rem 0.85rem', fontSize: '0.8rem', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: 'var(--color-red)' }}>
                  {errorMsg}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  style={{
                    padding: '0.55rem',
                    fontSize: '0.82rem',
                    background: 'rgba(15, 23, 42, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="feedback">General Feedback</option>
                  <option value="bug">Report a Bug</option>
                  <option value="feature_request">Feature Request</option>
                  <option value="question">Question / Contact Developer</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Contact Email (Optional)</label>
                <input 
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  style={{
                    padding: '0.55rem',
                    fontSize: '0.82rem',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your feedback, request, or details of the bug..."
                  rows={4}
                  required
                  style={{
                    padding: '0.55rem',
                    fontSize: '0.82rem',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                  You can also reach out directly to the developer at: <strong style={{ color: 'var(--color-primary)' }}>dawidns1@gmail.com</strong>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button 
                  type="button"
                  onClick={onClose}
                  style={{ padding: '0.45rem 1.05rem', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                
                <button 
                  type="submit"
                  disabled={sending}
                  style={{ 
                    padding: '0.45rem 1.25rem', 
                    fontSize: '0.8rem', 
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    border: 'none',
                    cursor: 'pointer',
                    background: 'var(--color-primary)',
                    color: 'white',
                    fontWeight: 600
                  }}
                >
                  <Send size={14} /> {sending ? 'Submitting...' : 'Send Feedback'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
