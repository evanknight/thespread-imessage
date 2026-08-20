import { getDb } from '@/lib/db';
import { sha256hex, newToken } from '@/lib/auth';
import { json, err } from '@/lib/http';

// Exchange an enrollment code for a bearer token. The code is reusable and
// ROTATES the token (old token dies) — this doubles as the re-enroll path for
// when a phone is wiped or the Messages drawer loses its mind.
export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return err(400, 'invalid JSON'); }
  const code = String(body?.code ?? '').trim();
  if (!code) return err(400, 'code required');

  const db = getDb();
  const token = newToken();
  const rows = await db.query<{ id: string; display_name: string }>(
    `update players set token_hash = $2
     where enrollment_code_hash = $1
     returning id, display_name`,
    [sha256hex(code), sha256hex(token)]
  );
  if (!rows[0]) return err(404, 'unknown enrollment code');
  return json({ player_id: rows[0].id, display_name: rows[0].display_name, token });
}
