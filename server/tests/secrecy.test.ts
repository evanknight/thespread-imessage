import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb, submitPick, getWeek, apiReq, T, PLAYERS, type TestCtx } from './helpers';

// Hidden picks: before lock, other players' pick fields are null for EVERY caller
// (nulled in SQL, not the client); after lock, everything is visible.
describe('pick secrecy', () => {
  let ctx: TestCtx;
  beforeEach(async () => {
    ctx = await freshDb();
    await submitPick(ctx, 'Alice', 'sun1', 'BUF', T.tuesday);
    await submitPick(ctx, 'Bob', 'thu', 'KC', T.tuesday);
  });

  it('before lock: every caller sees only their own pick; others show has_picked with null team', async () => {
    for (const caller of PLAYERS) {
      const { status, body } = await getWeek(caller, T.beforeLock);
      expect(status).toBe(200);
      expect(body.week.locked).toBe(false);
      expect(body.submitted_count).toBe(2);
      for (const p of body.players) {
        if (p.display_name === caller) continue;
        expect(p.pick?.team_id ?? null).toBeNull();
        expect(p.pick?.team_abbr ?? null).toBeNull();
      }
      const alice = body.players.find((p: any) => p.display_name === 'Alice');
      expect(alice.has_picked).toBe(true);
      if (caller === 'Alice') {
        expect(body.my_pick.team_abbr).toBe('BUF');
      }
    }
  });

  it('after lock: all picks visible to everyone', async () => {
    const { body } = await getWeek('Erin', T.afterLock);
    expect(body.week.locked).toBe(true);
    const alice = body.players.find((p: any) => p.display_name === 'Alice');
    const bob = body.players.find((p: any) => p.display_name === 'Bob');
    expect(alice.pick.team_abbr).toBe('BUF');
    expect(bob.pick.team_abbr).toBe('KC');
  });

  it('enrollment exchanges a code for a token and rotates on reuse', async () => {
    const { POST } = await import('@/app/api/enroll/route');
    const res1 = await POST(apiReq('/api/enroll', { method: 'POST', body: { code: 'code-erin' } }));
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.display_name).toBe('Erin');
    expect(body1.token).toHaveLength(64);

    // Re-enroll: new token works, old token dies.
    const res2 = await POST(apiReq('/api/enroll', { method: 'POST', body: { code: 'code-erin' } }));
    const body2 = await res2.json();
    const { GET } = await import('@/app/api/week/current/route');
    const oldTok = await GET(apiReq('/api/week/current', { headers: { authorization: `Bearer ${body1.token}` }, now: T.tuesday }));
    expect(oldTok.status).toBe(401);
    const newTok = await GET(apiReq('/api/week/current', { headers: { authorization: `Bearer ${body2.token}` }, now: T.tuesday }));
    expect(newTok.status).toBe(200);

    const bad = await POST(apiReq('/api/enroll', { method: 'POST', body: { code: 'nope' } }));
    expect(bad.status).toBe(404);
  });
});
