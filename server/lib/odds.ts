// The Odds API, DraftKings spreads only.
// One call returns every upcoming NFL game, so callers make at most ONE call per run.
import type { Db } from './db';

const ODDS_URL = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds';

export interface OddsEvent {
  oddsApiEventId: string;
  homeName: string;
  awayName: string;
  commenceTime: string;
  homeSpread: number | null;   // null when DK has pulled the spread market
  awaySpread: number | null;
  raw: any;
}

export function parseOddsResponse(data: any[]): OddsEvent[] {
  return (data ?? []).map((ev) => {
    const dk = (ev.bookmakers ?? []).find((b: any) => b.key === 'draftkings');
    const market = dk?.markets?.find((m: any) => m.key === 'spreads');
    let homeSpread: number | null = null;
    let awaySpread: number | null = null;
    for (const o of market?.outcomes ?? []) {
      if (o.name === ev.home_team) homeSpread = o.point;
      if (o.name === ev.away_team) awaySpread = o.point;
    }
    return {
      oddsApiEventId: String(ev.id),
      homeName: ev.home_team,
      awayName: ev.away_team,
      commenceTime: new Date(ev.commence_time).toISOString(),
      homeSpread,
      awaySpread,
      raw: ev,
    };
  });
}

export async function fetchDraftKingsSpreads(): Promise<OddsEvent[]> {
  const key = process.env.ODDS_API_KEY;
  if (!key) throw new Error('ODDS_API_KEY not set');
  const url = new URL(ODDS_URL);
  url.searchParams.set('apiKey', key);
  url.searchParams.set('bookmakers', 'draftkings');
  url.searchParams.set('markets', 'spreads');
  url.searchParams.set('oddsFormat', 'american');
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Odds API -> ${res.status}: ${await res.text()}`);
  return parseOddsResponse(await res.json());
}

// Match odds events to games: (canonical home, canonical away, kickoff within ±6h),
// or a previously stored odds_api_event_id. Inserts one snapshot per matched game.
// Unmapped team names are collected and thrown at the end — fail loudly.
export async function snapshotEvents(db: Db, events: OddsEvent[], nowIso: string | null): Promise<{ inserted: number; unmatched: string[]; unmappedNames: string[] }> {
  let inserted = 0;
  const unmatched: string[] = [];
  const unmappedNames: string[] = [];

  for (const ev of events) {
    const teams = await db.query<{ id: string; odds_api_name: string }>(
      'select id, odds_api_name from teams where odds_api_name in ($1, $2)',
      [ev.homeName, ev.awayName]
    );
    const homeId = teams.find((t) => t.odds_api_name === ev.homeName)?.id;
    const awayId = teams.find((t) => t.odds_api_name === ev.awayName)?.id;
    if (!homeId || !awayId) {
      if (!homeId) unmappedNames.push(ev.homeName);
      if (!awayId) unmappedNames.push(ev.awayName);
      continue;
    }
    const games = await db.query<{ id: string }>(
      `select id from games
       where odds_api_event_id = $1
          or (home_team_id = $2 and away_team_id = $3
              and kickoff_at between $4::timestamptz - interval '6 hours'
                                 and $4::timestamptz + interval '6 hours')
       limit 1`,
      [ev.oddsApiEventId, homeId, awayId, ev.commenceTime]
    );
    if (!games[0]) {
      unmatched.push(`${ev.awayName} @ ${ev.homeName} ${ev.commenceTime}`);
      continue;
    }
    await db.query('update games set odds_api_event_id = $1 where id = $2 and odds_api_event_id is null', [
      ev.oddsApiEventId, games[0].id,
    ]);
    await db.query(
      `insert into odds_snapshots (game_id, captured_at, bookmaker, home_spread, away_spread, raw)
       values ($1, coalesce($2::timestamptz, now()), 'draftkings', $3, $4, $5)`,
      [games[0].id, nowIso, ev.homeSpread, ev.awaySpread, JSON.stringify(ev.raw)]
    );
    inserted++;
  }

  if (unmappedNames.length > 0) {
    throw new Error(`Unmapped Odds API team names: ${[...new Set(unmappedNames)].join(', ')} — add to teams table. (${inserted} snapshots inserted before failing)`);
  }
  return { inserted, unmatched, unmappedNames };
}
