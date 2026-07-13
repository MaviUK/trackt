-- Secure deletion for a user's own review, reply, or chat message.
-- Run this file once in the Supabase SQL Editor.

create or replace function public.delete_owned_thread_item(
  p_table_name text,
  p_item_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  vote_table_name text;
  vote_item_column text;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in.' using errcode = '42501';
  end if;

  if p_table_name not in ('show_reviews', 'episode_reviews', 'show_chat_messages') then
    raise exception 'Unsupported content type.' using errcode = '22023';
  end if;

  execute format(
    'select user_id from public.%I where id = $1',
    p_table_name
  )
  into owner_id
  using p_item_id;

  if owner_id is null then
    raise exception 'This post no longer exists.' using errcode = 'P0002';
  end if;

  if owner_id <> auth.uid() then
    raise exception 'You can only delete your own post.' using errcode = '42501';
  end if;

  -- Keep replies made by other users visible, but detach them from the deleted item.
  execute format(
    'update public.%I set parent_id = null where parent_id = $1',
    p_table_name
  )
  using p_item_id;

  if p_table_name = 'show_reviews' then
    vote_table_name := 'show_review_votes';
    vote_item_column := 'review_id';
  elsif p_table_name = 'episode_reviews' then
    vote_table_name := 'episode_review_votes';
    vote_item_column := 'review_id';
  else
    vote_table_name := 'show_chat_message_votes';
    vote_item_column := 'message_id';
  end if;

  execute format(
    'delete from public.%I where %I = $1',
    vote_table_name,
    vote_item_column
  )
  using p_item_id;

  execute format(
    'delete from public.%I where id = $1 and user_id = $2',
    p_table_name
  )
  using p_item_id, auth.uid();
end;
$$;

revoke all on function public.delete_owned_thread_item(text, uuid) from public;
revoke all on function public.delete_owned_thread_item(text, uuid) from anon;
grant execute on function public.delete_owned_thread_item(text, uuid) to authenticated;
grant execute on function public.delete_owned_thread_item(text, uuid) to service_role;
