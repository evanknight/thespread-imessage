import { getDb } from '@/lib/db';
import { authPlayer } from '@/lib/auth';
import { requestNow } from '@/lib/now';
import { json, err, num } from '@/lib/http';

export const dynamic = 'force-dynamic';

// Full audit trail for one pick — powers the detail sheet.
//
// SECRECY: before lock you may only read your OWN pick; after lock anyone's.
// Enforced in the query (not in JS) so this can't become a backdoor around the
// hidden-picks rule.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const db = getDb();
  const player = await authPlayer(req, db);
  if (!player) return err(401, 'unauthorized');

  const { id } = await ctx.params;
  const nowIso = requestNow(req);

  const rows = await db.query<any>(
    `select pk.id, pk.player_id, pk.submitted_at, pk.updated_at, pk.change_count,
            pl.display_name,
            t.canonical_abbr as team_abbr, t.full_name as team_name, t.id as team_id,
            w.week_number, w.round, w.lock_at, w.playoff_bonus,
            (w.lock_at is not null and coalesce($3::timestamptz, now()) >= w.lock_at) as locked,
            g.id as game_id, g.kickoff_at, g.status, g.home_score, g.away_score,
            g.winner_team_id, (g.home_team_id = pk.team_id) as picked_is_home,
            ht.canonical_abbr as home_abbr, ht.full_name as home_name,
            at2.canonical_abbr as away_abbr, at2.full_name as away_name,
            wt.canonical_abbr as winner_abbr,
            pr.official_spread, pr.snapshot_id, pr.lock_time_spread, pr.lock_snapshot_id,
            pr.open_spread, pr.open_snapshot_id, pr.base_points, pr.bonus_points,
            pr.total_points, pr.outcome, pr.scored_at, pr.manual_override_note
     from picks pk
     join players pl on pl.id = pk.player_id
     join teams t    on t.id  = pk.team_id
     join weeks w    on w.id  = pk.week_id
     join games g    on g.id  = pk.game_id
     join teams ht   on ht.id = g.home_team_id
     join teams at2  on at2.id = g.away_team_id
     left join teams wt on wt.id = g.winner_team_id
     left join pick_results pr on pr.pick_id = pk.id
     where pk.id = $1
       and (pk.player_id = $2
            or (w.lock_at is not null and coalesce($3::timestamptz, now()) >= w.lock_at))`,
    [id, player.id, nowIso]
  );
  const r = rows[0];
  if (!r) return err(404, 'pick not found or not yet visible');

  const isHome = r.picked_is_home;
  const side = (row: any) => num(isHome ? row.home_spread : row.away_spread);

  // The whole captured series, from the picked team's perspective.
  const snaps = await db.query<any>(
    `select id, captured_at, home_spread, away_spread from odds_snapshots
     where game_id = $1 and home_spread is not null
     order by captured_at asc`,
    [r.game_id]
  );
  const series = snaps.map((s) => ({ snapshot_id: s.id, captured_at: s.captured_at, spread: side(s) }));

  const atOrBefore = (iso: string | null) => {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    const found = [...series].reverse().find((p) => new Date(p.captured_at).getTime() <= t);
    return found ?? null;
  };

  // Prefer the permanent stored values; fall back to the live series for picks
  // that haven't been scored yet.
  const open = r.open_spread != null
    ? { spread: num(r.open_spread), captured_at: series[0]?.captured_at ?? null, snapshot_id: r.open_snapshot_id }
    : series[0] ?? null;
  const atLock = r.lock_time_spread != null
    ? { spread: num(r.lock_time_spread), captured_at: atOrBefore(r.lock_at)?.captured_at ?? null, snapshot_id: r.lock_snapshot_id }
    : atOrBefore(r.lock_at);
  const official = r.official_spread != null
    ? { spread: num(r.official_spread), captured_at: atOrBefore(r.kickoff_at)?.captured_at ?? null, snapshot_id: r.snapshot_id }
    : null;
  const current = series.length ? series[series.length - 1] : null;

  const effective = official?.spread ?? current?.spread ?? null;
  const bonus = Number(r.playoff_bonus) || 0;

  return json({
    pick: {
      id: r.id,
      player_id: r.player_id,
      display_name: r.display_name,
      team_id: r.team_id,
      team_abbr: r.team_abbr,
      team_name: r.team_name,
      submitted_at: r.submitted_at,
      updated_at: r.updated_at,
      change_count: r.change_count ?? 0,
      is_mine: r.player_id === player.id,
    },
    week: {
      week_number: r.week_number,
      round: r.round,
      lock_at: r.lock_at,
      locked: r.locked,
      playoff_bonus: bonus,
    },
    game: {
      id: r.game_id,
      kickoff_at: r.kickoff_at,
      status: r.status,
      home_abbr: r.home_abbr, home_name: r.home_name, home_score: r.home_score,
      away_abbr: r.away_abbr, away_name: r.away_name, away_score: r.away_score,
      winner_abbr: r.winner_abbr,
      picked_is_home: isHome,
    },
    line: {
      open,
      at_lock: atLock,
      official,
      current,
      // Line movement IS payout movement, 1:1 — points, not percent.
      delta_lock_to_kickoff:
        atLock?.spread != null && official?.spread != null
          ? Number((official.spread - atLock.spread).toFixed(2))
          : null,
      delta_open_to_now:
        open?.spread != null && (official?.spread ?? current?.spread) != null
          ? Number(((official?.spread ?? current!.spread!) - open.spread!).toFixed(2))
          : null,
      series,
      sample_count: series.length,
    },
    result: r.outcome
      ? {
          outcome: r.outcome,
          base_points: num(r.base_points),
          bonus_points: num(r.bonus_points),
          total_points: num(r.total_points),
          scored_at: r.scored_at,
          note: r.manual_override_note,
        }
      : null,
    potential_points: effective != null ? Number((10 + effective + bonus).toFixed(2)) : null,
  });
}
