-- BURGRS account deletion cleanup
-- Run this file once in Supabase SQL Editor after deployment.
-- Uploaded files are removed by the Netlify function through the Storage API.
-- The function is callable only by the service role used by the Netlify function.

create or replace function public.delete_account_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target record;
begin
  if p_user_id is null then
    raise exception 'A user id is required.';
  end if;

  -- Remove votes and other child rows first.
  for target in
    select * from (values
      ('show_review_votes', 'user_id'),
      ('episode_review_votes', 'user_id'),
      ('show_chat_message_votes', 'user_id'),
      ('creator_post_comment_votes', 'user_id'),
      ('creator_list_comment_votes', 'user_id'),
      ('rankd_matchup_votes', 'user_id'),
      ('rankd_votes', 'user_id')
    ) as rows_to_delete(table_name, column_name)
  loop
    begin
      execute format(
        'delete from public.%I where %I = $1',
        target.table_name,
        target.column_name
      ) using p_user_id;
    exception
      when undefined_table or undefined_column then null;
    end;
  end loop;

  -- Detach replies made by other users from content that is about to be removed.
  begin
    update public.show_reviews
    set parent_id = null
    where parent_id in (
      select id from public.show_reviews where user_id = p_user_id
    );
  exception
    when undefined_table or undefined_column then null;
  end;

  begin
    update public.episode_reviews
    set parent_id = null
    where parent_id in (
      select id from public.episode_reviews where user_id = p_user_id
    );
  exception
    when undefined_table or undefined_column then null;
  end;

  begin
    update public.show_chat_messages
    set parent_id = null
    where parent_id in (
      select id from public.show_chat_messages where user_id = p_user_id
    );
  exception
    when undefined_table or undefined_column then null;
  end;

  begin
    update public.creator_post_comments
    set parent_comment_id = null
    where parent_comment_id in (
      select id from public.creator_post_comments where user_id = p_user_id
    );
  exception
    when undefined_table or undefined_column then null;
  end;

  -- Delete votes attached to content owned by this account.
  begin
    delete from public.show_review_votes
    where review_id in (
      select id from public.show_reviews where user_id = p_user_id
    );
  exception
    when undefined_table or undefined_column then null;
  end;

  begin
    delete from public.episode_review_votes
    where review_id in (
      select id from public.episode_reviews where user_id = p_user_id
    );
  exception
    when undefined_table or undefined_column then null;
  end;

  begin
    delete from public.show_chat_message_votes
    where message_id in (
      select id from public.show_chat_messages where user_id = p_user_id
    );
  exception
    when undefined_table or undefined_column then null;
  end;

  -- Remove creator-list children before deleting the lists themselves.
  begin
    delete from public.creator_list_comments
    where list_key in (
      select id::text from public.creator_lists where user_id = p_user_id
    )
    or list_key = 'rankd-top-10-' || p_user_id::text;
  exception
    when undefined_table or undefined_column then null;
  end;

  begin
    delete from public.creator_list_items
    where list_id in (
      select id from public.creator_lists where user_id = p_user_id
    );
  exception
    when undefined_table or undefined_column then null;
  end;

  begin
    delete from public.creator_post_comments
    where post_id in (
      select id from public.creator_posts where user_id = p_user_id
    );
  exception
    when undefined_table or undefined_column then null;
  end;

  -- Remove rows directly owned by or connected to the account.
  for target in
    select * from (values
      ('notifications', 'recipient_user_id'),
      ('notifications', 'actor_user_id'),
      ('issue_reports', 'user_id'),
      ('creator_post_comments', 'user_id'),
      ('creator_list_comments', 'user_id'),
      ('show_chat_messages', 'user_id'),
      ('show_reviews', 'user_id'),
      ('episode_reviews', 'user_id'),
      ('creator_posts', 'user_id'),
      ('creator_lists', 'user_id'),
      ('creator_subscriptions', 'subscriber_id'),
      ('creator_subscriptions', 'creator_id'),
      ('creator_monetization', 'user_id'),
      ('user_follows', 'follower_id'),
      ('user_follows', 'following_id'),
      ('user_show_rankings', 'user_id'),
      ('watched_episodes', 'user_id'),
      ('episode_ratings', 'user_id'),
      ('burgr_ratings', 'user_id'),
      ('user_shows_new', 'user_id'),
      ('user_shows', 'user_id'),
      ('profiles', 'id')
    ) as rows_to_delete(table_name, column_name)
  loop
    begin
      execute format(
        'delete from public.%I where %I = $1',
        target.table_name,
        target.column_name
      ) using p_user_id;
    exception
      when undefined_table or undefined_column then null;
    end;
  end loop;

  -- Catch any other direct foreign-key references to auth.users that may have
  -- been added later. Known child tables have already been cleaned above.
  for target in
    select
      namespace.nspname as schema_name,
      relation.relname as table_name,
      attribute.attname as column_name
    from pg_constraint constraint_row
    join pg_class relation
      on relation.oid = constraint_row.conrelid
    join pg_namespace namespace
      on namespace.oid = relation.relnamespace
    join unnest(constraint_row.conkey) with ordinality as key_column(attnum, position)
      on true
    join unnest(constraint_row.confkey) with ordinality as referenced_column(attnum, position)
      on referenced_column.position = key_column.position
    join pg_attribute attribute
      on attribute.attrelid = constraint_row.conrelid
      and attribute.attnum = key_column.attnum
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = 'auth.users'::regclass
      and namespace.nspname not in ('auth', 'storage')
  loop
    begin
      execute format(
        'delete from %I.%I where %I = $1',
        target.schema_name,
        target.table_name,
        target.column_name
      ) using p_user_id;
    exception
      when foreign_key_violation then
        raise warning 'Could not automatically delete rows from %.%',
          target.schema_name,
          target.table_name;
      when undefined_table or undefined_column then null;
    end;
  end loop;
end;
$$;

revoke all on function public.delete_account_data(uuid) from public;
revoke all on function public.delete_account_data(uuid) from anon;
revoke all on function public.delete_account_data(uuid) from authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;
