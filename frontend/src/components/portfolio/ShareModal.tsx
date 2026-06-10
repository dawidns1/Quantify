import { useState, useEffect } from 'react';
import { Share2, X, AlertCircle, Users, Shield } from 'lucide-react';
import { useAuth } from '../../AuthContext';
import type { Member } from '../../types/portfolio';
import { 
  fetchPortfolioMembers, 
  inviteMemberByEmail, 
  removeMember, 
  updateMemberRole 
} from '../../services/supabaseService';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePortfolioId: string | null;
  showCustomConfirm: (title: string, message: string, onConfirm: () => void, isDestructive?: boolean) => void;
}

export function ShareModal({
  isOpen,
  onClose,
  activePortfolioId,
  showCustomConfirm
}: ShareModalProps) {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // Load members of active portfolio
  const loadMembers = async () => {
    if (!activePortfolioId) return;
    setLoadingMembers(true);
    try {
      const formatted = await fetchPortfolioMembers(activePortfolioId);
      setMembers(formatted);
    } catch (err) {
      console.error('Error loading members:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    if (isOpen && activePortfolioId) {
      loadMembers();
      setInviteError(null);
      setInviteSuccess(null);
      setInviteEmail('');
      setInviteRole('viewer');
    }
  }, [isOpen, activePortfolioId]);

  // Handle invitation submission
  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);

    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setInviteError("Please enter an email address.");
      return;
    }

    try {
      await inviteMemberByEmail(activePortfolioId!, email, inviteRole, members);
      setInviteSuccess(`Successfully shared with ${email}!`);
      setInviteEmail('');
      loadMembers();
    } catch (err: any) {
      console.error('Error inviting member:', err);
      setInviteError(err.message || "An error occurred.");
    }
  };

  // Remove member from portfolio
  const handleRemoveMember = (userId: string) => {
    if (userId === user?.id) {
      alert("You cannot remove yourself from your own portfolio.");
      return;
    }
    
    showCustomConfirm(
      "Remove Member",
      "Are you sure you want to remove this member from this portfolio?",
      async () => {
        try {
          await removeMember(activePortfolioId!, userId);
          loadMembers();
        } catch (err: any) {
          console.error('Error removing member:', err);
          alert('Failed to remove member: ' + err.message);
        }
      },
      true
    );
  };

  const handleChangeMemberRole = async (userId: string, newRole: 'editor' | 'viewer') => {
    try {
      await updateMemberRole(activePortfolioId!, userId, newRole);
      loadMembers();
    } catch (err: any) {
      console.error('Error updating member role:', err);
      alert('Failed to update role: ' + err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} style={{ cursor: 'pointer' }} />
      <div className="modal-overlay-container">
        <div className="modal-content glass-panel" style={{ maxWidth: '480px' }}>
          <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <Share2 size={20} className="gradient-text" /> Share Portfolio
            </h3>
            <button 
              onClick={onClose}
              className="modal-close-btn"
            >
              <X size={20} />
            </button>
          </div>

          {inviteError && (
            <div className="form-error-banner" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.75rem', background: 'var(--color-red-glow)', border: '1px solid var(--color-red)', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
              <AlertCircle size={16} style={{ color: 'var(--color-red)', flexShrink: 0 }} />
              <span>{inviteError}</span>
            </div>
          )}

          {inviteSuccess && (
            <div className="form-error-banner" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.75rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid var(--color-green)', borderRadius: '8px', color: '#22c55e', marginBottom: '1rem', fontSize: '0.85rem' }}>
              <span>{inviteSuccess}</span>
            </div>
          )}

          {/* Invite Form */}
          <form onSubmit={handleInviteUser} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '1.5rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '1.5rem' }}>
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label" htmlFor="invite-email">Invite User by Email</label>
              <input 
                id="invite-email"
                type="email"
                placeholder="collaborator@example.com"
                className="input-field"
                style={{ width: '100%' }}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="invite-role">Access Role</label>
              <select
                id="invite-role"
                className="input-field"
                style={{ width: '100%', cursor: 'pointer' }}
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
            </div>

            <button type="submit" className="glow-btn" style={{ padding: '0.55rem 1rem', height: '38px', borderRadius: '6px' }}>
              Invite
            </button>
          </form>

          {/* Members List */}
          <div>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Users size={16} /> Active Portfolio Members ({members.length})
            </h4>
            
            {loadingMembers ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }} className="pulse">
                Loading members list...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxHeight: '220px', overflowY: 'auto', paddingRight: '4px' }}>
                {members.map((member) => (
                  <div key={member.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={member.email}>
                        {member.email} {member.user_id === user?.id && <span style={{ color: 'var(--color-primary)', fontSize: '0.75rem' }}>(You)</span>}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Shield size={10} /> {member.role.toUpperCase()}
                      </span>
                    </div>

                    {member.user_id !== user?.id && (
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        {/* Role toggler */}
                        <select
                          className="input-field"
                          style={{
                            padding: '0.15rem 0.4rem',
                            fontSize: '0.72rem',
                            height: 'auto',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            background: 'transparent',
                            borderColor: 'var(--panel-border)'
                          }}
                          value={member.role}
                          onChange={(e) => handleChangeMemberRole(member.user_id, e.target.value as 'editor' | 'viewer')}
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                        </select>

                        {/* Remove button */}
                        <button
                          onClick={() => handleRemoveMember(member.user_id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-red)',
                            cursor: 'pointer',
                            padding: '0.2rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Remove Member"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
