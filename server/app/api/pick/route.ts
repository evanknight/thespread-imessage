import { getDb } from '@/lib/db';
import { authPlayer } from '@/lib/auth';
import { requestNow } from '@/lib/now';
import { json, err } from '@/lib/http';

// Upsert the caller's pick for a week. THE lock rule (Rule A) is enforced right
// here, atomically, against Postgres's clock: the INSERT's source row only exists
// when effective-now < lock_at, so neither the insert nor the conflict-update can
// fire after lock. No client timestamp is ever consulted.
export async function POST(req: Request) {
  const db = getDb();
  const player = await authPlayer(req, db);
  if (!player) return err(401, 'unauthorized');

  let body: any;
  try { body = await req.json(); } catch { return err(400, 'invalid JSON'); }
  const { week_id, game_id, team_id } = body ?? {};
  if (!week_id || !game_id || !team_id) return err(400, 'week_id, game_id, team_id required');

  const nowIso = requestNow(req);
  let rows;
  try {
    rows = await db.query<any>(
      `with target as (
         select g.id as game_id, g.week_id, w.lock_at
         from games g
         join weeks w on w.id = g.week_id
         where g.id = $2 and g.week_id = $1
           and g.status <> 'CANCELLED'
           and $4::uuid in (g.home_team_id, g.away_team_id)
       )
       insert into picks (player_id, week_id, game_id, team_id, submitted_at, updated_at)
       select $3, t.week_id, t.game_id, $4::uuid,
              coalesce($5::timestamptz, now()), coalesce($5::timestamptz, now())
       from target t
       where t.lock_at is not null and coalesce($5::timestamptz, now()) < t.lock_at
       on conflict (player_id, week_id) do update
         set game_id = excluded.game_id,
             team_id = excluded.team_id,
             updated_at = excluded.updated_at,
             -- only counts an actual switch, not a re-tap of the same team
             change_count = picks.change_count
               + case when picks.team_id is distinct from excluded.team_id then 1 else 0 end
       returning id, game_id, team_id, submitted_at, updated_at, change_count`,
      [week_id, game_id, player.id, team_id, nowIso]
    );
  } catch (e: any) {
    return err(400, `invalid ids: ${e.message}`);
  }

  if (!rows[0]) {
    // Zero rows: either the week is locked or the (week, game, team) triple is bogus.
    const wk = await db.query<any>(
      `select (lock_at is not null and coalesce($2::timestamptz, now()) >= lock_at) as locked
       from weeks where id = $1`,
      [week_id, nowIso]
    );
    if (!wk[0]) return err(404, 'unknown week');
    if (wk[0].locked) return err(409, 'picks are locked for this week');
    return err(400, 'game/team not valid for this week');
  }

  // Everything the extension needs to redraw the shared bubble in one round trip.
  const meta = await db.query<any>(
    `select w.week_number, w.lock_at,
            (select count(*) from picks pk where pk.week_id = w.id)::int as submitted_count,
            (select count(*) from players)::int as player_count
     from weeks w where w.id = $1`,
    [week_id]
  );
  return json({
    pick: rows[0],
    week_number: meta[0].week_number,
    lock_at: meta[0].lock_at,
    submitted_count: meta[0].submitted_count,
    player_count: meta[0].player_count,
  });
}

// Remove this week's pick entirely. Same lock rule as POST: the delete only
// matches while effective-now is before lock_at, so it cannot fire afterwards.
//
// A removed pick is simply an absent row, which is exactly how "no pick" is
// modelled everywhere else: 0 points for the week, W/L record untouched.
export async function DELETE(req: Request) {
  const db = getDb();
  const player = await authPlayer(req, db);
  if (!player) return err(401, 'unauthorized');

  let body: any = {};
  try { body = await req.json(); } catch { /* week_id may come from the query */ }
  const weekId = body?.week_id ?? new URL(req.url).searchParams.get('week_id');
  if (!weekId) return err(400, 'week_id required');

  const nowIso = requestNow(req);
  const rows = await db.query<{ id: string }>(
    `delete from picks pk
     using weeks w
     where pk.week_id = $1 and pk.player_id = $2
       and w.id = pk.week_id
       and w.lock_at is not null and coalesce($3::timestamptz, now()) < w.lock_at
     returning pk.id`,
    [weekId, player.id, nowIso]
  );

  if (!rows[0]) {
    const wk = await db.query<any>(
      `select (lock_at is not null and coalesce($2::timestamptz, now()) >= lock_at) as locked
       from weeks where id = $1`,
      [weekId, nowIso]
    );
    if (!wk[0]) return err(404, 'unknown week');
    if (wk[0].locked) return err(409, 'picks are locked for this week');
    return err(404, 'no pick to remove');
  }

  const meta = await db.query<any>(
    `select w.week_number, w.lock_at,
            (select count(*) from picks pk where pk.week_id = w.id)::int as submitted_count,
            (select count(*) from players)::int as player_count
     from weeks w where w.id = $1`,
    [weekId]
  );
  return json({
    removed: true,
    week_number: meta[0].week_number,
    lock_at: meta[0].lock_at,
    submitted_count: meta[0].submitted_count,
    player_count: meta[0].player_count,
  });
}
