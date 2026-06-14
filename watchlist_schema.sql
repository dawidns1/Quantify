-- Migration: Create Watchlist Table
-- Run this script in the Supabase SQL Editor (https://supabase.com)

-- 1. Create Watchlists Table
create table if not exists public.watchlists (
  user_id uuid references auth.users(id) on delete cascade primary key,
  symbols text[] default '{}'::text[],
  updated_at timestamp with time zone default now()
);

-- 2. Enable Row Level Security (RLS)
alter table public.watchlists enable row level security;

-- 3. Define RLS Policies
create policy "Users can view their own watchlist"
  on public.watchlists for select
  using (auth.uid() = user_id);

create policy "Users can insert their own watchlist"
  on public.watchlists for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own watchlist"
  on public.watchlists for update
  using (auth.uid() = user_id);

create policy "Users can delete their own watchlist"
  on public.watchlists for delete
  using (auth.uid() = user_id);
