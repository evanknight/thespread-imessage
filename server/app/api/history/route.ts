import { getDb } from '@/lib/db';
import { authPlayer } from '@/lib/auth';
import { requestNow } from '@/lib/now';
import { json, err, num } from '@/lib/http';

export const dynamic = 'force-dynamic';

// Full pick/spread/result history for one player (defaults to the caller).
// League of 5 friends: everyone can see everyone's history — after those weeks locked.
export async function GET(req: Request) {
  const db = getDb();
  const player = await authPlayer(req, db);
  if (!player) return err(401, 'unauthorized');

  const url = new URL(req.url);
  const target = url.searchParams.get('player_id') ?? player.id;

  // Note the lock guard: history never leaks a not-yet-locked pick, even your own
  // via someone else's token.
  const rows = await db.query<any>(
    `select wr.week_number, wr.round, wr.picked_team, wr.submitted_at, wr.updated_at,
            wr.official_spread, wr.lock_time_spread, wr.base_points, wr.bonus_points,
            wr.total_points, wr.outcome, wr.manual_override_note,
            g.kickoff_at, g.status, g.home_score, g.away_score,
            ht.canonical_abbr as home_abbr, at2.canonical_abbr as away_abbr
     from weekly_results wr
     join games g   on g.id = wr.game_id
     join teams ht  on ht.id = g.home_team_id
     join teams at2 on at2.id = g.away_team_id
     where wr.player_id = $1 and wr.pick_id is not null
       and (wr.player_id = $2 or (wr.lock_at is not null and coalesce($3::timestamptz, now()) >= wr.lock_at))
     order by wr.week_number`,
    [target, player.id, requestNow(req)]
  );
  return json({
    player_id: target,
    picks: rows.map((r) => ({
      ...r,
      official_spread: num(r.official_spread),
      lock_time_spread: num(r.lock_time_spread),
      base_points: num(r.base_points),
      bonus_points: num(r.bonus_points),
      total_points: num(r.total_points),
    })),
  });
}
