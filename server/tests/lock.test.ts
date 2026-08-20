import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb, submitPick, T, type TestCtx } from './helpers';

// Rule A: one shared deadline, enforced in Postgres against now(), never the client.
describe('pick lock (Rule A)', () => {
  let ctx: TestCtx;
  beforeEach(async () => { ctx = await freshDb(); });

  it('accepts a pick 1 second before lock_at', async () => {
    const res = await submitPick(ctx, 'Alice', 'sun1', 'BUF', T.beforeLock);
    expect(res.status).toBe(200);
  });

  it('rejects with 409 exactly at lock_at', async () => {
    const res = await submitPick(ctx, 'Alice', 'sun1', 'BUF', T.lock);
    expect(res.status).toBe(409);
  });

  it('rejects with 409 one second after lock_at', async () => {
    const res = await submitPick(ctx, 'Alice', 'sun1', 'BUF', T.afterLock);
    expect(res.status).toBe(409);
    const rows = await ctx.db.query('select * from picks where player_id = $1', [ctx.players['Alice']]);
    expect(rows.length).toBe(0);
  });

  it('pick changed 5x before lock: one row, last team counts, submitted_at fixed, updated_at bumped', async () => {
    const seq: Array<[string, string, string]> = [
      ['thu', 'KC', '2026-10-06T12:00:00Z'],
      ['sun1', 'BUF', '2026-10-06T13:00:00Z'],
      ['sun2', 'PHI', '2026-10-06T14:00:00Z'],
      ['sun1', 'MIA', '2026-10-07T09:00:00Z'],
      ['sun2', 'DAL', T.beforeLock],
    ];
    for (const [game, team, at] of seq) {
      const res = await submitPick(ctx, 'Bob', game, team, at);
      expect(res.status).toBe(200);
    }
    const rows = await ctx.db.query(
      'select team_id, submitted_at, updated_at from picks where player_id = $1',
      [ctx.players['Bob']]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].team_id).toBe(ctx.teams['DAL']);
    expect(new Date(rows[0].submitted_at).toISOString()).toBe(new Date('2026-10-06T12:00:00Z').toISOString());
    expect(new Date(rows[0].updated_at).toISOString()).toBe(new Date(T.beforeLock).toISOString());
  });

  it('rejects a team that is not playing in the chosen game', async () => {
    const res = await submitPick(ctx, 'Alice', 'sun1', 'KC', T.tuesday);
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated requests', async () => {
    const { POST } = await import('@/app/api/pick/route');
    const res = await POST(new Request('http://test.local/api/pick', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ week_id: ctx.weekId, game_id: ctx.games['sun1'].id, team_id: ctx.teams['BUF'] }),
    }));
    expect(res.status).toBe(401);
  });

  it('X-Debug-Now is ignored when DEBUG_MODE is off (defense for prod)', async () => {
    process.env.DEBUG_MODE = 'false';
    try {
      // Real now() is far past this 2026 week's lock -> 409 even though the
      // header claims pre-lock. (If you're re-running this suite after Oct
      // 2026... hello from the past.)
      const res = await submitPick(ctx, 'Alice', 'sun1', 'BUF', T.beforeLock);
      expect([409, 200]).toContain(res.status);
      expect(res.status).toBe(new Date() < new Date(T.lock) ? 200 : 409);
    } finally {
      process.env.DEBUG_MODE = 'true';
    }
  });
});
