import { describe, it, expect } from 'vitest';
import { parseScoreboard, mapEspnStatus, postseasonRound } from '@/lib/espn';
import { parseOddsResponse, snapshotEvents } from '@/lib/odds';
import { freshDb, T } from './helpers';

describe('ESPN adapter', () => {
  it('parses a scoreboard event and maps statuses', () => {
    const { meta, games } = parseScoreboard({
      season: { year: 2026, type: 2 },
      week: { number: 5 },
      events: [{
        id: '401600001',
        date: '2026-10-11T17:00:00Z',
        competitions: [{
          date: '2026-10-11T17:00:00Z',
          competitors: [
            { homeAway: 'home', team: { abbreviation: 'MIA' }, score: '27' },
            { homeAway: 'away', team: { abbreviation: 'BUF' }, score: '20' },
          ],
          status: { type: { name: 'STATUS_FINAL', completed: true } },
        }],
      }],
    });
    expect(meta).toEqual({ seasonYear: 2026, seasonType: 2, weekNumber: 5 });
    expect(games[0]).toMatchObject({ espnEventId: '401600001', homeAbbr: 'MIA', awayAbbr: 'BUF', status: 'FINAL', homeScore: 27, awayScore: 20 });
  });

  it('status map: postponed / cancelled / in-progress variants', () => {
    expect(mapEspnStatus('STATUS_POSTPONED', false)).toBe('POSTPONED');
    expect(mapEspnStatus('STATUS_CANCELED', false)).toBe('CANCELLED');
    expect(mapEspnStatus('STATUS_HALFTIME', false)).toBe('IN_PROGRESS');
    expect(mapEspnStatus('STATUS_SCHEDULED', false)).toBe('SCHEDULED');
  });

  it('postseason mapping skips the Pro Bowl and lands SB on week 22 with +4', () => {
    expect(postseasonRound(1)).toMatchObject({ round: 'WC', bonus: 1 });
    expect(postseasonRound(4)).toBeNull();
    expect(postseasonRound(5)).toMatchObject({ round: 'SB', weekNumber: 22, bonus: 4 });
  });

  it('throws on an event missing a team abbreviation', () => {
    expect(() => parseScoreboard({
      season: { year: 2026, type: 2 }, week: { number: 5 },
      events: [{ id: 'x', competitions: [{ competitors: [{ homeAway: 'home', team: {} }, { homeAway: 'away', team: { abbreviation: 'BUF' } }] }] }],
    })).toThrow(/abbreviation/);
  });
});

describe('Odds API adapter', () => {
  const dkEvent = (home: string, away: string, homePoint: number | null) => ({
    id: 'odds-evt-1',
    commence_time: T.sunEarly,
    home_team: home,
    away_team: away,
    bookmakers: homePoint == null ? [] : [{
      key: 'draftkings',
      markets: [{ key: 'spreads', outcomes: [
        { name: home, point: homePoint }, { name: away, point: -homePoint },
      ]}],
    }],
  });

  it('extracts DraftKings spreads by team name', () => {
    const [ev] = parseOddsResponse([dkEvent('Miami Dolphins', 'Buffalo Bills', -2.5)]);
    expect(ev.homeSpread).toBe(-2.5);
    expect(ev.awaySpread).toBe(2.5);
  });

  it('missing DK book -> null spreads (pulled line), not a crash', () => {
    const [ev] = parseOddsResponse([dkEvent('Miami Dolphins', 'Buffalo Bills', null)]);
    expect(ev.homeSpread).toBeNull();
  });

  it('matches events to games by canonical names + kickoff window and stores the snapshot', async () => {
    const ctx = await freshDb();
    const res = await snapshotEvents(ctx.db, parseOddsResponse([dkEvent('Miami Dolphins', 'Buffalo Bills', -2.5)]), T.tuesday);
    expect(res.inserted).toBe(1);
    const snaps = await ctx.db.query('select game_id, home_spread from odds_snapshots');
    expect(snaps[0].game_id).toBe(ctx.games['sun1'].id);
    const game = await ctx.db.query('select odds_api_event_id from games where id = $1', [ctx.games['sun1'].id]);
    expect(game[0].odds_api_event_id).toBe('odds-evt-1');
  });

  it('FAILS LOUDLY on an unmapped team name instead of silently skipping', async () => {
    const ctx = await freshDb();
    await expect(
      snapshotEvents(ctx.db, parseOddsResponse([dkEvent('Miami Dolphins', 'Buffalo Billz', -2.5)]), T.tuesday)
    ).rejects.toThrow(/Unmapped Odds API team names.*Buffalo Billz/);
  });
});
