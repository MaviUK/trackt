-- Public read policy for automatic Rank'd Top 10 lists.
-- Run this in Supabase SQL Editor.
-- Creator profiles and the Following feed use public.user_show_rankings
-- to build the default automatic Top 10 list.

alter table public.user_show_rankings enable row level security;

-- Other logged-in users can read Rank'd ladder rows so public creator profiles
-- and following feeds can show automatic Top 10 lists.
drop policy if exists "Authenticated users can read Rankd rankings" on public.user_show_rankings;
create policy "Authenticated users can read Rankd rankings"
  on public.user_show_rankings
  for select
  to authenticated
  using (true);

-- Users can create their own ranking rows.
drop policy if exists "Users can create own Rankd rankings" on public.user_show_rankings;
create policy "Users can create own Rankd rankings"
  on public.user_show_rankings
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Users can update their own ranking rows.
drop policy if exists "Users can update own Rankd rankings" on public.user_show_rankings;
create policy "Users can update own Rankd rankings"
  on public.user_show_rankings
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users can delete their own ranking rows if needed.
drop policy if exists "Users can delete own Rankd rankings" on public.user_show_rankings;
create policy "Users can delete own Rankd rankings"
  on public.user_show_rankings
  for delete
  to authenticated
  using (auth.uid() = user_id);
