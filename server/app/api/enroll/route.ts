import { getDb } from '@/lib/db';
import { sha256hex, newToken } from '@/lib/auth';
import { json, err } from '@/lib/http';

// Exchange an enrollment code for a bearer token. The code is reusable: each
// use MINTS AN ADDITIONAL token (web + phone coexist) and the newest 5 per
// player stay valid — that's also the re-enroll path for a wiped phone.
export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return err(400, 'invalid JSON'); }
  const code = String(body?.code ?? '').trim();
  if (!code) return err(400, 'code required');

  const db = getDb();
  const token = newToken();
  const rows = await db.query<{ id: string; display_name: string }>(
    'select id, display_name from players where enrollment_code_hash = $1',
    [sha256hex(code)]
  );
  if (!rows[0]) return err(404, 'unknown enrollment code');
  await db.query('insert into player_tokens (player_id, token_hash) values ($1, $2)', [
    rows[0].id, sha256hex(token),
  ]);
  await db.query(
    `delete from player_tokens where player_id = $1 and id not in (
       select id from player_tokens where player_id = $1 order by created_at desc limit 5
     )`,
    [rows[0].id]
  );
  return json({ player_id: rows[0].id, display_name: rows[0].display_name, token });
}
