import { getDb } from '@/lib/db';
import { authPlayer } from '@/lib/auth';
import { requestNow } from '@/lib/now';
import { json, err } from '@/lib/http';
import { currentWeekId, buildWeekPayload, maybeRefreshOdds, weekWithLockState } from '@/lib/weeks';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const db = getDb();
  const player = await authPlayer(req, db);
  if (!player) return err(401, 'unauthorized');

  const nowIso = requestNow(req);
  const weekId = await currentWeekId(db);
  if (!weekId) return err(404, 'no weeks synced yet, run sync-schedule');

  const wk = await weekWithLockState(db, weekId, nowIso);
  if (wk && !wk.locked) await maybeRefreshOdds(db, weekId, nowIso);

  const payload = await buildWeekPayload(db, weekId, player.id, nowIso);
  return json(payload);
}
