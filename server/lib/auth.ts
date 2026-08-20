import { createHash, randomBytes } from 'crypto';
import type { Db } from './db';

export function sha256hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function newToken(): string {
  return randomBytes(32).toString('hex');
}

export interface Player {
  id: string;
  display_name: string;
}

// Bearer-token auth. Tokens are 32 random bytes hex, stored as sha256 hashes.
export async function authPlayer(req: Request, db: Db): Promise<Player | null> {
  const h = req.headers.get('authorization') ?? '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const rows = await db.query<Player>(
    'select id, display_name from players where token_hash = $1',
    [sha256hex(m[1].trim())]
  );
  return rows[0] ?? null;
}

export function checkCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const h = req.headers.get('authorization') ?? '';
  return h === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret;
}

export function checkAdminSecret(req: Request): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  return req.headers.get('x-admin-secret') === secret;
}
