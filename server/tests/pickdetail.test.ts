import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb, submitPick, snapshot, finalize, runScoring, apiReq, token, T, type TestCtx } from './helpers';

const detail = async (pickId: string, caller: string, now: string) => {
  const { GET } = await import('@/app/api/pick/[id]/route');
  const res = await GET(apiReq(`/api/pick/${pickId}`, { token: token(caller), now }), {
    params: Promise.resolve({ id: pickId }),
  });
  return { status: res.status, body: await res.json() };
};

const pickIdOf = async (ctx: TestCtx, name: string) => {
  const rows = await ctx.db.query('select id from picks where player_id = $1', [ctx.players[name]]);
  return rows[0].id as string;
};

describe('pick detail', () => {
  let ctx: TestCtx;
  beforeEach(async () => {
    ctx = await freshDb();
    await submitPick(ctx, 'Alice', 'sun1', 'MIA', T.tuesday);
    // A line that drifts: opens -1, sits -1.5 at lock, closes -2.5 at kickoff.
    await snapshot(ctx, 'sun1', '2026-10-06T12:00:00Z', -1, 1);
    await snapshot(ctx, 'sun1', '2026-10-08T00:10:00Z', -1.5, 1.5);
    await snapshot(ctx, 'sun1', '2026-10-11T16:55:00Z', -2.5, 2.5);
  });

  it('reports open / at-lock / official from the picked team perspective, with movement in points', async () => {
    await finalize(ctx, 'sun1', 27, 20, T.monday);
    await runScoring(T.monday);
    const { status, body } = await detail(await pickIdOf(ctx, 'Alice'), 'Alice', T.monday);

    expect(status).toBe(200);
    expect(body.line.open.spread).toBe(-1);
    expect(body.line.at_lock.spread).toBe(-1.5);
    expect(body.line.official.spread).toBe(-2.5);
    // MIA is home and was picked, so all three are the home side.
    expect(body.line.delta_lock_to_kickoff).toBe(-1);   // 1 point of payout lost
    expect(body.line.delta_open_to_now).toBe(-1.5);
    expect(body.line.series).toHaveLength(3);
    expect(body.result).toMatchObject({ outcome: 'W', total_points: 7.5 });
    expect(body.game).toMatchObject({ home_abbr: 'MIA', away_abbr: 'BUF', home_score: 27, winner_abbr: 'MIA' });
    expect(body.pick).toMatchObject({ team_abbr: 'MIA', is_mine: true });
  });

  it('flips the sign for a pick on the away side', async () => {
    await submitPick(ctx, 'Bob', 'sun1', 'BUF', T.tuesday);
    const { body } = await detail(await pickIdOf(ctx, 'Bob'), 'Bob', T.tuesday);
    expect(body.line.open.spread).toBe(1);
    expect(body.line.current.spread).toBe(2.5);
    expect(body.pick.team_abbr).toBe('BUF');
  });

  it('shows potential points before the game is scored', async () => {
    const { body } = await detail(await pickIdOf(ctx, 'Alice'), 'Alice', T.beforeLock);
    expect(body.result).toBeNull();
    expect(body.potential_points).toBe(7.5);   // 10 + (-2.5), latest line
  });

  it('SECRECY: another player cannot read the detail before lock, but can after', async () => {
    const pid = await pickIdOf(ctx, 'Alice');
    const before = await detail(pid, 'Bob', T.beforeLock);
    expect(before.status).toBe(404);

    const after = await detail(pid, 'Bob', T.afterLock);
    expect(after.status).toBe(200);
    expect(after.body.pick.team_abbr).toBe('MIA');
    expect(after.body.pick.is_mine).toBe(false);
  });

  it('counts real team switches, not re-taps of the same team', async () => {
    await submitPick(ctx, 'Carol', 'sun1', 'MIA', T.tuesday);
    await submitPick(ctx, 'Carol', 'sun1', 'MIA', '2026-10-06T19:00:00Z');   // same team again
    await submitPick(ctx, 'Carol', 'sun1', 'BUF', '2026-10-06T20:00:00Z');   // real switch
    await submitPick(ctx, 'Carol', 'sun2', 'PHI', T.beforeLock);             // real switch
    const { body } = await detail(await pickIdOf(ctx, 'Carol'), 'Carol', T.beforeLock);
    expect(body.pick.change_count).toBe(2);
    expect(body.pick.team_abbr).toBe('PHI');
  });
});

describe('odds budget guard', () => {
  it('blocks outbound calls once the daily cap is hit, and never throws', async () => {
    const ctx = await freshDb();
    const { oddsBudget, ODDS_DAILY_CAP, fetchDraftKingsSpreadsBudgeted } = await import('@/lib/odds');

    expect((await oddsBudget(ctx.db, T.tuesday)).allowed).toBe(true);

    for (let i = 0; i < ODDS_DAILY_CAP; i++) {
      await ctx.db.query('insert into odds_api_calls (called_at, reason) values ($1, $2)', [T.tuesday, 'test']);
    }
    const state = await oddsBudget(ctx.db, T.tuesday);
    expect(state.allowed).toBe(false);
    expect(state.reason).toBe('daily cap');

    // Returns null rather than calling out or throwing — callers fall back to
    // the newest stored snapshot.
    const events = await fetchDraftKingsSpreadsBudgeted(ctx.db, T.tuesday, 'test');
    expect(events).toBeNull();
  });

  it('the daily window rolls: yesterday-heavy usage does not block today', async () => {
    const ctx = await freshDb();
    const { oddsBudget, ODDS_DAILY_CAP } = await import('@/lib/odds');
    for (let i = 0; i < ODDS_DAILY_CAP; i++) {
      await ctx.db.query('insert into odds_api_calls (called_at, reason) values ($1, $2)', ['2026-10-01T12:00:00Z', 'old']);
    }
    expect((await oddsBudget(ctx.db, '2026-10-06T12:00:00Z')).allowed).toBe(true);
  });
});
