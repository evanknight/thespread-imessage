import { getDb, type Db } from '@/lib/db';
import { checkCronSecret } from '@/lib/auth';
import { requestNow } from '@/lib/now';
import { json, err } from '@/lib/http';
import { fetchScoreboard, postseasonRound, teamIdByEspnAbbr, type EspnGame } from '@/lib/espn';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Daily. Pulls current + next week from ESPN, upserts games and kickoff times,
// recomputes lock_at = MIN(kickoff) — but ONLY while the week is still unlocked,
// so a post-lock postponement can never retroactively reopen a week.
export async function POST(req: Request) {
  if (!checkCronSecret(req)) return err(401, 'unauthorized');
  const db = getDb();
  const nowIso = requestNow(req);

  // Manual mode: ?year=2026&seasontype=2&week=1 syncs exactly one specified week.
  // Useful for pre-syncing Week 1 while ESPN's "current" is still preseason.
  const url = new URL(req.url);
  if (url.searchParams.get('seasontype') && url.searchParams.get('week')) {
    const sb = await fetchScoreboard({
      year: Number(url.searchParams.get('year')) || undefined,
      seasontype: Number(url.searchParams.get('seasontype')),
      week: Number(url.searchParams.get('week')),
    });
    await syncWeek(db, sb, nowIso);
    return json({ ok: true, synced: [`type${sb.meta.seasonType}-week${sb.meta.weekNumber}`], manual: true });
  }

  const current = await fetchScoreboard();
  const synced: string[] = [];
  await syncWeek(db, current, nowIso);
  synced.push(`type${current.meta.seasonType}-week${current.meta.weekNumber}`);

  // Next week: same season type first; at the REG->POST boundary fall over to
  // postseason week 1; skip the Pro Bowl (postseason week 4).
  const tries: Array<{ seasontype: number; week: number }> = [];
  if (current.meta.seasonType === 2) {
    if (current.meta.weekNumber < 18) tries.push({ seasontype: 2, week: current.meta.weekNumber + 1 });
    else tries.push({ seasontype: 3, week: 1 });
  } else if (current.meta.seasonType === 3) {
    const next = current.meta.weekNumber === 3 ? 5 : current.meta.weekNumber + 1;
    if (next <= 5 && next !== 4) tries.push({ seasontype: 3, week: next });
  }
  for (const t of tries) {
    const sb = await fetchScoreboard({ year: current.meta.seasonYear, ...t });
    if (sb.games.length > 0) {
      await syncWeek(db, sb, nowIso);
      synced.push(`type${t.seasontype}-week${t.week}`);
    }
  }
  return json({ ok: true, synced });
}

async function syncWeek(db: Db, sb: { meta: any; games: EspnGame[] }, nowIso: string | null) {
  const { meta, games } = sb;
  if (!meta.seasonYear || !meta.weekNumber) throw new Error('ESPN scoreboard missing season/week meta');
  if (meta.seasonType !== 2 && meta.seasonType !== 3) return;   // ignore preseason etc.

  let round = 'REG', weekNumber = meta.weekNumber, bonus = 0;
  if (meta.seasonType === 3) {
    const ps = postseasonRound(meta.weekNumber);
    if (!ps) return;                                            // Pro Bowl
    round = ps.round; weekNumber = ps.weekNumber; bonus = ps.bonus;
  }

  const season = await db.query<{ id: string }>(
    `insert into seasons (year) values ($1)
     on conflict (year) do update set year = excluded.year returning id`,
    [meta.seasonYear]
  );
  const week = await db.query<{ id: string }>(
    `insert into weeks (season_id, week_number, round, playoff_bonus)
     values ($1, $2, $3, $4)
     on conflict (season_id, week_number) do update set round = excluded.round
     returning id`,
    [season[0].id, weekNumber, round, bonus]
  );
  const weekId = week[0].id;

  for (const g of games) {
    const homeId = await teamIdByEspnAbbr(db, g.homeAbbr);   // throws on unmapped names
    const awayId = await teamIdByEspnAbbr(db, g.awayAbbr);
    await db.query(
      `insert into games (week_id, espn_event_id, home_team_id, away_team_id, kickoff_at, status)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (espn_event_id) do update
         set kickoff_at = excluded.kickoff_at,
             status = case when games.status in ('FINAL','CANCELLED') then games.status
                           else excluded.status end`,
      [weekId, g.espnEventId, homeId, awayId, g.kickoffAt, g.status]
    );
  }

  // Rule A: lock_at = first kickoff of the week, recomputed until the week locks.
  await db.query(
    `update weeks w set lock_at = sub.min_kick
     from (select min(kickoff_at) as min_kick from games
           where week_id = $1 and status <> 'CANCELLED') sub
     where w.id = $1
       and (w.lock_at is null or w.lock_at > coalesce($2::timestamptz, now()))
       and sub.min_kick is not null`,
    [weekId, nowIso]
  );
}
