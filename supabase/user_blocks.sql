-- BURGRS user blocking
-- Run this file in the Supabase SQL Editor.

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_blocks_pkey primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self_block check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_id_idx
  on public.user_blocks (blocked_id, created_at desc);

alter table public.user_blocks enable row level security;

drop policy if exists "Users can view blocks involving them" on public.user_blocks;
create policy "Users can view blocks involving them"
  on public.user_blocks
  for select
  to authenticated
  using (auth.uid() = blocker_id or auth.uid() = blocked_id);

drop policy if exists "Users can block other users" on public.user_blocks;
create policy "Users can block other users"
  on public.user_blocks
  for insert
  to authenticated
  with check (
    auth.uid() = blocker_id
    and blocker_id <> blocked_id
  );

drop policy if exists "Users can remove their own blocks" on public.user_blocks;
create policy "Users can remove their own blocks"
  on public.user_blocks
  for delete
  to authenticated
  using (auth.uid() = blocker_id);

create or replace function public.users_are_blocked(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_blocks
    where
      (blocker_id = p_user_a and blocked_id = p_user_b)
      or
      (blocker_id = p_user_b and blocked_id = p_user_a)
  );
$$;

revoke all on function public.users_are_blocked(uuid, uuid) from public;
revoke all on function public.users_are_blocked(uuid, uuid) from anon;
grant execute on function public.users_are_blocked(uuid, uuid) to authenticated;
grant execute on function public.users_are_blocked(uuid, uuid) to service_role;

create or replace function public.cleanup_blocked_relationship()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.user_follows') is not null then
    delete from public.user_follows
    where
      (follower_id = new.blocker_id and following_id = new.blocked_id)
      or
      (follower_id = new.blocked_id and following_id = new.blocker_id);
  end if;

  if to_regclass('public.notifications') is not null then
    delete from public.notifications
    where
      (recipient_user_id = new.blocker_id and actor_user_id = new.blocked_id)
      or
      (recipient_user_id = new.blocked_id and actor_user_id = new.blocker_id);
  end if;

  return new;
end;
$$;

drop trigger if exists cleanup_blocked_relationship_trigger on public.user_blocks;
create trigger cleanup_blocked_relationship_trigger
  after insert on public.user_blocks
  for each row
  execute function public.cleanup_blocked_relationship();

create or replace function public.prevent_blocked_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.users_are_blocked(new.follower_id, new.following_id) then
    raise exception 'You cannot follow this user because one of you has blocked the other.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.user_follows') is not null then
    drop trigger if exists prevent_blocked_follow_trigger on public.user_follows;
    create trigger prevent_blocked_follow_trigger
      before insert or update on public.user_follows
      for each row
      execute function public.prevent_blocked_follow();
  end if;
end;
$$;

create or replace function public.prevent_blocked_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.actor_user_id is not null
    and new.recipient_user_id is not null
    and public.users_are_blocked(new.actor_user_id, new.recipient_user_id)
  then
    return null;
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.notifications') is not null then
    drop trigger if exists prevent_blocked_notification_trigger on public.notifications;
    create trigger prevent_blocked_notification_trigger
      before insert on public.notifications
      for each row
      execute function public.prevent_blocked_notification();
  end if;
end;
$$;
