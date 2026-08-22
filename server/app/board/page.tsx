import { getDb } from '@/lib/db';
import { buildWeekPayload, currentWeekId } from '@/lib/weeks';
import { num } from '@/lib/http';
import BoardCta from './BoardCta';

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
        `select display_name, total_points, wins, losses, streak from season_standings
         where season_id = $1 order by total_points desc, wins desc, display_name`,
        [season[0].id]
      )
    : [];

  const fmtSpread = (v: number | null) => (v == null ? '—' : v === 0 ? 'PK' : v > 0 ? `+${v}` : `${v}`);
  const spreadClass = (v: number | null) => (v == null || v === 0 ? 'mut' : v > 0 ? 'pos' : 'neg');
  const fmtKick = (iso: string) =>
    new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const fmtLock = (iso: string) => {
    const d = new Date(iso);
    const t = d.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' });
    const day = d.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
    return `${t} ET (${day})`;
  };
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <main>
      <header className="hero">
        <div className="hero-inner">
          <div className="hero-row">
            <div>
              <div className="hero-title">🏈 The Spread</div>
              <div className="hero-sub-placeholder" />
            </div>
            <BoardCta />
          </div>
          <div className="hero-sub">
            {season[0] && <span className="gold">Season {season[0].year}</span>}
            {week && (
              <>
                {' · '}{week.week.round === 'REG' ? `Week ${week.week.week_number}` : week.week.round}
                {week.week.locked
                  ? ' · 🔒 Locked'
                  : ` · ${week.submitted_count} of ${week.player_count} in${week.week.lock_at ? ` · locks ${fmtLock(week.week.lock_at)}` : ''}`}
              </>
            )}
          </div>
        </div>
      </header>

      <div className="wrap">
        <nav className="navchips">
          <a className="navchip" href="/play">My picks</a>
          <span className="navchip active">Public board</span>
        </nav>
        <div className="section-title">Standings</div>
        <div className="panel">
          {standings.map((s: any, i: number) => (
            <div className="row" key={s.display_name}>
              <span className="rank">{medals[i] ?? i + 1}</span>
              <span className="name">{s.display_name}</span>
              <span className="wl">{s.wins}–{s.losses}</span>
              {s.streak && <span className={`chip ${s.streak.startsWith('W') ? 'w' : 'l'}`}>{s.streak}</span>}
              <span className="pts">{num(s.total_points)}</span>
            </div>
          ))}
        </div>

        {week && (
          <>
            <div className="section-title">
              {week.week.locked ? "This week's picks" : "Who's in"}
            </div>
            <div className="panel">
              {week.players.map((p: any) => (
                <div className="row" key={p.player_id}>
                  <span className="name">{p.display_name}</span>
                  {p.pick ? (
                    <span className="pickcell">
                      <img src={`/logos/${p.pick.team_abbr}.png`} width={24} height={24} alt="" />
                      {p.pick.team_abbr}
                      <span className={spreadClass(p.pick.official_spread ?? p.pick.lock_time_spread)}>
                        {fmtSpread(p.pick.official_spread ?? p.pick.lock_time_spread)}
                      </span>
                    </span>
                  ) : (
                    <span className="pickcell mut">{p.has_picked ? '🔒 in' : '—'}</span>
                  )}
                  <span className={`pts ${p.pick?.outcome === 'W' ? 'pos' : p.pick?.outcome ? 'neg' : 'mut'}`}>
                    {p.pick?.outcome ? `${num(p.pick.total_points)} ${p.pick.outcome}` : ''}
                  </span>
                </div>
              ))}
            </div>

            <div className="section-title">Games</div>
            <div className="panel">
              {week.games.map((g: any) => (
                <div className="row sm" key={g.id}>
                  <span className="pickcell">
                    <img src={`/logos/${g.away.abbr}.png`} width={20} height={20} alt="" />
                    {g.away.abbr} @ {g.home.abbr}
                    <img src={`/logos/${g.home.abbr}.png`} width={20} height={20} alt="" />
                  </span>
                  <span className="name" style={{ textAlign: 'right', fontWeight: 500, fontSize: 12, color: 'var(--muted)' }}>
                    {fmtKick(g.kickoff_at)}
                  </span>
                  <span className="score">
                    {g.status === 'SCHEDULED'
                      ? (g.home.spread != null ? `${g.home.abbr} ${fmtSpread(g.home.spread)}` : '—')
                      : `${g.away.score ?? ''}–${g.home.score ?? ''}${g.status === 'FINAL' ? ' F' : ''}`}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="footer-note">
          Picks stay hidden until the week locks. Your team only has to win.
        </p>
      </div>
    </main>
  );
}
