-- Standings are derived, never denormalized.
-- W/L counts only outcomes 'W' and 'L'. 'NP' (no game) and 'VOID' never touch the record,
-- and a missing pick has no rows here at all — record unchanged by construction.
create or replace view season_standings as
select
  s.id   as season_id,
  s.year as year,
  p.id   as player_id,
  p.display_name,
  coalesce(sum(pr.total_points), 0)::numeric(7,2) as total_points,
  count(pr.*) filter (where pr.outcome = 'W')     as wins,
  count(pr.*) filter (where pr.outcome = 'L')     as losses,
  count(pk.*)                                     as picks_made
from seasons s
cross join players p
left join weeks  w  on w.season_id = s.id
left join picks  pk on pk.week_id = w.id and pk.player_id = p.id
left join pick_results pr on pr.pick_id = pk.id
group by s.id, s.year, p.id, p.display_name;

create or replace view weekly_results as
select
  w.season_id,
  w.id          as week_id,
  w.week_number,
  w.round,
  w.lock_at,
  p.id          as player_id,
  p.display_name,
  pk.id         as pick_id,
  pk.game_id,
  pk.team_id,
  t.canonical_abbr as picked_team,
  pk.submitted_at,
  pk.updated_at,
  pr.official_spread,
  pr.lock_time_spread,
  pr.base_points,
  pr.bonus_points,
  pr.total_points,
  pr.outcome,
  pr.manual_override_note
from weeks w
cross join players p
left join picks pk on pk.week_id = w.id and pk.player_id = p.id
left join teams t  on t.id = pk.team_id
left join pick_results pr on pr.pick_id = pk.id;
