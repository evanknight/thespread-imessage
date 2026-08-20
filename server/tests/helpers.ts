import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { setDb, type Db } from '@/lib/db';
import { sha256hex } from '@/lib/auth';

// Fixed timeline used across tests (all UTC).
export const T = {
  tuesday:    '2026-10-06T18:00:00Z',
  beforeLock: '2026-10-08T00:14:59Z',   // 1s before lock
  lock:       '2026-10-08T00:15:00Z',   // Thursday-night kickoff = week lock
  afterLock:  '2026-10-08T00:15:01Z',   // 1s after lock
  sunEarly:   '2026-10-11T17:00:00Z',   // Sunday 1:00 ET
  sunLate:    '2026-10-11T20:25:00Z',   // Sunday 4:25 ET
  monday:     '2026-10-13T00:15:00Z',
  tuesdayAfter: '2026-10-13T16:00:00Z',
};

export const PLAYERS = ['Alice', 'Bob', 'Carol', 'Dave', 'Erin'];
export const token = (name: string) => `test-token-${name.toLowerCase()}`;

export interface TestCtx {
  db: Db;
  pg: PGlite;
  seasonId: string;
  weekId: string;
  players: Record<string, string>;              // name -> id
  games: Record<string, { id: string; home: string; away: string; homeAbbr: string; awayAbbr: string }>;
  teams: Record<string, string>;                // canonical abbr -> id
}

export async function freshDb(): Promise<TestCtx> {
  const pg = new PGlite();
  const dir = join(__dirname, '..', 'supabase', 'migrations');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await pg.exec(readFileSync(join(dir, f), 'utf8'));
  }
  const db: Db = {
    query: async (text, params) => (await pg.query(text, params ?? [])).rows as any[],
  };
  setDb(db);

  const players: Record<string, string> = {};
  for (const name of PLAYERS) {
    const rows = await db.query(
      `insert into players (display_name, enrollment_code_hash, token_hash)
       values ($1, $2, $3) returning id`,
      [name, sha256hex(`code-${name.toLowerCase()}`), sha256hex(token(name))]
    );
    players[name] = rows[0].id;
  }

  const season = await db.query(`insert into seasons (year) values (2026) returning id`);
  const week = await db.query(
    `insert into weeks (season_id, week_number, round, lock_at, playoff_bonus)
     values ($1, 5, 'REG', $2, 0) returning id`,
    [season[0].id, T.lock]
  );

  const teams: Record<string, string> = {};
  for (const row of await db.query('select id, canonical_abbr from teams')) {
    teams[row.canonical_abbr] = row.id;
  }

  const games: TestCtx['games'] = {};
  const addGame = async (key: string, homeAbbr: string, awayAbbr: string, kickoff: string) => {
    const rows = await db.query(
      `insert into games (week_id, espn_event_id, home_team_id, away_team_id, kickoff_at)
       values ($1, $2, $3, $4, $5) returning id`,
      [week[0].id, `espn-${key}`, teams[homeAbbr], teams[awayAbbr], kickoff]
    );
    games[key] = { id: rows[0].id, home: teams[homeAbbr], away: teams[awayAbbr], homeAbbr, awayAbbr };
  };
  await addGame('thu', 'KC',  'LAC', T.lock);      // Thursday night — defines lock
  await addGame('sun1', 'MIA', 'BUF', T.sunEarly); // Sunday 1:00
  await addGame('sun2', 'PHI', 'DAL', T.sunLate);  // Sunday 4:25

  return { db, pg, seasonId: season[0].id, weekId: week[0].id, players, games, teams };
}

export async function snapshot(ctx: TestCtx, gameKey: string, capturedAt: string, homeSpread: number | null, awaySpread: number | null) {
  const rows = await ctx.db.query(
    `insert into odds_snapshots (game_id, captured_at, home_spread, away_spread)
     values ($1, $2, $3, $4) returning id`,
    [ctx.games[gameKey].id, capturedAt, homeSpread, awaySpread]
  );
  return rows[0].id as string;
}

export async function finalize(ctx: TestCtx, gameKey: string, homeScore: number, awayScore: number, at: string) {
  const g = ctx.games[gameKey];
  const winner = homeScore > awayScore ? g.home : awayScore > homeScore ? g.away : null;
  await ctx.db.query(
    `update games set status = 'FINAL', home_score = $2, away_score = $3, winner_team_id = $4, completed_at = $5
     where id = $1`,
    [g.id, homeScore, awayScore, winner, at]
  );
}

// Route invocation helpers — call the actual Next route handlers with real Requests.
export function apiReq(path: string, opts: { method?: string; token?: string; now?: string; body?: unknown; headers?: Record<string, string> } = {}): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(opts.headers ?? {}) };
  if (opts.token) headers['authorization'] = `Bearer ${opts.token}`;
  if (opts.now) headers['x-debug-now'] = opts.now;
  return new Request(`http://test.local${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

export async function submitPick(ctx: TestCtx, playerName: string, gameKey: string, teamAbbr: string, now: string) {
  const { POST } = await import('@/app/api/pick/route');
  return POST(apiReq('/api/pick', {
    method: 'POST',
    token: token(playerName),
    now,
    body: { week_id: ctx.weekId, game_id: ctx.games[gameKey].id, team_id: ctx.teams[teamAbbr] },
  }));
}

export async function getWeek(playerName: string, now: string) {
  const { GET } = await import('@/app/api/week/current/route');
  const res = await GET(apiReq('/api/week/current', { token: token(playerName), now }));
  return { status: res.status, body: await res.json() };
}

export async function runScoring(now: string) {
  const { POST } = await import('@/app/api/cron/score-picks/route');
  const res = await POST(apiReq('/api/cron/score-picks', {
    method: 'POST', now, headers: { authorization: `Bearer test-cron-secret` }, body: {},
  }));
  return { status: res.status, body: await res.json() };
}

export async function standingsFor(ctx: TestCtx, name: string) {
  const rows = await ctx.db.query(
    `select total_points, wins, losses, picks_made from season_standings
     where season_id = $1 and player_id = $2`,
    [ctx.seasonId, ctx.players[name]]
  );
  const r = rows[0];
  return { total: Number(r.total_points), wins: Number(r.wins), losses: Number(r.losses), picks: Number(r.picks_made) };
}
