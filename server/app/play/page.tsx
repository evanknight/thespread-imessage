'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

// Minimal web pick flow — for testing and for anyone whose Messages drawer is
// misbehaving. Same API as the iMessage extension, token in localStorage.

const fmtSpread = (v: number | null) => (v == null ? '—' : v === 0 ? 'PK' : v > 0 ? `+${v}` : `${v}`);
const fmtPts = (v: number) => (v === Math.round(v) ? String(Math.round(v)) : String(v));
const spreadClass = (v: number | null) => (v == null || v === 0 ? 'mut' : v > 0 ? 'pos' : 'neg');
const fmtKick = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' });
const weekLabel = (w: any) => (w.round === 'REG' ? `Week ${w.week_number}` : w.round);

const Logo = ({ abbr, size = 22 }: { abbr: string | null; size?: number }) =>
  abbr ? <img src={`/logos/${abbr}.png`} width={size} height={size} alt={abbr} /> : null;
const nickname = (full: string) => (full.split(' ').pop() ?? full).toUpperCase();

function Hero({ sub }: { sub?: ReactNode }) {
  return (
    <header className="hero">
      <div className="hero-inner">
        <div className="hero-title">🏈 The Spread</div>
        {sub && <div className="hero-sub">{sub}</div>}
      </div>
    </header>
  );
}

export default function Play() {
  const [token, setToken] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [week, setWeek] = useState<any>(null);
  const [standings, setStandings] = useState<any>(null);
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);

  useEffect(() => {
    setToken(localStorage.getItem('spread_token'));
    setName(localStorage.getItem('spread_name'));
  }, []);

  const load = useCallback(async (tok: string) => {
    const headers = { authorization: `Bearer ${tok}` };
    const [w, s] = await Promise.all([
      fetch('/api/week/current', { headers }),
      fetch('/api/standings', { headers }),
    ]);
    if (w.status === 401) { localStorage.removeItem('spread_token'); setToken(null); return; }
    setWeek(await w.json());
    if (s.ok) setStandings(await s.json());
  }, []);

  useEffect(() => { if (token) load(token); }, [token, load]);

  async function enroll() {
    setMsg(null);
    const res = await fetch('/api/enroll', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: code.trim() }),
    });
    const body = await res.json();
    if (!res.ok) { setMsg({ text: body.error ?? 'enrollment failed', kind: 'err' }); return; }
    localStorage.setItem('spread_token', body.token);
    localStorage.setItem('spread_name', body.display_name);
    setToken(body.token);
    setName(body.display_name);
  }

  async function pick(game: any, team: any) {
    if (!token || !week) return;
    setMsg(null);
    const res = await fetch('/api/pick', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ week_id: week.week.id, game_id: game.id, team_id: team.team_id }),
    });
    const body = await res.json();
    if (res.status === 409) { setMsg({ text: 'Too late — picks locked at first kickoff.', kind: 'err' }); return; }
    if (!res.ok) { setMsg({ text: body.error ?? 'pick failed', kind: 'err' }); return; }
    const payout = 10 + (team.spread ?? 0) + (week.week.playoff_bonus ?? 0);
    setMsg({ text: `${team.abbr} locked in for ${fmtPts(payout)} pts if they win ✓`, kind: 'ok' });
    await load(token);
  }

  // ---------- enroll screen ----------
  if (!token) {
    return (
      <main>
        <Hero sub={<>Private NFL pick’em · <span className="gold">5 players</span></>} />
        <div className="wrap">
          <div className="section-title">Join the game</div>
          <div className="panel" style={{ padding: 16 }}>
            <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--muted)' }}>
              Enter your enrollment code.
            </p>
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. 0A1B2C3D"
            />
            <button className="btn" onClick={enroll}>Enroll</button>
            {msg && <div className={`toast ${msg.kind}`}>{msg.text}</div>}
          </div>
          <p className="footer-note"><a href="/board">Just want the board? →</a></p>
        </div>
      </main>
    );
  }

  // ---------- main screen ----------
  const bonus = week?.week?.playoff_bonus ?? 0;
  const myTeam = week?.my_pick
    ? week.games?.flatMap((g: any) => [g.away, g.home]).find((t: any) => t.team_id === week.my_pick.team_id)
    : null;
  const myPayout = myTeam && myTeam.spread != null ? 10 + myTeam.spread + bonus : null;
  const showBar = Boolean(week?.my_pick);

  const heroSub = week ? (
    <>
      <span className="gold">{weekLabel(week.week)}</span>
      {week.week.locked
        ? <> · 🔒 Locked</>
        : <>
            {' · '}{week.submitted_count} of {week.player_count} in
            {' · locks '}
            {week.week.lock_at ? `${fmtKick(week.week.lock_at)} ET` : 'TBD'}
          </>}
    </>
  ) : undefined;

  return (
    <main>
      <Hero sub={heroSub} />
      <div className={`wrap${showBar ? ' has-bar' : ''}`}>
        <p className="meta">
          Playing as <b style={{ color: 'var(--text)' }}>{name}</b> ·{' '}
          <a className="linklike" onClick={() => { localStorage.clear(); setToken(null); }}>sign out</a>
          {' '}· <a href="/board">public board</a>
        </p>
        {msg && <div className={`toast ${msg.kind}`}>{msg.text}</div>}

        {week && (week.week.locked ? (
          <>
            <div className="section-title">This week’s picks</div>
            <div className="panel">
              {week.players.map((p: any) => (
                <div className="row" key={p.player_id}>
                  <span className="name">{p.display_name}</span>
                  {p.pick ? (
                    <span className="pickcell">
                      <Logo abbr={p.pick.team_abbr} size={24} />
                      {p.pick.team_abbr}
                      <span className={spreadClass(p.pick.official_spread ?? p.pick.lock_time_spread)}>
                        {fmtSpread(p.pick.official_spread ?? p.pick.lock_time_spread)}
                      </span>
                    </span>
                  ) : (
                    <span className="pickcell mut">{p.has_picked ? '🔒 in' : '—'}</span>
                  )}
                  <span className={`pts ${p.pick?.outcome === 'W' ? 'pos' : p.pick?.outcome ? 'neg' : 'mut'}`}>
                    {p.pick?.outcome ? `${p.pick.total_points} ${p.pick.outcome}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="section-title">
              {week.my_pick ? 'Tap another team to change your pick' : 'Tap a team — win = 10 + spread'}
            </div>
            <div className="panel">
              {week.games.map((g: any) => (
                <div className="game" key={g.id}>
                  <div className="game-time">{fmtKick(g.kickoff_at)} ET</div>
                  <div className="game-tiles">
                    {[g.away, g.home].map((t: any, i: number) => (
                      <>
                        {i === 1 && <span className="at" key={`at-${g.id}`}>@</span>}
                        <button
                          key={t.team_id}
                          className={`tile${week.my_pick?.team_id === t.team_id ? ' selected' : ''}`}
                          onClick={() => pick(g, t)}
                        >
                          <Logo abbr={t.abbr} size={36} />
                          <span className="tile-info">
                            <span className="tile-abbr">{t.abbr}</span>
                            <span className="tile-nick">{nickname(t.name)}</span>
                            <span className="tile-line">
                              <span className={spreadClass(t.spread)}>{fmtSpread(t.spread)}</span>
                              {t.spread != null && (
                                <span className="payout"> → {fmtPts(10 + t.spread + bonus)} pts</span>
                              )}
                            </span>
                          </span>
                        </button>
                      </>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ))}

        {standings && (
          <>
            <div className="section-title">Standings · {standings.season}</div>
            <div className="panel">
              {standings.standings.map((s: any, i: number) => (
                <div className="row" key={s.player_id}>
                  <span className="rank">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
                  <span className="name">{s.display_name}</span>
                  <span className="wl">{s.wins}–{s.losses}</span>
                  {s.streak && <span className={`chip ${s.streak.startsWith('W') ? 'w' : 'l'}`}>{s.streak}</span>}
                  <span className="pts">{s.total_points}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {standings && standings.weeks.length > 0 && (
          <>
            <div className="section-title">History</div>
            {Array.from(new Set(standings.weeks.map((w: any) => w.week_number))).map((wn: any) => {
              const wk = standings.weeks.find((w: any) => w.week_number === wn);
              return (
                <div key={wn}>
                  <div className="section-title" style={{ marginTop: 14 }}>
                    {wk?.round === 'REG' ? `Week ${wn}` : wk?.round}
                  </div>
                  <div className="panel">
                    {standings.weeks.filter((w: any) => w.week_number === wn).map((w: any) => (
                      <div className="row sm" key={w.player_id + String(wn)}>
                        <span className="name">{w.display_name}</span>
                        <span className="pickcell">
                          <Logo abbr={w.picked_team} size={20} />
                          {w.picked_team ?? '—'}
                          {w.picked_team && (
                            <span className={spreadClass(w.official_spread ?? w.lock_time_spread)}>
                              {fmtSpread(w.official_spread ?? w.lock_time_spread)}
                            </span>
                          )}
                        </span>
                        <span className="score">
                          {w.home_score != null
                            ? `${w.away_abbr} ${w.away_score}–${w.home_score} ${w.home_abbr}${w.game_status === 'FINAL' ? ' F' : ''}`
                            : ''}
                        </span>
                        <span className={`pts ${w.outcome === 'W' ? 'pos' : w.outcome ? 'neg' : 'mut'}`}>
                          {!w.picked_team ? '0' : w.outcome ? `${w.total_points} ${w.outcome}` : 'pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {showBar && week?.my_pick && (
        <div className="pickbar">
          <div className="pickbar-inner">
            <Logo abbr={week.my_pick.team_abbr} size={34} />
            <div style={{ minWidth: 0 }}>
              <div className="pickbar-label">Your pick</div>
              <div className="pickbar-main">
                {week.my_pick.team_abbr}
                {myTeam && myTeam.spread != null && <> {fmtSpread(myTeam.spread)}</>}
                {myPayout != null && <span className="gold"> → {fmtPts(myPayout)} pts</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
