import { getDb } from '@/lib/db';
import { checkCronSecret } from '@/lib/auth';
import { requestNow } from '@/lib/now';
import { json, err } from '@/lib/http';
import { fetchScoreboard } from '@/lib/espn';
import { runScorePicks } from '@/lib/scorePicks';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Every 10 minutes. Cheap exit when nothing is in flight, so it can run
// year-round without a "game day" schedule. Chains straight into score-picks,
// which is idempotent, so scoring lands within minutes of a final.
export async function POST(req: Request) {
  if (!checkCronSecret(req)) return err(401, 'unauthorized');
  const db = getDb();
  const nowIso = requestNow(req);

  // Games that have kicked off (or should have) and aren't resolved yet.
  const inFlight = await db.query<{ id: string; espn_event_id: string; kickoff_at: string }>(
    `select id, espn_event_id, kickoff_at from games
     where status not in ('FINAL','CANCELLED')
       and kickoff_at <= coalesce($1::timestamptz, now())
       and kickoff_at >  coalesce($1::timestamptz, now()) - interval '48 hours'`,
    [nowIso]
  );
  if (inFlight.length === 0) {
    const scoring = await runScorePicks(db, nowIso);   // catch stragglers anyway
    return json({ skipped: true, scoring });
  }

  // Fetch the ET calendar dates those games fall on (a 1pm ET Sunday game is
  // 17:00Z; ESPN's ?dates= is the US/Eastern date).
  const dates = new Set<string>();
  for (const g of inFlight) {
    const et = new Date(g.kickoff_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    dates.add(et.replace(/-/g, ''));
  }

  let updated = 0;
  for (const d of dates) {
    const sb = await fetchScoreboard({ dates: d });
    for (const g of sb.games) {
      const rows = await db.query<{ id: string }>(
        `update games
         set status = $2, home_score = $3, away_score = $4,
             winner_team_id = case
               when $2 <> 'FINAL' then winner_team_id
               when $3 > $4 then home_team_id
               when $4 > $3 then away_team_id
               else null end,                          -- tie
             completed_at = case when $2 = 'FINAL' and completed_at is null
                                 then coalesce($5::timestamptz, now()) else completed_at end
         where espn_event_id = $1 and status not in ('FINAL','CANCELLED')
         returning id`,
        [g.espnEventId, g.status, g.homeScore, g.awayScore, nowIso]
      );
      updated += rows.length;
    }
  }

  const scoring = await runScorePicks(db, nowIso);
  return json({ ok: true, games_checked: inFlight.length, updated, scoring });
}
