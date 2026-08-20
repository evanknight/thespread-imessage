import { getDb } from '@/lib/db';
import { authPlayer } from '@/lib/auth';
import { json, err, num } from '@/lib/http';

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
    `select player_id, display_name, total_points, wins, losses, picks_made
     from season_standings where season_id = $1
     order by total_points desc, wins desc, display_name`,
    [season[0].id]
  );
  const weekly = await db.query<any>(
    `select week_id, week_number, round, player_id, display_name, picked_team,
            official_spread, lock_time_spread, total_points, outcome
     from weekly_results
     where season_id = $1 and pick_id is not null
     order by week_number, display_name`,
    [season[0].id]
  );
  return json({
    season: season[0].year,
    standings: standings.map((s) => ({ ...s, total_points: num(s.total_points), wins: Number(s.wins), losses: Number(s.losses), picks_made: Number(s.picks_made) })),
    weeks: weekly.map((w) => ({ ...w, official_spread: num(w.official_spread), lock_time_spread: num(w.lock_time_spread), total_points: num(w.total_points) })),
  });
}
