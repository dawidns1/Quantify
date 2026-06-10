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
        name
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
    role: m.role as 'owner' | 'editor' | 'viewer'
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
    throw new Error("No user found with this email. They must log in to Quantify at least once first.");
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
