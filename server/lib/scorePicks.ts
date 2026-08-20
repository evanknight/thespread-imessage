// Idempotent scoring engine, shared by /api/cron/score-picks and /api/cron/ingest-scores.
//
// For every pick whose game is FINAL or CANCELLED and which has no pick_results row:
//   - official spread = the picked team's side of the LAST good snapshot taken at or
//     before kickoff ("good" = spread present; a pulled line falls back to the most
//     recent earlier snapshot automatically, and snapshot_id records which one won)
//   - no snapshot at all -> outcome VOID, flagged for manual entry, never guessed
//   - CANCELLED game -> outcome NP, 0 points, record untouched
//   - tie (winner_team_id null) -> outcome L, 0 points
// Existing rows are never rewritten (ON CONFLICT DO NOTHING), so re-runs are no-ops.
import type { Db } from './db';
import { scorePick } from './scoring';

export interface ScoreRunResult {
  scored: number;
  voided: { pick_id: string; game: string }[];
}

export async function runScorePicks(db: Db, nowIso: string | null): Promise<ScoreRunResult> {
  const pending = await db.query<any>(
    `select pk.id as pick_id, pk.team_id, pk.game_id,
            g.kickoff_at, g.status, g.winner_team_id,
            ht.canonical_abbr as home_abbr, at2.canonical_abbr as away_abbr,
            w.playoff_bonus, w.lock_at
     from picks pk
     join games g   on g.id = pk.game_id
     join weeks w   on w.id = pk.week_id
     join teams ht  on ht.id = g.home_team_id
     join teams at2 on at2.id = g.away_team_id
     left join pick_results pr on pr.pick_id = pk.id
     where pr.pick_id is null and g.status in ('FINAL','CANCELLED')`
  );

  let scored = 0;
  const voided: ScoreRunResult['voided'] = [];

  for (const p of pending) {
    if (p.status === 'CANCELLED') {
      await db.query(
        `insert into pick_results (pick_id, outcome, base_points, bonus_points, total_points, scored_at)
         values ($1, 'NP', 0, 0, 0, coalesce($2::timestamptz, now()))
         on conflict (pick_id) do nothing`,
        [p.pick_id, nowIso]
      );
      scored++;
      continue;
    }

    const pickedHome = await db.query<{ is_home: boolean }>(
      'select (home_team_id = $2) as is_home from games where id = $1',
      [p.game_id, p.team_id]
    );
    const isHome = pickedHome[0].is_home;

    // Rule B: the official number is the last good line before THIS game's kickoff.
    const snap = await db.query<any>(
      `select id, home_spread, away_spread from odds_snapshots
       where game_id = $1 and captured_at <= $2::timestamptz and home_spread is not null
       order by captured_at desc limit 1`,
      [p.game_id, p.kickoff_at]
    );

    // Line-at-lock, for the "you weren't cheated" display. Nullable.
    const lockSnap = p.lock_at
      ? await db.query<any>(
          `select home_spread, away_spread from odds_snapshots
           where game_id = $1 and captured_at <= $2::timestamptz and home_spread is not null
           order by captured_at desc limit 1`,
          [p.game_id, p.lock_at]
        )
      : [];
    const lockSpread = lockSnap[0] ? Number(isHome ? lockSnap[0].home_spread : lockSnap[0].away_spread) : null;

    if (!snap[0]) {
      await db.query(
        `insert into pick_results (pick_id, outcome, base_points, bonus_points, total_points,
                                   lock_time_spread, scored_at, manual_override_note)
         values ($1, 'VOID', 0, 0, 0, $2, coalesce($3::timestamptz, now()),
                 'AUTO: no odds snapshot available — needs manual spread via /api/admin/override')
         on conflict (pick_id) do nothing`,
        [p.pick_id, lockSpread, nowIso]
      );
      voided.push({ pick_id: p.pick_id, game: `${p.away_abbr} @ ${p.home_abbr}` });
      continue;
    }

    const signedSpread = Number(isHome ? snap[0].home_spread : snap[0].away_spread);
    const result = scorePick({
      pickedTeamWon: p.winner_team_id !== null && p.winner_team_id === p.team_id,
      signedSpread,
      playoffBonus: Number(p.playoff_bonus),
    });

    await db.query(
      `insert into pick_results (pick_id, official_spread, snapshot_id, lock_time_spread,
                                 base_points, bonus_points, total_points, outcome, scored_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9::timestamptz, now()))
       on conflict (pick_id) do nothing`,
      [p.pick_id, signedSpread, snap[0].id, lockSpread,
       result.base_points, result.bonus_points, result.total_points, result.outcome, nowIso]
    );
    scored++;
  }

  return { scored, voided };
}
