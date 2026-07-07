-- Creator lists setup for BURGRS / Trackt.
-- Run this FIRST in Supabase SQL Editor.
-- Then run supabase/creator_lists_public_read_policies.sql.

create table if not exists public.creator_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  list_type text not null default 'custom',
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.creator_lists(id) on delete cascade,
  rank integer not null,
  show_id uuid references public.shows(id) on delete set null,
  show_name text not null,
  show_year text,
  poster_url text,
  tmdb_id text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists creator_lists_user_visibility_created_idx
  on public.creator_lists (user_id, visibility, created_at desc);

create index if not exists creator_list_items_list_rank_idx
  on public.creator_list_items (list_id, rank);

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
for each row execute function public.set_creator_lists_updated_at();
