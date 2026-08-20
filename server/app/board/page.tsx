import { getDb } from '@/lib/db';
import { buildWeekPayload, currentWeekId } from '@/lib/weeks';
import { num } from '@/lib/http';

export const dynamic = 'force-dynamic';

// Read-only public board — the escape hatch when the Messages drawer misbehaves.
// Passes callerPlayerId=null, so the SQL lock filter hides EVERY pick until lock.
export default async function Board() {
  const db = getDb();
  const weekId = await currentWeekId(db);
  const week = weekId ? await buildWeekPayload(db, weekId, null, null) : null;

  const season = await db.query<any>('select id, year from seasons order by year desc limit 1');
  const standings = season[0]
    ? await db.query<any>(
        `select display_name, total_points, wins, losses from season_standings
         where season_id = $1 order by total_points desc, wins desc, display_name`,
        [season[0].id]
      )
    : [];

  const fmt = (v: number | null) => (v == null ? '—' : v > 0 ? `+${v}` : `${v}`);
  const cell: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid #21262d', textAlign: 'left' };

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 16 }}>
      <h1 style={{ fontSize: 22 }}>🏈 The Spread{season[0] ? ` — ${season[0].year}` : ''}</h1>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Standings</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr><th style={cell}>Player</th><th style={cell}>Pts</th><th style={cell}>W–L</th></tr></thead>
        <tbody>
          {standings.map((s: any) => (
            <tr key={s.display_name}>
              <td style={cell}>{s.display_name}</td>
              <td style={cell}>{num(s.total_points)}</td>
              <td style={cell}>{s.wins}–{s.losses}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {week && (
        <>
          <h2 style={{ fontSize: 16, marginTop: 24 }}>
            Week {week.week.week_number}{week.week.round !== 'REG' ? ` (${week.week.round})` : ''} ·{' '}
            {week.week.locked ? 'LOCKED' : `${week.submitted_count} of ${week.player_count} in`}
          </h2>
          {week.week.lock_at && !week.week.locked && (
            <p style={{ color: '#8b949e', fontSize: 13 }}>
              Picks lock at first kickoff: {new Date(week.week.lock_at).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET
            </p>
          )}
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr><th style={cell}>Player</th><th style={cell}>Pick</th><th style={cell}>Lock line</th><th style={cell}>Final line</th><th style={cell}>Pts</th></tr></thead>
            <tbody>
              {week.players.map((p: any) => (
                <tr key={p.player_id}>
                  <td style={cell}>{p.display_name}</td>
                  <td style={cell}>{p.pick ? p.pick.team_abbr : p.has_picked ? '🔒 in' : '—'}</td>
                  <td style={cell}>{p.pick ? fmt(p.pick.lock_time_spread) : ''}</td>
                  <td style={cell}>{p.pick ? fmt(p.pick.official_spread) : ''}</td>
                  <td style={cell}>{p.pick?.outcome ? `${num(p.pick.total_points)} (${p.pick.outcome})` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 style={{ fontSize: 16, marginTop: 24 }}>Games</h2>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr><th style={cell}>Matchup</th><th style={cell}>Kickoff (ET)</th><th style={cell}>Line</th><th style={cell}>Score</th></tr></thead>
            <tbody>
              {week.games.map((g: any) => (
                <tr key={g.id}>
                  <td style={cell}>{g.away.abbr} @ {g.home.abbr}</td>
                  <td style={cell}>{new Date(g.kickoff_at).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                  <td style={cell}>{g.home.spread != null ? `${g.home.abbr} ${fmt(g.home.spread)}` : '—'}</td>
                  <td style={cell}>{g.status === 'SCHEDULED' ? '' : `${g.away.score ?? ''}–${g.home.score ?? ''} ${g.status === 'FINAL' ? 'F' : g.status}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p style={{ color: '#484f58', fontSize: 12, marginTop: 32 }}>Picks stay hidden until the week locks. Your team only has to win.</p>
    </main>
  );
}
