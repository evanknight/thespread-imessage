import type { Db } from './db';
import { num } from './http';
import { fetchDraftKingsSpreads, snapshotEvents } from './odds';

// Current week = the earliest week that still has an unfinished game.
// Falls back to the latest week once the season is over.
export async function currentWeekId(db: Db): Promise<string | null> {
  const rows = await db.query<{ id: string }>(
    `select w.id from weeks w
     where exists (select 1 from games g where g.week_id = w.id
                   and g.status not in ('FINAL','CANCELLED'))
     order by w.lock_at asc nulls last limit 1`
  );
  if (rows[0]) return rows[0].id;
  const latest = await db.query<{ id: string }>(
    'select id from weeks order by lock_at desc nulls last limit 1'
  );
  return latest[0]?.id ?? null;
}

export interface WeekRow {
  id: string;
  season_id: string;
  week_number: number;
  round: string;
  lock_at: string | null;
  playoff_bonus: string;
  locked: boolean;
}

export async function weekWithLockState(db: Db, weekId: string, nowIso: string | null): Promise<WeekRow | null> {
  const rows = await db.query<WeekRow>(
    `select id, season_id, week_number, round, lock_at, playoff_bonus,
            (lock_at is not null and coalesce($2::timestamptz, now()) >= lock_at) as locked
     from weeks where id = $1`,
    [weekId, nowIso]
  );
  return rows[0] ?? null;
}

// §7 wants current DK spreads in week/current, but the gated snapshotter only fires
// near kickoff/lock. So: if the freshest snapshot for this (unlocked) week is older
// than 60 minutes, make one Odds API call and store it like any other snapshot.
// Best-effort — the board must render even when the Odds API is down.
export async function maybeRefreshOdds(db: Db, weekId: string, nowIso: string | null): Promise<void> {
  if (!process.env.ODDS_API_KEY) return;
  const stale = await db.query<{ ok: boolean }>(
    `select not exists (
       select 1 from odds_snapshots os
       join games g on g.id = os.game_id
       where g.week_id = $1
         and os.captured_at > coalesce($2::timestamptz, now()) - interval '60 minutes'
     ) as ok`,
    [weekId, nowIso]
  );
  if (!stale[0]?.ok) return;
  try {
    const events = await fetchDraftKingsSpreads();
    await snapshotEvents(db, events, nowIso);
  } catch (e) {
    console.error('on-demand odds refresh failed (non-fatal):', e);
  }
}

// Full payload for GET /api/week/current and the web board.
// SECRECY: other players' pick fields are nulled in SQL (not in JS) until lock.
export async function buildWeekPayload(db: Db, weekId: string, callerPlayerId: string | null, nowIso: string | null) {
  const week = await weekWithLockState(db, weekId, nowIso);
  if (!week) return null;

  const games = await db.query<any>(
    `select g.id, g.kickoff_at, g.status, g.home_score, g.away_score, g.winner_team_id,
            ht.id as home_id, ht.canonical_abbr as home_abbr, ht.full_name as home_name,
            at2.id as away_id, at2.canonical_abbr as away_abbr, at2.full_name as away_name,
            s.home_spread as cur_home_spread, s.away_spread as cur_away_spread,
            s.captured_at as spread_captured_at
     from games g
     join teams ht  on ht.id  = g.home_team_id
     join teams at2 on at2.id = g.away_team_id
     left join lateral (
       select home_spread, away_spread, captured_at from odds_snapshots os
       where os.game_id = g.id and os.home_spread is not null
       order by captured_at desc limit 1
     ) s on true
     where g.week_id = $1
     order by g.kickoff_at, g.id`,
    [weekId]
  );

  // Pick visibility is decided inside the query: your own pick always, everyone
  // else's only once coalesce(debug_now, now()) >= lock_at — never filtered client-side.
  const picks = await db.query<any>(
    `select pl.id as player_id, pl.display_name,
            (pk.id is not null) as has_picked,
            case when pl.id = $2 or (w.lock_at is not null and coalesce($3::timestamptz, now()) >= w.lock_at)
                 then pk.game_id end as game_id,
            case when pl.id = $2 or (w.lock_at is not null and coalesce($3::timestamptz, now()) >= w.lock_at)
                 then pk.team_id end as team_id,
            case when pl.id = $2 or (w.lock_at is not null and coalesce($3::timestamptz, now()) >= w.lock_at)
                 then t.canonical_abbr end as team_abbr,
            pk.submitted_at, pk.updated_at,
            pr.official_spread, pr.lock_time_spread, pr.base_points, pr.bonus_points,
            pr.total_points, pr.outcome
     from weeks w
     cross join players pl
     left join picks pk on pk.week_id = w.id and pk.player_id = pl.id
     left join teams t  on t.id = pk.team_id
     left join pick_results pr on pr.pick_id = pk.id
     where w.id = $1
     order by pl.display_name`,
    [weekId, callerPlayerId, nowIso]
  );

  const my = picks.find((p) => p.player_id === callerPlayerId) ?? null;
  return {
    week: {
      id: week.id,
      week_number: week.week_number,
      round: week.round,
      lock_at: week.lock_at,
      locked: week.locked,
      playoff_bonus: num(week.playoff_bonus),
    },
    games: games.map((g) => ({
      id: g.id,
      kickoff_at: g.kickoff_at,
      status: g.status,
      home: { team_id: g.home_id, abbr: g.home_abbr, name: g.home_name, score: g.home_score, spread: num(g.cur_home_spread) },
      away: { team_id: g.away_id, abbr: g.away_abbr, name: g.away_name, score: g.away_score, spread: num(g.cur_away_spread) },
      winner_team_id: g.winner_team_id,
      spread_captured_at: g.spread_captured_at,
    })),
    my_pick: my?.game_id
      ? { game_id: my.game_id, team_id: my.team_id, team_abbr: my.team_abbr, submitted_at: my.submitted_at, updated_at: my.updated_at }
      : null,
    submitted_count: picks.filter((p) => p.has_picked).length,
    player_count: picks.length,
    players: picks.map((p) => ({
      player_id: p.player_id,
      display_name: p.display_name,
      has_picked: p.has_picked,
      pick: p.game_id
        ? {
            game_id: p.game_id, team_id: p.team_id, team_abbr: p.team_abbr,
            official_spread: num(p.official_spread), lock_time_spread: num(p.lock_time_spread),
            base_points: num(p.base_points), bonus_points: num(p.bonus_points),
            total_points: num(p.total_points), outcome: p.outcome,
          }
        : null,
    })),
  };
}
