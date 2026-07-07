-- Repair / normalise Rank'd ladder positions.
-- Run this in Supabase SQL Editor if automatic Top 10 lists do not appear
-- even though public.user_show_rankings has rows.
--
-- It assigns a real sequential ladder_position for every user_show_rankings row.
-- Existing ladder_position values are kept as the first ordering signal.
-- Rows without a ladder_position are ordered by BURGR rating, then updated_at.

with ordered_rankings as (
  select
    usr.user_id,
    usr.show_id,
    row_number() over (
      partition by usr.user_id
      order by
        usr.ladder_position asc nulls last,
        br.rating desc nulls last,
        usr.updated_at desc nulls last,
        usr.show_id
    ) as new_ladder_position
  from public.user_show_rankings usr
  left join public.burgr_ratings br
    on br.user_id = usr.user_id
   and br.show_id = usr.show_id
)
update public.user_show_rankings usr
set
  ladder_position = ordered_rankings.new_ladder_position,
  updated_at = now()
from ordered_rankings
where usr.user_id = ordered_rankings.user_id
  and usr.show_id = ordered_rankings.show_id
  and usr.ladder_position is distinct from ordered_rankings.new_ladder_position;

-- Check the users you care about after running the update.
select
  p.username,
  p.display_name,
  count(usr.show_id) as rankd_rows,
  count(usr.show_id) filter (where usr.ladder_position is not null) as positioned_rows,
  min(usr.ladder_position) as best_position,
  max(usr.ladder_position) as worst_position
from public.profiles p
left join public.user_show_rankings usr on usr.user_id = p.id
where p.username ilike '%The Bin Guy%'
   or p.display_name ilike '%The Bin Guy%'
   or p.username ilike '%Mavi%'
   or p.display_name ilike '%Mavi%'
group by p.id, p.username, p.display_name
order by p.username;
