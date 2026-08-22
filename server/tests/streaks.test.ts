import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb, apiReq, token, type TestCtx } from './helpers';

// Builds N scored weeks for one player from a list of outcomes.
let weekCursor = 100;
async function seedOutcomes(ctx: TestCtx, name: string, outcomes: Array<'W' | 'L'>) {
  const base = weekCursor;
  weekCursor += outcomes.length;
  for (const [i, outcome] of outcomes.entries()) {
    const wk = await ctx.db.query(
      `insert into weeks (season_id, week_number, round, lock_at)
       values ($1, $2, 'REG', $3) returning id`,
      [ctx.seasonId, base + i, `2026-09-${String(10 + i).padStart(2, '0')}T00:15:00Z`]
    );
    const g = await ctx.db.query(
      `insert into games (week_id, espn_event_id, home_team_id, away_team_id, kickoff_at, status,
                          home_score, away_score, winner_team_id)
       values ($1, $2, $3, $4, $5, 'FINAL', 24, 20, $3) returning id`,
      [wk[0].id, `espn-s${base + i}`, ctx.teams['KC'], ctx.teams['LAC'],
       `2026-09-${String(10 + i).padStart(2, '0')}T00:15:00Z`]
    );
    // Picking KC (the winner) => W; picking LAC => L
    const pick = await ctx.db.query(
      `insert into picks (player_id, week_id, game_id, team_id) values ($1, $2, $3, $4) returning id`,
      [ctx.players[name], wk[0].id, g[0].id, outcome === 'W' ? ctx.teams['KC'] : ctx.teams['LAC']]
    );
    await ctx.db.query(
      `insert into pick_results (pick_id, official_spread, base_points, bonus_points, total_points, outcome)
       values ($1, -3, $2, 0, $2, $3)`,
      [pick[0].id, outcome === 'W' ? 7 : 0, outcome]
    );
  }
}

const streakOf = async (ctx: TestCtx, name: string) => {
  const { GET } = await import('@/app/api/standings/route');
  const res = await GET(apiReq('/api/standings', { token: token('Alice') }));
  const body = await res.json();
  return body.standings.find((s: any) => s.display_name === name);
};

describe('W/L streaks', () => {
  let ctx: TestCtx;
  beforeEach(async () => { ctx = await freshDb(); weekCursor = 100; });

  it('no results yet -> no streak (this is why a fresh season shows blank)', async () => {
    const row = await streakOf(ctx, 'Bird' in {} ? 'Bird' : 'Alice');
    expect(row.streak).toBeNull();
    expect(row).toMatchObject({ wins: 0, losses: 0, total_points: 0 });
  });

  it('three straight wins -> W3', async () => {
    await seedOutcomes(ctx, 'Alice', ['W', 'W', 'W']);
    const row = await streakOf(ctx, 'Alice');
    expect(row.streak).toBe('W3');
    expect(row).toMatchObject({ wins: 3, losses: 0, total_points: 21 });
  });

  it('W W L -> L1 (streak follows the most recent week, not the best run)', async () => {
    await seedOutcomes(ctx, 'Alice', ['W', 'W', 'L']);
    expect((await streakOf(ctx, 'Alice')).streak).toBe('L1');
  });

  it('L W W -> W2', async () => {
    await seedOutcomes(ctx, 'Alice', ['L', 'W', 'W']);
    const row = await streakOf(ctx, 'Alice');
    expect(row.streak).toBe('W2');
    expect(row).toMatchObject({ wins: 2, losses: 1 });
  });

  it('a six-week run reads W6', async () => {
    await seedOutcomes(ctx, 'Alice', ['W', 'W', 'W', 'W', 'W', 'W']);
    expect((await streakOf(ctx, 'Alice')).streak).toBe('W6');
  });

  it('streaks are per player and do not bleed across the league', async () => {
    await seedOutcomes(ctx, 'Alice', ['W', 'W']);
    await seedOutcomes(ctx, 'Bob', ['L', 'L', 'L']);
    expect((await streakOf(ctx, 'Alice')).streak).toBe('W2');
    expect((await streakOf(ctx, 'Bob')).streak).toBe('L3');
    expect((await streakOf(ctx, 'Carol')).streak).toBeNull();
  });
});
