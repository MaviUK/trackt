-- Creator profile ranked lists
-- Run this in the Supabase SQL editor before using the creator list UI.

create extension if not exists pgcrypto;

create table if not exists public.creator_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) <= 120),
  description text,
  list_type text not null default 'custom',
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.creator_lists(id) on delete cascade,
  rank integer not null check (rank > 0),
  show_id text,
  show_name text not null,
  show_year text,
  poster_url text,
  tmdb_id text,
  note text,
  created_at timestamptz not null default now(),
  unique (list_id, rank)
);

create index if not exists creator_lists_user_created_idx
  on public.creator_lists (user_id, created_at desc);

create index if not exists creator_lists_public_created_idx
  on public.creator_lists (created_at desc)
  where visibility = 'public';

create index if not exists creator_list_items_list_rank_idx
  on public.creator_list_items (list_id, rank asc);

create or replace function public.set_creator_lists_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_creator_lists_updated_at on public.creator_lists;
create trigger set_creator_lists_updated_at
before update on public.creator_lists
for each row
execute function public.set_creator_lists_updated_at();

alter table public.creator_lists enable row level security;
alter table public.creator_list_items enable row level security;

drop policy if exists "Creator lists are visible to owner or public" on public.creator_lists;
create policy "Creator lists are visible to owner or public"
on public.creator_lists
for select
using (visibility = 'public' or auth.uid() = user_id);

drop policy if exists "Creators can insert own lists" on public.creator_lists;
create policy "Creators can insert own lists"
on public.creator_lists
for insert
with check (auth.uid() = user_id);

drop policy if exists "Creators can update own lists" on public.creator_lists;
create policy "Creators can update own lists"
on public.creator_lists
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Creators can delete own lists" on public.creator_lists;
create policy "Creators can delete own lists"
on public.creator_lists
for delete
using (auth.uid() = user_id);

drop policy if exists "Creator list items follow list visibility" on public.creator_list_items;
create policy "Creator list items follow list visibility"
on public.creator_list_items
for select
using (
  exists (
    select 1
    from public.creator_lists lists
    where lists.id = creator_list_items.list_id
      and (lists.visibility = 'public' or lists.user_id = auth.uid())
  )
);

drop policy if exists "Creators can insert own list items" on public.creator_list_items;
create policy "Creators can insert own list items"
on public.creator_list_items
for insert
with check (
  exists (
    select 1
    from public.creator_lists lists
    where lists.id = creator_list_items.list_id
      and lists.user_id = auth.uid()
  )
);

drop policy if exists "Creators can update own list items" on public.creator_list_items;
create policy "Creators can update own list items"
on public.creator_list_items
for update
using (
  exists (
    select 1
    from public.creator_lists lists
    where lists.id = creator_list_items.list_id
      and lists.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.creator_lists lists
    where lists.id = creator_list_items.list_id
      and lists.user_id = auth.uid()
  )
);

drop policy if exists "Creators can delete own list items" on public.creator_list_items;
create policy "Creators can delete own list items"
on public.creator_list_items
for delete
using (
  exists (
    select 1
    from public.creator_lists lists
    where lists.id = creator_list_items.list_id
      and lists.user_id = auth.uid()
  )
);
