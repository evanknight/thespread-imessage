import { getDb } from '@/lib/db';
import { checkAdminSecret } from '@/lib/auth';
import { requestNow } from '@/lib/now';
import { json, err } from '@/lib/http';
import { scorePick } from '@/lib/scoring';
import { runScorePicks } from '@/lib/scorePicks';

// The unstick-a-bad-row hatch. Two shapes:
//   {kind:'game', game_id, home_score, away_score, status?, note}
//     -> set a game result by hand, wipe that game's NON-manual pick_results, rescore
//   {kind:'pick', pick_id, official_spread?, outcome?, note}
//     -> overwrite one pick's result; points recomputed from spread+outcome
// note is mandatory. Future-you will want to know why the row was touched.
export async function POST(req: Request) {
  if (!checkAdminSecret(req)) return err(401, 'unauthorized');
  const db = getDb();
  let body: any;
  try { body = await req.json(); } catch { return err(400, 'invalid JSON'); }
  const note = String(body?.note ?? '').trim();
  if (!note) return err(400, 'note is required — say why you are overriding');
  const nowIso = requestNow(req);

  if (body.kind === 'game') {
    const { game_id, home_score, away_score } = body;
    const status = body.status ?? 'FINAL';
    if (!game_id || home_score == null || away_score == null) {
      return err(400, 'game_id, home_score, away_score required');
    }
    const rows = await db.query<any>(
      `update games set home_score = $2, away_score = $3, status = $4,
              winner_team_id = case when $2 > $3 then home_team_id
                                    when $3 > $2 then away_team_id
                                    else null end,
              completed_at = coalesce($5::timestamptz, now())
       where id = $1 returning id`,
      [game_id, home_score, away_score, status, nowIso]
    );
    if (!rows[0]) return err(404, 'unknown game');
    await db.query(
      `delete from pick_results pr using picks pk
       where pr.pick_id = pk.id and pk.game_id = $1 and pr.manual_override_note is null`,
      [game_id]
    );
    const rescored = await runScorePicks(db, nowIso);
    await db.query(
      `update pick_results pr set manual_override_note = $2
       from picks pk where pr.pick_id = pk.id and pk.game_id = $1`,
      [game_id, `ADMIN game override: ${note}`]
    );
    return json({ ok: true, rescored });
  }

  if (body.kind === 'pick') {
    const { pick_id, official_spread, outcome } = body;
    if (!pick_id) return err(400, 'pick_id required');
    const info = await db.query<any>(
      `select pk.id, pk.team_id, g.winner_team_id, w.playoff_bonus
       from picks pk join games g on g.id = pk.game_id join weeks w on w.id = pk.week_id
       where pk.id = $1`,
      [pick_id]
    );
    if (!info[0]) return err(404, 'unknown pick');

    let out = outcome as string | undefined;
    if (!out) out = info[0].winner_team_id === info[0].team_id ? 'W' : 'L';
    let base = 0, bonus = 0, total = 0;
    if (out === 'W') {
      if (official_spread == null) return err(400, 'official_spread required for a W override');
      const r = scorePick({ pickedTeamWon: true, signedSpread: Number(official_spread), playoffBonus: Number(info[0].playoff_bonus) });
      base = r.base_points; bonus = r.bonus_points; total = r.total_points;
    }
    await db.query(
      `insert into pick_results (pick_id, official_spread, base_points, bonus_points, total_points,
                                 outcome, scored_at, manual_override_note)
       values ($1, $2, $3, $4, $5, $6, coalesce($7::timestamptz, now()), $8)
       on conflict (pick_id) do update
         set official_spread = excluded.official_spread,
             base_points = excluded.base_points, bonus_points = excluded.bonus_points,
             total_points = excluded.total_points, outcome = excluded.outcome,
             scored_at = excluded.scored_at, manual_override_note = excluded.manual_override_note`,
      [pick_id, official_spread ?? null, base, bonus, total, out, nowIso, `ADMIN: ${note}`]
    );
    return json({ ok: true, outcome: out, total_points: total });
  }

  return err(400, "kind must be 'game' or 'pick'");
}
