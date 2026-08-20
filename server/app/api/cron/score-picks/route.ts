import { getDb } from '@/lib/db';
import { checkCronSecret } from '@/lib/auth';
import { requestNow } from '@/lib/now';
import { json, err } from '@/lib/http';
import { runScorePicks } from '@/lib/scorePicks';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Standalone scoring pass. Idempotent — run it as often as you like.
export async function POST(req: Request) {
  if (!checkCronSecret(req)) return err(401, 'unauthorized');
  const db = getDb();
  const result = await runScorePicks(db, requestNow(req));
  return json({ ok: true, ...result });
}
