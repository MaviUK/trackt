-- BURGRS banned-word filter
-- Run this file in the Supabase SQL Editor.
-- Matching is case-insensitive and whole-word only. Each match becomes ####.

create table if not exists public.banned_words (
  word text primary key,
  replacement text not null default '####',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint banned_words_word_not_blank check (btrim(word) <> ''),
  constraint banned_words_word_trimmed check (word = btrim(word)),
  constraint banned_words_word_safe_pattern check (word ~ '^[[:alnum:] ''-]+$'),
  constraint banned_words_replacement_not_blank check (replacement <> '')
);

create unique index if not exists banned_words_lower_word_idx
  on public.banned_words (lower(word));

alter table public.banned_words enable row level security;

-- The app does not need direct access to the list. The security-definer filter
-- function reads it when content is inserted or updated.
revoke all on table public.banned_words from public;
revoke all on table public.banned_words from anon;
revoke all on table public.banned_words from authenticated;
grant select, insert, update, delete on table public.banned_words to service_role;

-- Starter UK/US profanity list. Add or remove rows in public.banned_words at any time.
insert into public.banned_words (word, replacement, is_active)
values
  ('arsehole', '####', true),
  ('asshole', '####', true),
  ('bastard', '####', true),
  ('bitch', '####', true),
  ('bollocks', '####', true),
  ('bullshit', '####', true),
  ('cunt', '####', true),
  ('dick', '####', true),
  ('dickhead', '####', true),
  ('fuck', '####', true),
  ('fucked', '####', true),
  ('fucker', '####', true),
  ('fucking', '####', true),
  ('motherfucker', '####', true),
  ('piss', '####', true),
  ('pissed', '####', true),
  ('prick', '####', true),
  ('shit', '####', true),
  ('shite', '####', true),
  ('twat', '####', true),
  ('wanker', '####', true)
on conflict (word) do update
set
  replacement = excluded.replacement,
  is_active = excluded.is_active,
  updated_at = now();

create or replace function public.censor_banned_words(p_text text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  filtered_text text := p_text;
  banned record;
begin
  if filtered_text is null or filtered_text = '' then
    return filtered_text;
  end if;

  for banned in
    select word, replacement
    from public.banned_words
    where is_active = true
    order by char_length(word) desc, word asc
  loop
    -- PostgreSQL \m and \M are start/end-of-word boundaries. Words are limited
    -- by the table constraint to safe characters, avoiding regex injection.
    filtered_text := regexp_replace(
      filtered_text,
      E'\\m' || banned.word || E'\\M',
      banned.replacement,
      'gi'
    );
  end loop;

  return filtered_text;
end;
$$;

revoke all on function public.censor_banned_words(text) from public;
revoke all on function public.censor_banned_words(text) from anon;
revoke all on function public.censor_banned_words(text) from authenticated;
grant execute on function public.censor_banned_words(text) to service_role;

create or replace function public.apply_banned_word_filter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  argument_index integer;
  column_name text;
  current_value text;
begin
  if tg_nargs = 0 then
    return new;
  end if;

  for argument_index in 0..tg_nargs - 1 loop
    column_name := tg_argv[argument_index];
    current_value := to_jsonb(new) ->> column_name;

    if current_value is not null then
      new := jsonb_populate_record(
        new,
        jsonb_build_object(
          column_name,
          public.censor_banned_words(current_value)
        )
      );
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.apply_banned_word_filter() from public;
revoke all on function public.apply_banned_word_filter() from anon;
revoke all on function public.apply_banned_word_filter() from authenticated;

-- Add the same filter to every current BURGRS user-content table. Missing tables
-- or columns are skipped safely, so this file can be rerun after schema changes.
do $$
declare
  target record;
  existing_columns text[];
  trigger_arguments text;
  update_assignments text;
  trigger_name text;
begin
  for target in
    select *
    from (
      values
        ('show_reviews', array['body']::text[]),
        ('episode_reviews', array['body']::text[]),
        ('show_chat_messages', array['body']::text[]),
        ('post_comments', array['body']::text[]),
        ('creator_post_comments', array['body']::text[]),
        ('creator_list_comments', array['body']::text[]),
        ('creator_posts', array['title', 'body']::text[])
    ) as targets(table_name, requested_columns)
  loop
    if to_regclass(format('public.%I', target.table_name)) is null then
      continue;
    end if;

    select array_agg(columns.column_name order by columns.ordinal_position)
    into existing_columns
    from information_schema.columns as columns
    where columns.table_schema = 'public'
      and columns.table_name = target.table_name
      and columns.column_name = any(target.requested_columns);

    if coalesce(array_length(existing_columns, 1), 0) = 0 then
      continue;
    end if;

    trigger_name := 'filter_banned_words_' || target.table_name;

    execute format(
      'drop trigger if exists %I on public.%I',
      trigger_name,
      target.table_name
    );

    select string_agg(quote_literal(column_name), ', ')
    into trigger_arguments
    from unnest(existing_columns) as column_name;

    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.apply_banned_word_filter(%s)',
      trigger_name,
      target.table_name,
      trigger_arguments
    );

    -- Filter content that already exists as well as future inserts/updates.
    select string_agg(
      format('%I = public.censor_banned_words(%I)', column_name, column_name),
      ', '
    )
    into update_assignments
    from unnest(existing_columns) as column_name;

    execute format(
      'update public.%I set %s',
      target.table_name,
      update_assignments
    );
  end loop;
end;
$$;

-- Examples for managing the list later:
-- Add a word:
-- insert into public.banned_words (word) values ('example');
-- Disable a word without deleting it:
-- update public.banned_words set is_active = false, updated_at = now() where word = 'example';
-- Remove a word:
-- delete from public.banned_words where word = 'example';
