import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb, submitPick, snapshot, finalize, runScoring, standingsFor, T, type TestCtx } from './helpers';

const result = async (ctx: TestCtx, name: string) => {
  const rows = await ctx.db.query(
    `select pr.* from pick_results pr join picks pk on pk.id = pr.pick_id where pk.player_id = $1`,
    [ctx.players[name]]
  );
  return rows[0] ?? null;
};

describe('score-picks (Rule B + edge cases)', () => {
  let ctx: TestCtx;
  beforeEach(async () => { ctx = await freshDb(); });

  it('official spread is the line at THE PICKED GAME\'S kickoff, not at lock (-1.5 -> -2.5 moves with it)', async () => {
    await submitPick(ctx, 'Alice', 'sun1', 'MIA', T.tuesday);
    await snapshot(ctx, 'sun1', '2026-10-08T00:10:00Z', -1.5, 1.5);            // near lock: MIA -1.5
    await snapshot(ctx, 'sun1', '2026-10-11T16:55:00Z', -2.5, 2.5);            // 5 min before Sunday kickoff: MIA -2.5
    await finalize(ctx, 'sun1', 27, 20, '2026-10-11T20:05:00Z');               // MIA wins
    await runScoring(T.monday);

    const r = await result(ctx, 'Alice');
    expect(Number(r.official_spread)).toBe(-2.5);       // Rule B: kickoff line
    expect(Number(r.lock_time_spread)).toBe(-1.5);      // shown so nobody feels cheated
    expect(Number(r.total_points)).toBe(7.5);
    expect(r.outcome).toBe('W');
  });

  it('big favorite that wins goes NEGATIVE and stays negative in standings', async () => {
    await submitPick(ctx, 'Bob', 'sun2', 'PHI', T.tuesday);
    await snapshot(ctx, 'sun2', '2026-10-11T20:20:00Z', -10.5, 10.5);
    await finalize(ctx, 'sun2', 31, 10, T.monday);
    await runScoring(T.monday);

    const r = await result(ctx, 'Bob');
    expect(Number(r.total_points)).toBe(-0.5);
    const s = await standingsFor(ctx, 'Bob');
    expect(s.total).toBe(-0.5);
    expect(s.wins).toBe(1);
  });

  it('loss -> 0 points, record L', async () => {
    await submitPick(ctx, 'Carol', 'sun1', 'BUF', T.tuesday);
    await snapshot(ctx, 'sun1', '2026-10-11T16:55:00Z', -2.5, 2.5);
    await finalize(ctx, 'sun1', 27, 20, T.monday);                 // MIA wins, BUF pick loses
    await runScoring(T.monday);
    const r = await result(ctx, 'Carol');
    expect(r.outcome).toBe('L');
    expect(Number(r.total_points)).toBe(0);
    const s = await standingsFor(ctx, 'Carol');
    expect(s.losses).toBe(1);
  });

  it('tie -> 0 points and counts as a LOSS in the record', async () => {
    await submitPick(ctx, 'Dave', 'sun1', 'MIA', T.tuesday);
    await snapshot(ctx, 'sun1', '2026-10-11T16:55:00Z', -2.5, 2.5);
    await finalize(ctx, 'sun1', 20, 20, T.monday);                 // tie: winner_team_id null
    await runScoring(T.monday);
    const r = await result(ctx, 'Dave');
    expect(r.outcome).toBe('L');
    expect(Number(r.total_points)).toBe(0);
    const s = await standingsFor(ctx, 'Dave');
    expect(s).toMatchObject({ wins: 0, losses: 1, total: 0 });
  });

  it('no pick -> 0 points and record COMPLETELY unchanged', async () => {
    await snapshot(ctx, 'sun1', '2026-10-11T16:55:00Z', -2.5, 2.5);
    await finalize(ctx, 'sun1', 27, 20, T.monday);
    await runScoring(T.monday);
    const s = await standingsFor(ctx, 'Erin');
    expect(s).toEqual({ total: 0, wins: 0, losses: 0, picks: 0 });
  });

  it('postponed then played later in the season: original pick stands and scores when played', async () => {
    await submitPick(ctx, 'Alice', 'sun2', 'DAL', T.tuesday);
    await ctx.db.query(`update games set status = 'POSTPONED' where id = $1`, [ctx.games['sun2'].id]);
    let run = await runScoring(T.monday);
    expect(run.body.scored).toBe(0);
    expect(await result(ctx, 'Alice')).toBeNull();

    // Rescheduled 10 days later, snapshot before the NEW kickoff, DAL wins.
    const newKick = '2026-10-21T00:15:00Z';
    await ctx.db.query(`update games set status = 'SCHEDULED', kickoff_at = $2 where id = $1`, [ctx.games['sun2'].id, newKick]);
    await snapshot(ctx, 'sun2', '2026-10-21T00:10:00Z', -3, 3);
    await finalize(ctx, 'sun2', 17, 24, '2026-10-21T03:30:00Z');
    run = await runScoring('2026-10-21T04:00:00Z');
    expect(run.body.scored).toBe(1);
    const r = await result(ctx, 'Alice');
    expect(Number(r.official_spread)).toBe(3);
    expect(Number(r.total_points)).toBe(13);
    // Original pick untouched — submitted way back on Tuesday.
    const pick = await ctx.db.query('select submitted_at from picks where player_id = $1', [ctx.players['Alice']]);
    expect(new Date(pick[0].submitted_at).toISOString()).toBe(new Date(T.tuesday).toISOString());
  });

  it('cancelled game -> outcome NP, 0 points, record unchanged', async () => {
    await submitPick(ctx, 'Bob', 'sun1', 'BUF', T.tuesday);
    await ctx.db.query(`update games set status = 'CANCELLED' where id = $1`, [ctx.games['sun1'].id]);
    await runScoring(T.monday);
    const r = await result(ctx, 'Bob');
    expect(r.outcome).toBe('NP');
    expect(Number(r.total_points)).toBe(0);
    const s = await standingsFor(ctx, 'Bob');
    expect(s).toMatchObject({ wins: 0, losses: 0, total: 0 });
  });

  it('DK pulls the line before kickoff -> falls back to last good snapshot, snapshot_id recorded', async () => {
    await submitPick(ctx, 'Carol', 'sun1', 'MIA', T.tuesday);
    const goodId = await snapshot(ctx, 'sun1', '2026-10-11T15:00:00Z', -2.5, 2.5); // good, 2h before
    await snapshot(ctx, 'sun1', '2026-10-11T16:55:00Z', null, null);               // pulled in final window
    await finalize(ctx, 'sun1', 27, 20, T.monday);
    await runScoring(T.monday);
    const r = await result(ctx, 'Carol');
    expect(r.snapshot_id).toBe(goodId);
    expect(Number(r.official_spread)).toBe(-2.5);
    expect(Number(r.total_points)).toBe(7.5);
  });

  it('no snapshot at all -> VOID, flagged for manual entry, not silently zeroed as L', async () => {
    await submitPick(ctx, 'Dave', 'sun1', 'MIA', T.tuesday);
    await finalize(ctx, 'sun1', 27, 20, T.monday);
    const run = await runScoring(T.monday);
    expect(run.body.voided.length).toBe(1);
    const r = await result(ctx, 'Dave');
    expect(r.outcome).toBe('VOID');
    expect(r.manual_override_note).toContain('no odds snapshot');
    const s = await standingsFor(ctx, 'Dave');
    expect(s).toMatchObject({ wins: 0, losses: 0 });      // VOID never touches the record
  });

  it('Super Bowl underdog +3.5 wins -> 17.5 end to end', async () => {
    const wk = await ctx.db.query(
      `insert into weeks (season_id, week_number, round, lock_at, playoff_bonus)
       values ($1, 22, 'SB', '2027-02-08T23:30:00Z', 4) returning id`,
      [ctx.seasonId]
    );
    const g = await ctx.db.query(
      `insert into games (week_id, espn_event_id, home_team_id, away_team_id, kickoff_at)
       values ($1, 'espn-sb', $2, $3, '2027-02-08T23:30:00Z') returning id`,
      [wk[0].id, ctx.teams['SF'], ctx.teams['KC']]
    );
    const { POST } = await import('@/app/api/pick/route');
    const { apiReq, token } = await import('./helpers');
    const res = await POST(apiReq('/api/pick', {
      method: 'POST', token: token('Erin'), now: '2027-02-06T12:00:00Z',
      body: { week_id: wk[0].id, game_id: g[0].id, team_id: ctx.teams['KC'] },
    }));
    expect(res.status).toBe(200);
    await ctx.db.query(
      `insert into odds_snapshots (game_id, captured_at, home_spread, away_spread) values ($1, '2027-02-08T23:25:00Z', -3.5, 3.5)`,
      [g[0].id]
    );
    await ctx.db.query(
      `update games set status='FINAL', home_score=22, away_score=25, winner_team_id=$2 where id=$1`,
      [g[0].id, ctx.teams['KC']]
    );
    await runScoring('2027-02-09T04:00:00Z');
    const r = await result(ctx, 'Erin');
    expect(Number(r.base_points)).toBe(13.5);
    expect(Number(r.bonus_points)).toBe(4);
    expect(Number(r.total_points)).toBe(17.5);
  });

  it('score-picks run twice -> identical results, no double-scoring', async () => {
    await submitPick(ctx, 'Alice', 'sun1', 'MIA', T.tuesday);
    await snapshot(ctx, 'sun1', '2026-10-11T16:55:00Z', -2.5, 2.5);
    await finalize(ctx, 'sun1', 27, 20, T.monday);
    const run1 = await runScoring(T.monday);
    expect(run1.body.scored).toBe(1);
    const before = await result(ctx, 'Alice');
    const run2 = await runScoring(T.tuesdayAfter);
    expect(run2.body.scored).toBe(0);
    const after = await result(ctx, 'Alice');
    expect(after).toEqual(before);
    const count = await ctx.db.query('select count(*)::int as n from pick_results');
    expect(count[0].n).toBe(1);
  });
});
