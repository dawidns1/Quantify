import { useState, useEffect } from 'react';
import { Share2, X, AlertCircle, Users, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../AuthContext';
import type { Member } from '../../types/portfolio';
import { 
  fetchPortfolioMembers, 
  inviteMemberByEmail, 
  removeMember, 
  updateMemberRole,
  fetchActiveInvitation,
  createInvitationLink,
  revokeInvitationLink
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
  const { t } = useTranslation();
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const [activeLink, setActiveLink] = useState<string | null>(null);
  const [linkRole, setLinkRole] = useState<'editor' | 'viewer'>('viewer');
  const [copiedLink, setCopiedLink] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);

  // Load members and active invite link
  const loadSharingData = async () => {
    if (!activePortfolioId) return;
    setLoadingMembers(true);
    try {
      const [membersData, activeInvite] = await Promise.all([
        fetchPortfolioMembers(activePortfolioId),
        fetchActiveInvitation(activePortfolioId)
      ]);
      setMembers(membersData);
      if (activeInvite) {
        setActiveLink(`${window.location.origin}/?invite=${activeInvite.id}`);
        setLinkRole(activeInvite.role);
      } else {
        setActiveLink(null);
      }
    } catch (err) {
      console.error('Error loading members/invites:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    if (isOpen && activePortfolioId) {
      loadSharingData();
      setInviteError(null);
      setInviteSuccess(null);
      setInviteEmail('');
      setInviteRole('viewer');
      setCopiedLink(false);
    }
  }, [isOpen, activePortfolioId]);

  const handleGenerateLink = async () => {
    if (!activePortfolioId || !user) return;
    setCreatingLink(true);
    setInviteError(null);
    try {
      const invite = await createInvitationLink(activePortfolioId, linkRole, user.id);
      setActiveLink(`${window.location.origin}/?invite=${invite.id}`);
      setCopiedLink(false);
    } catch (err: any) {
      console.error('Error generating invite link:', err);
      setInviteError(err.message || 'Failed to generate invitation link.');
    } finally {
      setCreatingLink(false);
    }
  };

  const handleRevokeLink = async () => {
    if (!activePortfolioId) return;
    try {
      await revokeInvitationLink(activePortfolioId);
      setActiveLink(null);
      setCopiedLink(false);
    } catch (err: any) {
      console.error('Error revoking invite link:', err);
      setInviteError(err.message || 'Failed to revoke invitation link.');
    }
  };

  const handleCopyLink = () => {
    if (!activeLink) return;
    navigator.clipboard.writeText(activeLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Handle invitation submission
  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);

    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setInviteError(t('modals.share.err_email'));
      return;
    }

    try {
      await inviteMemberByEmail(activePortfolioId!, email, inviteRole, members);
      setInviteSuccess(t('modals.share.success_msg', { email }));
      setInviteEmail('');
      loadSharingData();
    } catch (err: any) {
      console.error('Error inviting member:', err);
      setInviteError(err.message || "An error occurred.");
    }
  };

  // Remove member from portfolio
  const handleRemoveMember = (userId: string) => {
    if (userId === user?.id) {
      alert(t('modals.share.err_remove_self'));
      return;
    }
    
    showCustomConfirm(
      t('modals.share.confirm_remove_title'),
      t('modals.share.confirm_remove_desc'),
      async () => {
        try {
          await removeMember(activePortfolioId!, userId);
          loadSharingData();
        } catch (err: any) {
          console.error('Error removing member:', err);
          alert(t('modals.share.err_failed_remove') + err.message);
        }
      },
      true
    );
  };

  const handleChangeMemberRole = async (userId: string, newRole: 'editor' | 'viewer') => {
    try {
      await updateMemberRole(activePortfolioId!, userId, newRole);
      loadSharingData();
    } catch (err: any) {
      console.error('Error updating member role:', err);
      alert(t('modals.share.err_failed_update') + err.message);
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
              <Share2 size={20} className="gradient-text" /> {t('modals.share.title')}
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
              <label className="form-label" htmlFor="invite-email">{t('modals.share.invite_title')}</label>
              <input 
                id="invite-email"
                type="email"
                placeholder={t('modals.share.placeholder_email')}
                className="input-field"
                style={{ width: '100%', height: '38px', boxSizing: 'border-box', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.85rem' }}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ flex: 1.2 }}>
              <label className="form-label" htmlFor="invite-role">{t('modals.share.label_role')}</label>
              <select
                id="invite-role"
                className="input-field"
                style={{ width: '100%', height: '38px', boxSizing: 'border-box', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}
              >
                <option value="viewer">{t('modals.share.role_viewer')}</option>
                <option value="editor">{t('modals.share.role_editor')}</option>
              </select>
            </div>

            <button type="submit" className="glow-btn" style={{ padding: '0 1.25rem', height: '38px', boxSizing: 'border-box', borderRadius: '6px', fontSize: '0.85rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {t('modals.share.invite_btn')}
            </button>
          </form>

          {/* Invite Link Section */}
          <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '1.5rem' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Share2 size={16} /> {t('modals.share.invite_link')}
            </h4>

            {activeLink ? (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input 
                  type="text" 
                  readOnly 
                  value={activeLink} 
                  className="input-field"
                  style={{ flex: 1, fontSize: '0.8rem', height: '38px', padding: '0.5rem 0.75rem', borderRadius: '6px', cursor: 'text' }}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button 
                  onClick={handleCopyLink} 
                  className="glow-btn"
                  style={{ height: '38px', padding: '0 1rem', borderRadius: '6px', fontSize: '0.82rem', background: copiedLink ? 'var(--color-green)' : undefined, justifyContent: 'center' }}
                >
                  {copiedLink ? t('modals.share.copied') : t('modals.share.btn_copy')}
                </button>
                <button 
                  onClick={handleRevokeLink} 
                  className="glow-btn"
                  style={{ height: '38px', padding: '0 1rem', borderRadius: '6px', fontSize: '0.82rem', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--color-red)', border: '1px solid var(--color-red)', justifyContent: 'center' }}
                >
                  {t('modals.share.action_revoke')}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('modals.share.label_role')}</label>
                  <select
                    className="input-field"
                    style={{ width: '100%', height: '38px', boxSizing: 'border-box', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
                    value={linkRole}
                    onChange={(e) => setLinkRole(e.target.value as 'editor' | 'viewer')}
                  >
                    <option value="viewer">{t('modals.share.role_viewer')}</option>
                    <option value="editor">{t('modals.share.role_editor')}</option>
                  </select>
                </div>
                <button 
                  onClick={handleGenerateLink} 
                  disabled={creatingLink}
                  className="glow-btn" 
                  style={{ flex: 1.2, height: '38px', padding: '0 1rem', borderRadius: '6px', fontSize: '0.85rem', whiteSpace: 'nowrap', justifyContent: 'center' }}
                >
                  {creatingLink ? 'Generating...' : 'Generate Invite Link'}
                </button>
              </div>
            )}
          </div>

          {/* Members List */}
          <div>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Users size={16} /> {t('modals.share.active_members')} ({members.length})
            </h4>
            
            {loadingMembers ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }} className="pulse">
                {t('modals.share.loading_members')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxHeight: '220px', overflowY: 'auto', paddingRight: '4px' }}>
                {members.map((member) => (
                  <div key={member.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={member.email}>
                        {member.email} {member.user_id === user?.id && <span style={{ color: 'var(--color-primary)', fontSize: '0.75rem' }}>{t('modals.share.you')}</span>}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Shield size={10} /> {member.role === 'owner' ? t('modals.share.role_owner').toUpperCase() : member.role === 'editor' ? t('modals.share.role_editor').toUpperCase() : t('modals.share.role_viewer').toUpperCase()}
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
                          <option value="viewer">{t('modals.share.role_viewer')}</option>
                          <option value="editor">{t('modals.share.role_editor')}</option>
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
                          title={t('modals.share.confirm_remove_title')}
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
