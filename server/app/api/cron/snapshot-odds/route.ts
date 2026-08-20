import { getDb } from '@/lib/db';
import { checkCronSecret } from '@/lib/auth';
import { requestNow } from '@/lib/now';
import { json, err } from '@/lib/http';
import { fetchDraftKingsSpreads, snapshotEvents } from '@/lib/odds';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Every 5 minutes, but gated: the paid API is only called when
//  (a) a game kicks off within ~10 min and has no snapshot in its final window
//      (Rule B: that snapshot IS the official number), or
//  (b) a week's lock_at is within ~10 min and the at-lock line isn't captured yet.
// NFL kickoffs cluster into ~6 slots/week, so this is ~8 real calls a week.
export async function POST(req: Request) {
  if (!checkCronSecret(req)) return err(401, 'unauthorized');
  const db = getDb();
  const nowIso = requestNow(req);

  const dueGames = await db.query<{ id: string }>(
    `select g.id from games g
     where g.status = 'SCHEDULED'
       and g.kickoff_at >  coalesce($1::timestamptz, now()) - interval '2 minutes'
       and g.kickoff_at <= coalesce($1::timestamptz, now()) + interval '10 minutes'
       and not exists (
         select 1 from odds_snapshots os
         where os.game_id = g.id
           and os.captured_at >= g.kickoff_at - interval '15 minutes'
       )`,
    [nowIso]
  );
  const dueLocks = await db.query<{ id: string }>(
    `select w.id from weeks w
     where w.lock_at is not null
       and w.locked_line_captured_at is null
       and w.lock_at >  coalesce($1::timestamptz, now()) - interval '2 minutes'
       and w.lock_at <= coalesce($1::timestamptz, now()) + interval '10 minutes'`,
    [nowIso]
  );

  if (dueGames.length === 0 && dueLocks.length === 0) {
    return json({ skipped: true, reason: 'no games or locks in window' });
  }

  const events = await fetchDraftKingsSpreads();          // ONE call, all games
  const result = await snapshotEvents(db, events, nowIso);

  for (const w of dueLocks) {
    await db.query(
      'update weeks set locked_line_captured_at = coalesce($2::timestamptz, now()) where id = $1',
      [w.id, nowIso]
    );
  }
  return json({ ok: true, inserted: result.inserted, unmatched: result.unmatched, due_games: dueGames.length, due_locks: dueLocks.length });
}
