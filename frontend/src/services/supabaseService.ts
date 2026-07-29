import { supabase } from '../supabaseClient';
import type { Portfolio, Member } from '../types/portfolio';

export async function fetchUserPortfolios(userId: string): Promise<Portfolio[]> {
  const { data: membersList, error } = await supabase
    .from('portfolio_members')
    .select(`
      portfolio_id,
      role,
      portfolios (
        id,
        name,
        settings
      )
    `)
    .eq('user_id', userId);

  if (error) throw error;

  if (!membersList || membersList.length === 0) {
    // Return empty list so coordinator can trigger auto-creation
    return [];
  }

  return membersList.map((m: any) => ({
    id: m.portfolio_id,
    name: m.portfolios?.name || 'Unnamed Portfolio',
    role: m.role as 'owner' | 'editor' | 'viewer',
    settings: m.portfolios?.settings || {}
  }));
}

export async function createPortfolio(userId: string, name: string): Promise<Portfolio> {
  const { data: newPortfolio, error: createError } = await supabase
    .from('portfolios')
    .insert({ name })
    .select()
    .single();

  if (createError) throw createError;

  const { error: memberError } = await supabase
    .from('portfolio_members')
    .insert({
      portfolio_id: newPortfolio.id,
      user_id: userId,
      role: 'owner'
    });

  if (memberError) throw memberError;

  return {
    id: newPortfolio.id,
    name: newPortfolio.name,
    role: 'owner'
  };
}

export async function renamePortfolio(portfolioId: string, newName: string): Promise<void> {
  const { error } = await supabase
    .from('portfolios')
    .update({ name: newName })
    .eq('id', portfolioId);

  if (error) throw error;
}

export async function deletePortfolio(portfolioId: string): Promise<void> {
  const { error } = await supabase
    .from('portfolios')
    .delete()
    .eq('id', portfolioId);

  if (error) throw error;
}

export async function fetchPortfolioMembers(portfolioId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('portfolio_members')
    .select(`
      user_id,
      role,
      profiles (
        email
      )
    `)
    .eq('portfolio_id', portfolioId);

  if (error) throw error;
  
  return data.map((m: any) => ({
    user_id: m.user_id,
    role: m.role as 'owner' | 'editor' | 'viewer',
    email: m.profiles?.email || 'Unknown user'
  }));
}

export async function inviteMemberByEmail(
  portfolioId: string,
  email: string,
  role: 'editor' | 'viewer',
  existingMembers: Member[]
): Promise<void> {
  // Find user profile by email
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single();

  if (profileError || !profile) {
    throw new Error("No user found with this email. They must log in to QuantiFi at least once first.");
  }

  // Check if user is already a member
  const isMember = existingMembers.some(m => m.user_id === profile.id);
  if (isMember) {
    throw new Error("This user is already a member of this portfolio.");
  }

  // Insert member
  const { error: insertError } = await supabase
    .from('portfolio_members')
    .insert({
      portfolio_id: portfolioId,
      user_id: profile.id,
      role
    });

  if (insertError) throw insertError;
}

export async function updateMemberRole(
  portfolioId: string,
  userId: string,
  newRole: 'editor' | 'viewer'
): Promise<void> {
  const { error } = await supabase
    .from('portfolio_members')
    .update({ role: newRole })
    .eq('portfolio_id', portfolioId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function removeMember(portfolioId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('portfolio_members')
    .delete()
    .eq('portfolio_id', portfolioId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function updatePortfolioSettings(portfolioId: string, settings: any): Promise<void> {
  const { error } = await supabase
    .from('portfolios')
    .update({ settings })
    .eq('id', portfolioId);

  if (error) throw error;
}

export async function fetchActiveInvitation(portfolioId: string): Promise<any | null> {
  const { data, error } = await supabase
    .from('portfolio_invitations')
    .select()
    .eq('portfolio_id', portfolioId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createInvitationLink(
  portfolioId: string,
  role: 'editor' | 'viewer',
  userId: string
): Promise<any> {
  // First deactivate any existing active invitations for this portfolio
  await supabase
    .from('portfolio_invitations')
    .update({ is_active: false })
    .eq('portfolio_id', portfolioId);

  const { data, error } = await supabase
    .from('portfolio_invitations')
    .insert({
      portfolio_id: portfolioId,
      role,
      created_by: userId
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function revokeInvitationLink(portfolioId: string): Promise<void> {
  const { error } = await supabase
    .from('portfolio_invitations')
    .update({ is_active: false })
    .eq('portfolio_id', portfolioId);
  if (error) throw error;
}

export async function joinPortfolioViaInviteToken(inviteToken: string): Promise<any> {
  const { data, error } = await supabase.rpc('join_portfolio_via_invite_token', { invite_token: inviteToken });
  if (error) throw error;
  return data;
}

export async function deleteUserAccount(): Promise<void> {
  // Try calling delete_user_account RPC
  try {
    await supabase.rpc('delete_user_account');
  } catch (err) {
    console.warn('RPC delete_user_account failed, clearing session:', err);
  }
  // Sign out user locally to redirect to auth view
  await supabase.auth.signOut();
}
