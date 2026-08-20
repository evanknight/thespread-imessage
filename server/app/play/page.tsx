'use client';

import { useCallback, useEffect, useState } from 'react';

// Minimal web pick flow — for testing and for anyone whose Messages drawer is
// misbehaving. Same API as the iMessage extension, token in localStorage.

const box: React.CSSProperties = { background: '#161b22', borderRadius: 10, padding: 12, marginBottom: 14 };
const btn: React.CSSProperties = {
  background: '#21262d', color: '#e6edf3', border: '1px solid #30363d', borderRadius: 8,
  padding: '8px 10px', cursor: 'pointer', minWidth: 96, fontSize: 14,
};

const fmtSpread = (v: number | null) => (v == null ? '—' : v === 0 ? 'PK' : v > 0 ? `+${v}` : `${v}`);
const fmtPts = (v: number) => (v === Math.round(v) ? String(v) : String(v));

export default function Play() {
  const [token, setToken] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [week, setWeek] = useState<any>(null);
  const [standings, setStandings] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);

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
    if (!res.ok) { setMsg(body.error ?? 'enrollment failed'); return; }
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
    if (res.status === 409) { setMsg('Too late — picks locked at first kickoff.'); return; }
    if (!res.ok) { setMsg(body.error ?? 'pick failed'); return; }
    const payout = 10 + (team.spread ?? 0) + (week.week.playoff_bonus ?? 0);
    setMsg(`${team.abbr} locked in for ${fmtPts(payout)} pts if they win ✓`);
    await load(token);
  }

  if (!token) {
    return (
      <main style={{ maxWidth: 420, margin: '0 auto', padding: 16 }}>
        <h1 style={{ fontSize: 22 }}>🏈 The Spread</h1>
        <div style={box}>
          <p style={{ fontSize: 14, color: '#8b949e' }}>Enter your enrollment code.</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. 0A1B2C3D"
            style={{ ...btn, width: '100%', marginBottom: 8, textTransform: 'uppercase' }}
          />
          <button style={{ ...btn, background: '#238636', border: 'none', width: '100%' }} onClick={enroll}>
            Enroll
          </button>
          {msg && <p style={{ color: '#f85149', fontSize: 13 }}>{msg}</p>}
        </div>
        <p style={{ fontSize: 13 }}><a href="/board" style={{ color: '#58a6ff' }}>Just want the board? →</a></p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: 16 }}>
      <h1 style={{ fontSize: 22 }}>🏈 The Spread</h1>
      <p style={{ color: '#8b949e', fontSize: 13 }}>
        Playing as <b>{name}</b> ·{' '}
        <a style={{ color: '#58a6ff', cursor: 'pointer' }} onClick={() => { localStorage.clear(); setToken(null); }}>sign out</a>
        {' '}· <a href="/board" style={{ color: '#58a6ff' }}>public board</a>
      </p>
      {msg && <div style={{ ...box, background: '#1c2a1c', color: '#7ee787' }}>{msg}</div>}

      {week && (
        <div style={box}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>
            {week.week.round === 'REG' ? `Week ${week.week.week_number}` : week.week.round}
            {week.week.locked
              ? ' · 🔒 locked'
              : ` · ${week.submitted_count} of ${week.player_count} in · locks ${week.week.lock_at ? new Date(week.week.lock_at).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' }) + ' ET' : 'TBD'}`}
          </h2>

          {week.week.locked ? (
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <tbody>
                {week.players.map((p: any) => (
                  <tr key={p.player_id}>
                    <td style={{ padding: 4 }}>{p.display_name}</td>
                    <td style={{ padding: 4 }}>{p.pick ? `${p.pick.team_abbr} ${fmtSpread(p.pick.official_spread ?? p.pick.lock_time_spread)}` : p.has_picked ? '🔒' : '—'}</td>
                    <td style={{ padding: 4, textAlign: 'right' }}>{p.pick?.outcome ? `${p.pick.total_points} (${p.pick.outcome})` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <>
              <p style={{ fontSize: 13, color: '#8b949e' }}>
                {week.my_pick ? `Your pick: ${week.my_pick.team_abbr} — tap another team to change it.` : 'Tap a team. Win = 10 + spread. They only have to win.'}
              </p>
              {week.games.map((g: any) => (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 84, fontSize: 12, color: '#8b949e' }}>
                    {new Date(g.kickoff_at).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                  </span>
                  {[g.away, g.home].map((t: any, i: number) => (
                    <button
                      key={t.team_id}
                      style={{
                        ...btn,
                        flex: 1,
                        background: week.my_pick?.team_id === t.team_id ? '#1f6feb' : btn.background,
                      }}
                      onClick={() => pick(g, t)}
                    >
                      {t.abbr} {fmtSpread(t.spread)}
                      {t.spread != null && <span style={{ opacity: 0.65 }}> → {fmtPts(10 + t.spread + (week.week.playoff_bonus ?? 0))}</span>}
                    </button>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {standings && (
        <div style={box}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>Standings · {standings.season}</h2>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <tbody>
              {standings.standings.map((s: any, i: number) => (
                <tr key={s.player_id}>
                  <td style={{ padding: 4, color: '#8b949e' }}>{i + 1}</td>
                  <td style={{ padding: 4 }}>{s.display_name}</td>
                  <td style={{ padding: 4 }}>{s.wins}–{s.losses}</td>
                  <td style={{ padding: 4, textAlign: 'right', fontWeight: 600 }}>{s.total_points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
