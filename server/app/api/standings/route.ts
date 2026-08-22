import { getDb } from '@/lib/db';
import { authPlayer } from '@/lib/auth';
import { json, err, num } from '@/lib/http';
import { requestNow } from '@/lib/now';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const db = getDb();
  const player = await authPlayer(req, db);
  if (!player) return err(401, 'unauthorized');

  const url = new URL(req.url);
  const yearParam = url.searchParams.get('year');
  const season = await db.query<{ id: string; year: number }>(
    yearParam
      ? 'select id, year from seasons where year = $1'
      : 'select id, year from seasons order by year desc limit 1',
    yearParam ? [Number(yearParam)] : []
  );
  if (!season[0]) return err(404, 'no season found');

  const standings = await db.query<any>(
    `select player_id, display_name, total_points, wins, losses, picks_made, streak
     from season_standings where season_id = $1
     order by total_points desc, wins desc, display_name`,
    [season[0].id]
  );
  // Secrecy note: rows only for already-locked weeks — a not-yet-locked pick
  // must not leak through the season breakdown.
  const weekly = await db.query<any>(
    `select week_id, week_number, round, player_id, display_name, pick_id, picked_team,
            official_spread, lock_time_spread, total_points, outcome,
            home_abbr, away_abbr, home_score, away_score, game_status
     from weekly_results
     where season_id = $1
       and (lock_at is not null and coalesce($2::timestamptz, now()) >= lock_at)
     order by week_number desc, display_name`,
    [season[0].id, requestNow(req)]
  );
  return json({
    season: season[0].year,
    standings: standings.map((s) => ({ ...s, total_points: num(s.total_points), wins: Number(s.wins), losses: Number(s.losses), picks_made: Number(s.picks_made), streak: s.streak || null })),
    weeks: weekly.map((w) => ({ ...w, official_spread: num(w.official_spread), lock_time_spread: num(w.lock_time_spread), total_points: num(w.total_points) })),
  });
}
