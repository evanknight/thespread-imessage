// ESPN public scoreboard JSON. No auth, no SLA — parse defensively and
// FAIL LOUDLY on anything we can't map. Silent wrong data is worse than a 500.
import type { Db } from './db';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

export interface EspnGame {
  espnEventId: string;
  homeAbbr: string;
  awayAbbr: string;
  kickoffAt: string;        // ISO
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'FINAL' | 'POSTPONED' | 'CANCELLED';
  homeScore: number | null;
  awayScore: number | null;
}

export interface EspnWeekMeta {
  seasonYear: number;
  seasonType: number;       // 2 = regular, 3 = postseason
  weekNumber: number;       // within the season type
}

export function mapEspnStatus(name: string, completed: boolean): EspnGame['status'] {
  if (completed || name === 'STATUS_FINAL') return 'FINAL';
  if (name === 'STATUS_POSTPONED') return 'POSTPONED';
  if (name === 'STATUS_CANCELED' || name === 'STATUS_CANCELLED') return 'CANCELLED';
  if (name === 'STATUS_SCHEDULED') return 'SCHEDULED';
  return 'IN_PROGRESS'; // halftime, delayed, end-period, etc.
}

export function parseScoreboard(data: any): { meta: EspnWeekMeta; games: EspnGame[] } {
  const meta: EspnWeekMeta = {
    seasonYear: data?.season?.year,
    seasonType: data?.season?.type,
    weekNumber: data?.week?.number,
  };
  const games: EspnGame[] = [];
  for (const ev of data?.events ?? []) {
    const comp = ev?.competitions?.[0];
    if (!comp) continue;
    const home = comp.competitors?.find((c: any) => c.homeAway === 'home');
    const away = comp.competitors?.find((c: any) => c.homeAway === 'away');
    if (!home?.team?.abbreviation || !away?.team?.abbreviation) {
      throw new Error(`ESPN event ${ev.id}: missing competitor team abbreviation`);
    }
    const st = comp.status?.type ?? ev.status?.type ?? {};
    games.push({
      espnEventId: String(ev.id),
      homeAbbr: home.team.abbreviation,
      awayAbbr: away.team.abbreviation,
      kickoffAt: new Date(comp.date ?? ev.date).toISOString(),
      status: mapEspnStatus(st.name ?? '', st.completed === true),
      homeScore: home.score != null && st.name !== 'STATUS_SCHEDULED' ? Number(home.score) : null,
      awayScore: away.score != null && st.name !== 'STATUS_SCHEDULED' ? Number(away.score) : null,
    });
  }
  return { meta, games };
}

export async function fetchScoreboard(params?: { year?: number; seasontype?: number; week?: number; dates?: string }) {
  const url = new URL(BASE);
  if (params?.year) url.searchParams.set('year', String(params.year));
  if (params?.seasontype) url.searchParams.set('seasontype', String(params.seasontype));
  if (params?.week) url.searchParams.set('week', String(params.week));
  if (params?.dates) url.searchParams.set('dates', params.dates);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`ESPN ${url} -> ${res.status}`);
  return parseScoreboard(await res.json());
}

// ESPN postseason week -> our round + continuous week_number.
// Postseason week 4 is the Pro Bowl: skipped entirely.
export function postseasonRound(week: number): { round: string; weekNumber: number; bonus: number } | null {
  switch (week) {
    case 1: return { round: 'WC',   weekNumber: 19, bonus: 1 };
    case 2: return { round: 'DIV',  weekNumber: 20, bonus: 2 };
    case 3: return { round: 'CONF', weekNumber: 21, bonus: 3 };
    case 5: return { round: 'SB',   weekNumber: 22, bonus: 4 };
    default: return null;
  }
}

// Resolve an ESPN abbreviation to a team id, failing loudly on unmapped names.
export async function teamIdByEspnAbbr(db: Db, abbr: string): Promise<string> {
  const rows = await db.query<{ id: string }>('select id from teams where espn_abbr = $1', [abbr]);
  if (!rows[0]) throw new Error(`Unmapped ESPN team abbreviation: "${abbr}" — add it to the teams table`);
  return rows[0].id;
}
