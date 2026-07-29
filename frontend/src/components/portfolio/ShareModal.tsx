import { useState, useEffect } from 'react';
import { Share2, X, AlertCircle, Users, Shield, UserPlus, Link, Copy, Check } from 'lucide-react';
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
  activePortfolioName?: string;
  showCustomConfirm: (title: string, message: string, onConfirm: () => void, isDestructive?: boolean) => void;
  apiBaseUrl?: string;
}

export function ShareModal({
  isOpen,
  onClose,
  activePortfolioId,
  activePortfolioName,
  showCustomConfirm,
  apiBaseUrl
}: ShareModalProps) {
  const { user } = useAuth();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<'share' | 'referral'>('share');

  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  const [activeLink, setActiveLink] = useState<string | null>(null);
  const [linkRole, setLinkRole] = useState<'editor' | 'viewer'>('viewer');
  const [copiedLink, setCopiedLink] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);

  // Referral Tab State
  const [referralEmail, setReferralEmail] = useState('');
  const [copiedReferralLink, setCopiedReferralLink] = useState(false);
  const [referralSuccess, setReferralSuccess] = useState<string | null>(null);

  const personalReferralLink = user ? `${window.location.origin}/?ref=${user.id.slice(0, 8)}` : '';

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
      setCopiedReferralLink(false);
      setReferralSuccess(null);
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

  const handleCopyReferralLink = () => {
    if (!personalReferralLink) return;
    navigator.clipboard.writeText(personalReferralLink);
    setCopiedReferralLink(true);
    setTimeout(() => setCopiedReferralLink(false), 2000);
  };

  // Handle invitation submission for portfolio sharing
  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);

    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setInviteError(t('modals.share.err_email', 'Please enter an email address.'));
      return;
    }

    setSendingEmail(true);

    try {
      // 1. Try to add directly if registered
      await inviteMemberByEmail(activePortfolioId!, email, inviteRole, members);
      setInviteSuccess(t('modals.share.success_msg', `Invitation sent to ${email}`));
      setInviteEmail('');
      loadSharingData();
    } catch (err: any) {
      // 2. If unregistered, generate invite link & send email via backend!
      try {
        let linkToUse = activeLink;
        if (!linkToUse && user) {
          const invite = await createInvitationLink(activePortfolioId!, inviteRole, user.id);
          linkToUse = `${window.location.origin}/?invite=${invite.id}`;
          setActiveLink(linkToUse);
        }

        if (apiBaseUrl && linkToUse) {
          await fetch(`${apiBaseUrl}/api/share/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient_email: email,
              inviter_name: user?.email?.split('@')[0] || 'A QuantiFi user',
              invite_url: linkToUse,
              portfolio_name: activePortfolioName || 'My Portfolio',
              is_portfolio: true
            })
          });
        }

        setInviteSuccess(`Invitation email sent to ${email}!`);
        setInviteEmail('');
      } catch (sendErr: any) {
        console.error('Error inviting member:', err);
        setInviteError(err.message || "An error occurred.");
      }
    } finally {
      setSendingEmail(false);
    }
  };

  // Handle direct referral email invitation
  const handleSendReferralInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = referralEmail.trim().toLowerCase();
    if (!email) return;

    setSendingEmail(true);
    try {
      if (apiBaseUrl) {
        await fetch(`${apiBaseUrl}/api/share/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient_email: email,
            inviter_name: user?.email?.split('@')[0] || 'A QuantiFi user',
            invite_url: personalReferralLink,
            is_portfolio: false
          })
        });
      }
      setReferralSuccess(`Invitation email dispatched to ${email}!`);
      setReferralEmail('');
      setTimeout(() => setReferralSuccess(null), 4000);
    } catch (err: any) {
      console.error('Error sending referral email:', err);
    } finally {
      setSendingEmail(false);
    }
  };

  // Remove member from portfolio
  const handleRemoveMember = (userId: string) => {
    if (userId === user?.id) {
      alert(t('modals.share.err_remove_self', 'You cannot remove yourself from your own portfolio.'));
      return;
    }
    
    showCustomConfirm(
      t('modals.share.confirm_remove_title', 'Remove Member'),
      t('modals.share.confirm_remove_desc', 'Are you sure you want to remove this member from this portfolio?'),
      async () => {
        try {
          await removeMember(activePortfolioId!, userId);
          loadSharingData();
        } catch (err: any) {
          console.error('Error removing member:', err);
          alert(t('modals.share.err_failed_remove', 'Failed to remove member: ') + err.message);
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
      alert(t('modals.share.err_failed_update', 'Failed to update role: ') + err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} style={{ cursor: 'pointer' }} />
      <div className="modal-overlay-container">
        <div className="modal-content glass-panel" style={{ maxWidth: '520px', width: '95%', height: '520px', display: 'flex', flexDirection: 'column', padding: '1.25rem', overflow: 'hidden' }}>
          
          {/* Header */}
          <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexShrink: 0 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, fontSize: '1.15rem' }}>
              <Share2 size={20} className="gradient-text" /> 
              <span>{t('modals.share.title', 'Share & Invite')}</span>
            </h3>
            <button onClick={onClose} className="modal-close-btn">
              <X size={18} />
            </button>
          </div>

          {/* Top Tabs: Share Portfolio vs Invite Friends */}
          <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.03)', padding: '4px', borderRadius: '8px', marginBottom: '1rem', border: '1px solid var(--panel-border)', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setActiveTab('share')}
              style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'share' ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)' : 'transparent',
                color: activeTab === 'share' ? '#ffffff' : 'var(--text-muted)',
                fontWeight: activeTab === 'share' ? 700 : 500,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                transition: 'all 0.2s',
                boxShadow: activeTab === 'share' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none'
              }}
            >
              <Share2 size={14} style={{ color: activeTab === 'share' ? '#06b6d4' : undefined }} />
              {t('modals.share.tab_share_portfolio', 'Share Portfolio')}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('referral')}
              style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'referral' ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)' : 'transparent',
                color: activeTab === 'referral' ? '#ffffff' : 'var(--text-muted)',
                fontWeight: activeTab === 'referral' ? 700 : 500,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                transition: 'all 0.2s',
                boxShadow: activeTab === 'referral' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none'
              }}
            >
              <UserPlus size={14} style={{ color: activeTab === 'referral' ? '#06b6d4' : undefined }} />
              {t('modals.share.tab_invite_friends', 'Invite Friends')}
            </button>
          </div>

          {/* TAB 1: SHARE PORTFOLIO */}
          {activeTab === 'share' && (
            <div className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                <span>{t('modals.share.sharing_access_to', 'Sharing access to:')}</span>
                <span style={{ fontWeight: 700, color: '#06b6d4', background: 'rgba(6, 182, 212, 0.12)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(6, 182, 212, 0.35)', fontSize: '0.76rem' }}>
                  {activePortfolioName || 'My Portfolio'}
                </span>
              </div>

              {inviteError && (
                <div className="form-error-banner" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.65rem 0.75rem', background: 'var(--color-red-glow)', border: '1px solid var(--color-red)', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.82rem' }}>
                  <AlertCircle size={16} style={{ color: 'var(--color-red)', flexShrink: 0 }} />
                  <span>{inviteError}</span>
                </div>
              )}

              {inviteSuccess && (
                <div className="form-error-banner" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.65rem 0.75rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid var(--color-green)', borderRadius: '8px', color: '#22c55e', marginBottom: '1rem', fontSize: '0.82rem' }}>
                  <span>{inviteSuccess}</span>
                </div>
              )}

              {/* Invite Form */}
              <form onSubmit={handleInviteUser} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '1.25rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '1.25rem' }}>
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label" htmlFor="invite-email" style={{ fontSize: '0.75rem' }}>
                    {t('modals.share.invite_title', 'Invite User by Email')}
                  </label>
                  <input 
                    id="invite-email"
                    type="email"
                    placeholder={t('modals.share.placeholder_email', 'Enter email address...')}
                    className="input-field"
                    style={{ width: '100%', height: '36px', boxSizing: 'border-box', padding: '0.45rem 0.75rem', borderRadius: '6px', fontSize: '0.82rem' }}
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ flex: 1.2 }}>
                  <label className="form-label" htmlFor="invite-role" style={{ fontSize: '0.75rem' }}>
                    {t('modals.share.label_role', 'Role')}
                  </label>
                  <select
                    id="invite-role"
                    className="input-field"
                    style={{ width: '100%', height: '36px', boxSizing: 'border-box', padding: '0.45rem 0.75rem', borderRadius: '6px', fontSize: '0.82rem', cursor: 'pointer' }}
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}
                  >
                    <option value="viewer">{t('modals.share.role_viewer', 'Viewer')}</option>
                    <option value="editor">{t('modals.share.role_editor', 'Editor')}</option>
                  </select>
                </div>

                <button type="submit" disabled={sendingEmail} className="glow-btn" style={{ padding: '0 1rem', height: '36px', boxSizing: 'border-box', borderRadius: '6px', fontSize: '0.82rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {sendingEmail ? t('modals.share.btn_sending', 'Sending...') : t('modals.share.invite_btn', 'Invite')}
                </button>
              </form>

              {/* Invite Link Section */}
              <div style={{ marginBottom: '1.25rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '1.25rem' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Link size={15} style={{ color: '#06b6d4' }} /> 
                  <span>{t('modals.share.invite_link', 'Access Sharing Invite Link')}</span>
                </h4>

                {activeLink ? (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input 
                      type="text" 
                      readOnly 
                      value={activeLink} 
                      className="input-field"
                      style={{ flex: 1, fontSize: '0.78rem', height: '36px', padding: '0.45rem 0.75rem', borderRadius: '6px', cursor: 'text' }}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button 
                      onClick={handleCopyLink} 
                      className="glow-btn"
                      style={{ height: '36px', padding: '0 0.85rem', borderRadius: '6px', fontSize: '0.8rem', background: copiedLink ? 'var(--color-green)' : undefined, justifyContent: 'center' }}
                    >
                      {copiedLink ? t('modals.share.copied', 'Copied!') : t('modals.share.btn_copy', 'Copy')}
                    </button>
                    <button 
                      onClick={handleRevokeLink} 
                      className="glow-btn"
                      style={{ height: '36px', padding: '0 0.85rem', borderRadius: '6px', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--color-red)', border: '1px solid var(--color-red)', justifyContent: 'center' }}
                    >
                      {t('modals.share.action_revoke', 'Revoke')}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ flex: 2 }}>
                      <label className="form-label" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {t('modals.share.label_role', 'Role')}
                      </label>
                      <select
                        className="input-field"
                        style={{ width: '100%', height: '36px', boxSizing: 'border-box', padding: '0.45rem 0.75rem', borderRadius: '6px', fontSize: '0.82rem', cursor: 'pointer' }}
                        value={linkRole}
                        onChange={(e) => setLinkRole(e.target.value as 'editor' | 'viewer')}
                      >
                        <option value="viewer">{t('modals.share.role_viewer', 'Viewer')}</option>
                        <option value="editor">{t('modals.share.role_editor', 'Editor')}</option>
                      </select>
                    </div>
                    <button 
                      onClick={handleGenerateLink} 
                      disabled={creatingLink}
                      className="glow-btn" 
                      style={{ flex: 1.2, height: '36px', padding: '0 1rem', borderRadius: '6px', fontSize: '0.82rem', whiteSpace: 'nowrap', justifyContent: 'center' }}
                    >
                      {creatingLink ? 'Generating...' : 'Generate Invite Link'}
                    </button>
                  </div>
                )}
              </div>

              {/* Members List */}
              <div>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Users size={15} /> 
                  <span>{t('modals.share.active_members', 'Active Portfolio Members')} ({members.length})</span>
                </h4>
                
                {loadingMembers ? (
                  <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }} className="pulse">
                    {t('modals.share.loading_members', 'Loading members list...')}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                    {members.map((member) => (
                      <div key={member.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0.65rem', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={member.email}>
                            {member.email} {member.user_id === user?.id && <span style={{ color: 'var(--color-primary)', fontSize: '0.72rem' }}>{t('modals.share.you', '(You)')}</span>}
                          </span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Shield size={10} /> {member.role === 'owner' ? t('modals.share.role_owner', 'Owner').toUpperCase() : member.role === 'editor' ? t('modals.share.role_editor', 'Editor').toUpperCase() : t('modals.share.role_viewer', 'Viewer').toUpperCase()}
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
                              <option value="viewer">{t('modals.share.role_viewer', 'Viewer')}</option>
                              <option value="editor">{t('modals.share.role_editor', 'Editor')}</option>
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
                              title={t('modals.share.confirm_remove_title', 'Remove Member')}
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
          )}

          {/* TAB 2: INVITE FRIENDS */}
          {activeTab === 'referral' && (
            <div className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
              <div style={{ background: 'rgba(6, 182, 212, 0.06)', border: '1px solid rgba(6, 182, 212, 0.2)', padding: '0.85rem', borderRadius: '8px' }}>
                <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 0.35rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <UserPlus size={16} style={{ color: '#06b6d4' }} />
                  {t('modals.share.referral_title', 'Invite Friends to QuantiFi')}
                </h4>
                <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: 0, lineHeight: 1.4 }}>
                  {t('modals.share.referral_desc', 'Invite your friends to join QuantiFi and build their own investment portfolios.')}
                </p>
              </div>

              {/* Personal Referral Link Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  {t('modals.share.label_personal_link', 'Your Personal Invitation Link')}
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    readOnly
                    value={personalReferralLink}
                    className="input-field"
                    style={{ flex: 1, fontSize: '0.78rem', height: '36px', padding: '0.45rem 0.75rem', borderRadius: '6px', cursor: 'text' }}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    onClick={handleCopyReferralLink}
                    className="glow-btn"
                    style={{ height: '36px', padding: '0 1rem', borderRadius: '6px', fontSize: '0.82rem', background: copiedReferralLink ? 'var(--color-green)' : undefined, justifyContent: 'center' }}
                  >
                    {copiedReferralLink ? (
                      <>
                        <Check size={14} /> {t('modals.share.copied', 'Copied!')}
                      </>
                    ) : (
                      <>
                        <Copy size={14} /> {t('modals.share.btn_copy', 'Copy')}
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Direct Email Referral Invite */}
              {referralSuccess && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.65rem 0.75rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid var(--color-green)', borderRadius: '8px', color: '#22c55e', fontSize: '0.82rem' }}>
                  <span>{referralSuccess}</span>
                </div>
              )}

              <form onSubmit={handleSendReferralInvite} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label" htmlFor="referral-email" style={{ fontSize: '0.75rem' }}>
                    {t('modals.share.label_send_app_invite', 'Send Email Invitation')}
                  </label>
                  <input
                    id="referral-email"
                    type="email"
                    placeholder={t('modals.share.placeholder_email', 'Enter friend\'s email address...')}
                    className="input-field"
                    style={{ width: '100%', height: '36px', boxSizing: 'border-box', padding: '0.45rem 0.75rem', borderRadius: '6px', fontSize: '0.82rem' }}
                    value={referralEmail}
                    onChange={(e) => setReferralEmail(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" disabled={sendingEmail} className="glow-btn" style={{ padding: '0 1.1rem', height: '36px', borderRadius: '6px', fontSize: '0.82rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {sendingEmail ? t('modals.share.btn_sending', 'Sending...') : t('modals.share.btn_send_app_invite', 'Send Invite')}
                </button>
              </form>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
