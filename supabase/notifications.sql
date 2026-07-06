-- In-app notifications for BURGRS / Trackt
-- Run this once in Supabase SQL Editor.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  type text not null,
  title text not null,
  body text,
  url text,
  entity_table text,
  entity_id uuid,
  meta jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_user_id, created_at desc);

create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_user_id, read_at)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "Users can read their own notifications" on public.notifications;
create policy "Users can read their own notifications"
  on public.notifications
  for select
  using (auth.uid() = recipient_user_id);

drop policy if exists "Users can mark their own notifications read" on public.notifications;
create policy "Users can mark their own notifications read"
  on public.notifications
  for update
  using (auth.uid() = recipient_user_id)
  with check (auth.uid() = recipient_user_id);

drop policy if exists "Authenticated users can create notifications as actor" on public.notifications;
create policy "Authenticated users can create notifications as actor"
  on public.notifications
  for insert
  with check (
    auth.uid() = actor_user_id
    and recipient_user_id <> auth.uid()
  );

create or replace function public.insert_notification(
  p_recipient_user_id uuid,
  p_actor_user_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_url text default null,
  p_entity_table text default null,
  p_entity_id uuid default null,
  p_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_recipient_user_id is null or p_actor_user_id is null then
    return;
  end if;

  if p_recipient_user_id = p_actor_user_id then
    return;
  end if;

  insert into public.notifications (
    recipient_user_id,
    actor_user_id,
    type,
    title,
    body,
    url,
    entity_table,
    entity_id,
    meta
  ) values (
    p_recipient_user_id,
    p_actor_user_id,
    p_type,
    p_title,
    p_body,
    p_url,
    p_entity_table,
    p_entity_id,
    coalesce(p_meta, '{}'::jsonb)
  );
end;
$$;

create or replace function public.notify_user_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.insert_notification(
    new.following_id,
    new.follower_id,
    'follow',
    'New follower',
    'Someone started following you.',
    '/u/' || new.follower_id::text,
    'user_follows',
    null,
    jsonb_build_object('follower_id', new.follower_id, 'following_id', new.following_id)
  );

  return new;
end;
$$;

drop trigger if exists user_follows_notify_insert on public.user_follows;
create trigger user_follows_notify_insert
after insert on public.user_follows
for each row execute function public.notify_user_follow();

create or replace function public.notify_show_review_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_user_id uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select user_id into parent_user_id
  from public.show_reviews
  where id = new.parent_id;

  perform public.insert_notification(
    parent_user_id,
    new.user_id,
    'review_reply',
    'New review reply',
    'Someone replied to your review.',
    '/show/' || new.show_id::text,
    'show_reviews',
    new.id,
    jsonb_build_object('show_id', new.show_id, 'parent_id', new.parent_id)
  );

  return new;
end;
$$;

drop trigger if exists show_reviews_notify_reply_insert on public.show_reviews;
create trigger show_reviews_notify_reply_insert
after insert on public.show_reviews
for each row execute function public.notify_show_review_reply();

create or replace function public.notify_show_chat_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_user_id uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select user_id into parent_user_id
  from public.show_chat_messages
  where id = new.parent_id;

  perform public.insert_notification(
    parent_user_id,
    new.user_id,
    'chat_reply',
    'New chatboard reply',
    'Someone replied to your chatboard message.',
    '/show/' || new.show_id::text,
    'show_chat_messages',
    new.id,
    jsonb_build_object('show_id', new.show_id, 'parent_id', new.parent_id)
  );

  return new;
end;
$$;

drop trigger if exists show_chat_messages_notify_reply_insert on public.show_chat_messages;
create trigger show_chat_messages_notify_reply_insert
after insert on public.show_chat_messages
for each row execute function public.notify_show_chat_reply();

create or replace function public.notify_creator_post_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
  post_owner_id uuid;
begin
  select user_id into post_owner_id
  from public.creator_posts
  where id = new.post_id;

  if new.parent_comment_id is not null then
    select user_id into target_user_id
    from public.creator_post_comments
    where id = new.parent_comment_id;
  else
    target_user_id := post_owner_id;
  end if;

  perform public.insert_notification(
    target_user_id,
    new.user_id,
    'creator_post_comment',
    'New creator post comment',
    'Someone commented on your creator post.',
    '/u/' || post_owner_id::text,
    'creator_post_comments',
    new.id,
    jsonb_build_object('post_id', new.post_id, 'parent_comment_id', new.parent_comment_id)
  );

  return new;
end;
$$;

drop trigger if exists creator_post_comments_notify_insert on public.creator_post_comments;
create trigger creator_post_comments_notify_insert
after insert on public.creator_post_comments
for each row execute function public.notify_creator_post_comment();
