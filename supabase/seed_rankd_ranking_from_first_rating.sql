-- Optional automatic seed for Rank'd ladders.
-- Run this in Supabase SQL Editor after backfill_rankd_top_lists_from_ratings.sql.
-- When a user adds their first BURGR rating and has no Rank'd ladder yet,
-- this creates an initial user_show_rankings row. Once the user votes in Rank'd,
-- Rank'd will continue maintaining the full ladder normally.

create or replace function public.seed_rankd_ranking_from_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.user_show_rankings usr
    where usr.user_id = new.user_id
  ) then
    return new;
  end if;

  insert into public.user_show_rankings (
    user_id,
    show_id,
    ladder_position,
    wins,
    losses,
    comparisons,
    updated_at
  ) values (
    new.user_id,
    new.show_id,
    1,
    0,
    0,
    0,
    now()
  )
  on conflict (user_id, show_id) do nothing;

  return new;
end;
$$;

drop trigger if exists burgr_ratings_seed_rankd_insert on public.burgr_ratings;
create trigger burgr_ratings_seed_rankd_insert
after insert on public.burgr_ratings
for each row execute function public.seed_rankd_ranking_from_rating();
