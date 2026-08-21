import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb, submitPick, snapshot, finalize, runScoring, apiReq, token, T, type TestCtx } from './helpers';

describe('standings and history routes', () => {
  let ctx: TestCtx;
  beforeEach(async () => {
    ctx = await freshDb();
    await submitPick(ctx, 'Alice', 'sun1', 'MIA', T.tuesday);
    await snapshot(ctx, 'sun1', '2026-10-11T16:55:00Z', -2.5, 2.5);
    await finalize(ctx, 'sun1', 27, 20, T.monday);
    await runScoring(T.monday);
  });

  it('standings: totals, W-L, ordered by points', async () => {
    const { GET } = await import('@/app/api/standings/route');
    const res = await GET(apiReq('/api/standings', { token: token('Bob'), now: T.tuesdayAfter }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.season).toBe(2026);
    expect(body.standings[0]).toMatchObject({ display_name: 'Alice', total_points: 7.5, wins: 1, losses: 0, streak: 'W1' });
    expect(body.standings).toHaveLength(5);
    const aliceWeek = body.weeks.find((w: any) => w.display_name === 'Alice');
    expect(aliceWeek).toMatchObject({ picked_team: 'MIA', home_abbr: 'MIA', away_abbr: 'BUF', home_score: 27, away_score: 20 });
  });

  it("history: another caller can see Alice's scored pick (week is over)", async () => {
    const { GET } = await import('@/app/api/history/route');
    const res = await GET(apiReq(`/api/history?player_id=${ctx.players['Alice']}`, { token: token('Bob'), now: T.tuesdayAfter }));
    const body = await res.json();
    expect(body.picks).toHaveLength(1);
    expect(body.picks[0]).toMatchObject({ picked_team: 'MIA', official_spread: -2.5, total_points: 7.5, outcome: 'W' });
  });

  it("history: a NOT-yet-locked pick never leaks through someone else's history request", async () => {
    // New week, far future lock, Bob picks — Alice asks for Bob's history.
    const wk = await ctx.db.query(
      `insert into weeks (season_id, week_number, round, lock_at) values ($1, 6, 'REG', '2026-10-15T00:15:00Z') returning id`,
      [ctx.seasonId]
    );
    const g = await ctx.db.query(
      `insert into games (week_id, espn_event_id, home_team_id, away_team_id, kickoff_at)
       values ($1, 'espn-w6', $2, $3, '2026-10-15T00:15:00Z') returning id`,
      [wk[0].id, ctx.teams['GB'], ctx.teams['DET']]
    );
    const { POST } = await import('@/app/api/pick/route');
    await POST(apiReq('/api/pick', {
      method: 'POST', token: token('Bob'), now: '2026-10-14T12:00:00Z',
      body: { week_id: wk[0].id, game_id: g[0].id, team_id: ctx.teams['DET'] },
    }));

    const { GET } = await import('@/app/api/history/route');
    const res = await GET(apiReq(`/api/history?player_id=${ctx.players['Bob']}`, { token: token('Alice'), now: '2026-10-14T13:00:00Z' }));
    const body = await res.json();
    // Only the already-locked-and-scored weeks may appear — never week 6.
    expect(body.picks.every((p: any) => p.week_number !== 6)).toBe(true);

    // Bob himself CAN see his own week-6 pick.
    const own = await GET(apiReq('/api/history', { token: token('Bob'), now: '2026-10-14T13:00:00Z' }));
    const ownBody = await own.json();
    expect(ownBody.picks.some((p: any) => p.week_number === 6 && p.picked_team === 'DET')).toBe(true);
  });
});
