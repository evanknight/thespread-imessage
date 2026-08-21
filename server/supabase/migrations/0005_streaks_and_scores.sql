-- Current W/L streak per player ("W3", "L2"). Only W and L count; NP/VOID
-- weeks are invisible to the streak, same as the record.
create or replace view player_streaks as
with r as (
  select w.season_id, pk.player_id, pr.outcome,
         row_number() over (partition by w.season_id, pk.player_id order by w.week_number desc) as rn
  from picks pk
  join weeks w on w.id = pk.week_id
  join pick_results pr on pr.pick_id = pk.id
  where pr.outcome in ('W','L')
),
firsts as (
  select season_id, player_id, outcome as last_outcome from r where rn = 1
)
select f.season_id, f.player_id,
       f.last_outcome || coalesce(min(r.rn) filter (where r.outcome <> f.last_outcome) - 1, count(*))::text as streak
from firsts f
join r on r.season_id = f.season_id and r.player_id = f.player_id
group by f.season_id, f.player_id, f.last_outcome;

-- season_standings: same columns plus streak at the end.
create or replace view season_standings as
select
  s.id   as season_id,
  s.year as year,
  p.id   as player_id,
  p.display_name,
  coalesce(sum(pr.total_points), 0)::numeric(7,2) as total_points,
  count(pr.*) filter (where pr.outcome = 'W')     as wins,
  count(pr.*) filter (where pr.outcome = 'L')     as losses,
  count(pk.*)                                     as picks_made,
  coalesce(max(ps.streak), '')                    as streak
from seasons s
cross join players p
left join weeks  w  on w.season_id = s.id
left join picks  pk on pk.week_id = w.id and pk.player_id = p.id
left join pick_results pr on pr.pick_id = pk.id
left join player_streaks ps on ps.season_id = s.id and ps.player_id = p.id
group by s.id, s.year, p.id, p.display_name;

-- weekly_results: same columns plus the game context (matchup + final score).
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
  pr.manual_override_note,
  ht.canonical_abbr as home_abbr,
  at2.canonical_abbr as away_abbr,
  g.home_score,
  g.away_score,
  g.status      as game_status,
  g.kickoff_at
from weeks w
cross join players p
left join picks pk on pk.week_id = w.id and pk.player_id = p.id
left join teams t  on t.id = pk.team_id
left join pick_results pr on pr.pick_id = pk.id
left join games g  on g.id = pk.game_id
left join teams ht on ht.id = g.home_team_id
left join teams at2 on at2.id = g.away_team_id;
