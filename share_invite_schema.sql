-- Migration: Create Portfolio Invitations and Join RPC Function
-- Run this script in the Supabase SQL Editor (https://supabase.com)

-- 1. Create Portfolio Invitations Table
create table if not exists public.portfolio_invitations (
  id uuid default gen_random_uuid() primary key,
  portfolio_id uuid references public.portfolios(id) on delete cascade not null,
  role text not null check (role in ('editor', 'viewer')) default 'viewer',
  created_by uuid references auth.users(id) on delete cascade not null,
  created_at timestamp with time zone default now() not null,
  is_active boolean default true not null
);

-- 2. Enable Row Level Security (RLS)
alter table public.portfolio_invitations enable row level security;

-- 3. Define RLS Policies
create policy "Anyone can read invitations to verify token"
  on public.portfolio_invitations for select
  using (true);

create policy "Owners can create invitations"
  on public.portfolio_invitations for insert
  with check (
    exists (
      select 1 from public.portfolio_members pm_owner
      where pm_owner.portfolio_id = portfolio_invitations.portfolio_id
      and pm_owner.user_id = auth.uid()
      and pm_owner.role = 'owner'
    )
  );

create policy "Owners can update/deactivate invitations"
  on public.portfolio_invitations for update
  using (
    exists (
      select 1 from public.portfolio_members pm_owner
      where pm_owner.portfolio_id = portfolio_invitations.portfolio_id
      and pm_owner.user_id = auth.uid()
      and pm_owner.role = 'owner'
    )
  );

-- 4. Create the Join RPC Function
create or replace function join_portfolio_via_invite_token(invite_token uuid)
returns json as $$
declare
  invite_record record;
  joined_portfolio_name text;
begin
  -- 1. Find and validate invitation
  select * into invite_record
  from public.portfolio_invitations
  where id = invite_token and is_active = true;

  if not found then
    raise exception 'Invalid or inactive invitation link.';
  end if;

  -- 2. Check if user is already a member
  if exists (
    select 1 from public.portfolio_members
    where portfolio_id = invite_record.portfolio_id and user_id = auth.uid()
  ) then
    raise exception 'You are already a member of this portfolio.';
  end if;

  -- 3. Insert user into portfolio_members
  insert into public.portfolio_members (portfolio_id, user_id, role)
  values (invite_record.portfolio_id, auth.uid(), invite_record.role);

  -- 4. Get portfolio name for confirmation
  select name into joined_portfolio_name
  from public.portfolios
  where id = invite_record.portfolio_id;

  return json_build_object(
    'success', true,
    'portfolio_id', invite_record.portfolio_id,
    'portfolio_name', joined_portfolio_name,
    'role', invite_record.role
  );
end;
$$ language plpgsql security definer;
