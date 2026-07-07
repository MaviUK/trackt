-- Feed comments for Following feed items.
-- Run this in Supabase SQL Editor.
-- Comments can attach to posts, reviews, creator lists, automatic Rank'd lists, and chatboard posts.

create table if not exists public.feed_comments (
  id uuid primary key default gen_random_uuid(),
  target_key text not null,
  target_type text not null check (target_type in ('post', 'review', 'list', 'chatboard')),
  target_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feed_comments_target_created_idx
  on public.feed_comments (target_key, created_at asc);

create index if not exists feed_comments_user_created_idx
  on public.feed_comments (user_id, created_at desc);

create or replace function public.set_feed_comments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_feed_comments_updated_at on public.feed_comments;
create trigger set_feed_comments_updated_at
before update on public.feed_comments
for each row execute function public.set_feed_comments_updated_at();

alter table public.feed_comments enable row level security;

-- Logged-in users can read comments on feed items.
drop policy if exists "Authenticated users can read feed comments" on public.feed_comments;
create policy "Authenticated users can read feed comments"
  on public.feed_comments
  for select
  to authenticated
  using (true);

-- Logged-in users can create their own comments.
drop policy if exists "Users can create own feed comments" on public.feed_comments;
create policy "Users can create own feed comments"
  on public.feed_comments
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Users can update their own comments.
drop policy if exists "Users can update own feed comments" on public.feed_comments;
create policy "Users can update own feed comments"
  on public.feed_comments
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users can delete their own comments.
drop policy if exists "Users can delete own feed comments" on public.feed_comments;
create policy "Users can delete own feed comments"
  on public.feed_comments
  for delete
  to authenticated
  using (auth.uid() = user_id);
