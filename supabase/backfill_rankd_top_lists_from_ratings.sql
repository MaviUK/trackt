-- Backfill automatic Rank'd Top 10 source rows from existing BURGR ratings.
-- Run this once in Supabase SQL Editor.
-- It only creates an initial ladder for users who do NOT already have any rows
-- in public.user_show_rankings, so it will not overwrite existing Rank'd ladders.

with users_without_rankings as (
  select distinct br.user_id
  from public.burgr_ratings br
  where not exists (
    select 1
    from public.user_show_rankings usr
    where usr.user_id = br.user_id
  )
), ordered_ratings as (
  select
    br.user_id,
    br.show_id,
    row_number() over (
      partition by br.user_id
      order by br.rating desc, br.updated_at desc nulls last, br.created_at desc nulls last, br.show_id
    ) as ladder_position
  from public.burgr_ratings br
  join users_without_rankings uwr on uwr.user_id = br.user_id
)
insert into public.user_show_rankings (
  user_id,
  show_id,
  ladder_position,
  wins,
  losses,
  comparisons,
  updated_at
)
select
  user_id,
  show_id,
  ladder_position,
  0 as wins,
  0 as losses,
  0 as comparisons,
  now() as updated_at
from ordered_ratings
on conflict (user_id, show_id) do nothing;
