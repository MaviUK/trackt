-- Separate comments for creator posts and creator lists.
-- Run this in Supabase SQL Editor.
-- Review replies continue to use public.show_reviews.parent_id.
-- Chatboard replies continue to use public.show_chat_messages.parent_id.

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_list_comments (
  id uuid primary key default gen_random_uuid(),
  list_key text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists post_comments_post_created_idx
  on public.post_comments (post_id, created_at asc);

create index if not exists creator_list_comments_list_created_idx
  on public.creator_list_comments (list_key, created_at asc);

create or replace function public.set_comment_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_post_comments_updated_at on public.post_comments;
create trigger set_post_comments_updated_at
before update on public.post_comments
for each row execute function public.set_comment_updated_at();

drop trigger if exists set_creator_list_comments_updated_at on public.creator_list_comments;
create trigger set_creator_list_comments_updated_at
before update on public.creator_list_comments
for each row execute function public.set_comment_updated_at();

alter table public.post_comments enable row level security;
alter table public.creator_list_comments enable row level security;

drop policy if exists "Authenticated users can read post comments" on public.post_comments;
create policy "Authenticated users can read post comments"
  on public.post_comments for select to authenticated using (true);

drop policy if exists "Users can create own post comments" on public.post_comments;
create policy "Users can create own post comments"
  on public.post_comments for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update own post comments" on public.post_comments;
create policy "Users can update own post comments"
  on public.post_comments for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own post comments" on public.post_comments;
create policy "Users can delete own post comments"
  on public.post_comments for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Authenticated users can read creator list comments" on public.creator_list_comments;
create policy "Authenticated users can read creator list comments"
  on public.creator_list_comments for select to authenticated using (true);

drop policy if exists "Users can create own creator list comments" on public.creator_list_comments;
create policy "Users can create own creator list comments"
  on public.creator_list_comments for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update own creator list comments" on public.creator_list_comments;
create policy "Users can update own creator list comments"
  on public.creator_list_comments for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own creator list comments" on public.creator_list_comments;
create policy "Users can delete own creator list comments"
  on public.creator_list_comments for delete to authenticated using (auth.uid() = user_id);
