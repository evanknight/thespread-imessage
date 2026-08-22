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
// Lock needs the calendar date too — "Wed 8:20 PM ET" alone is ambiguous when
// the deadline is three weeks out.
const fmtLock = (iso: string) => {
  const d = new Date(iso);
  const t = d.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const day = d.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
  return `${t} ET (${day})`;
};
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

const ago = (iso: string | null) => {
  if (!iso) return 'not yet';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 90) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hr ago`;
  return `${Math.floor(secs / 86400)}d ago`;
};
const stamp = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

function DetailSheet({ detail: d, onClose }: { detail: any; onClose: () => void }) {
  if (!d) {
    return (
      <div className="scrim" onClick={onClose}>
        <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ padding: 40, textAlign: 'center' }}>
          Loading…
        </div>
      </div>
    );
  }
  const delta = d.line.delta_lock_to_kickoff;
  const effective = d.line.official?.spread ?? d.line.current?.spread;
  const head = d.result
    ? d.result.outcome === 'W'
      ? `${d.result.total_points > 0 ? '+' : ''}${d.result.total_points}`
      : d.result.outcome === 'L' ? '0' : d.result.outcome
    : `${d.potential_points ?? '—'}`;

  const lineRow = (label: string, pt: any, tag?: string) =>
    pt ? (
      <div className="sheet-row">
        <span className="k">{label} {tag && <b style={{ fontSize: 9, letterSpacing: '.08em' }}>{tag}</b>}</span>
        <span className="v">
          <span className={spreadClass(pt.spread)}>{fmtSpread(pt.spread)}</span>
          <span style={{ color: 'var(--faint)', fontWeight: 500, fontSize: 11 }}> {stamp(pt.captured_at)}</span>
        </span>
      </div>
    ) : null;

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-hero">
          <button className="sheet-close" onClick={onClose}>×</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Logo abbr={d.pick.team_abbr} size={40} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.75 }}>{d.pick.display_name}</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>
                {d.pick.team_abbr} <span className="gold">{fmtSpread(effective)}</span>
              </div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>{head}</div>
          </div>
          <div style={{ marginTop: 6, fontSize: 11, fontWeight: 800, letterSpacing: '.08em' }} className="gold">
            {d.week.round === 'REG' ? `WEEK ${d.week.week_number}` : `${d.week.round} · BONUS +${d.week.playoff_bonus}`}
          </div>
        </div>

        <div className="matchup">
          <div className="col">
            <Logo abbr={d.game.away_abbr} size={34} />
            <div style={{ fontWeight: 700 }}>{d.game.away_abbr}</div>
            <div className="sc" style={{ color: d.game.winner_abbr === d.game.away_abbr ? 'var(--green)' : undefined }}>
              {d.game.away_score ?? '–'}
            </div>
            {!d.game.picked_is_home && <span className="tag">YOUR PICK</span>}
          </div>
          <div className="mid">{d.game.status === 'FINAL' ? 'FINAL' : d.game.status === 'SCHEDULED' ? 'VS' : d.game.status}</div>
          <div className="col">
            <Logo abbr={d.game.home_abbr} size={34} />
            <div style={{ fontWeight: 700 }}>{d.game.home_abbr}</div>
            <div className="sc" style={{ color: d.game.winner_abbr === d.game.home_abbr ? 'var(--green)' : undefined }}>
              {d.game.home_score ?? '–'}
            </div>
            {d.game.picked_is_home && <span className="tag">YOUR PICK</span>}
          </div>
        </div>

        <div className="sheet-sec">The line</div>
        {lineRow('Opened', d.line.open)}
        {lineRow('At lock', d.line.at_lock)}
        {d.line.official ? lineRow('At kickoff', d.line.official, 'OFFICIAL') : lineRow('Right now', d.line.current, 'LIVE')}
        {delta != null && delta !== 0 && (
          <div className="sheet-note" style={{ color: delta > 0 ? 'var(--green)' : 'var(--red)' }}>
            {delta > 0
              ? `Moved +${delta} in your favour after lock, worth ${Math.abs(delta)} extra points.`
              : `Moved ${delta} against you after lock, costing you ${Math.abs(delta)} points.`}
          </div>
        )}
        {delta === 0 && <div className="sheet-note" style={{ color: 'var(--muted)' }}>The line never moved after lock.</div>}
        <div className="sheet-note" style={{ color: 'var(--faint)', fontSize: 11 }}>
          {d.line.sample_count} DraftKings samples recorded
        </div>

        <div className="sheet-sec">Timeline</div>
        <div className="sheet-row"><span className="k">Picked</span><span className="v">{stamp(d.pick.submitted_at)}</span></div>
        {d.pick.updated_at !== d.pick.submitted_at && (
          <div className="sheet-row">
            <span className="k">Last change{d.pick.change_count ? ` (${d.pick.change_count} switches)` : ''}</span>
            <span className="v">{stamp(d.pick.updated_at)}</span>
          </div>
        )}
        <div className="sheet-row"><span className="k">Picks locked</span><span className="v">{stamp(d.week.lock_at)}</span></div>
        <div className="sheet-row"><span className="k">Kickoff</span><span className="v">{stamp(d.game.kickoff_at)}</span></div>
        {d.result?.scored_at && (
          <div className="sheet-row"><span className="k">Scored</span><span className="v">{stamp(d.result.scored_at)}</span></div>
        )}

        <div className="sheet-sec">Scoring</div>
        {d.result ? (
          <>
            <div className="sheet-row"><span className="k">Base</span><span className="v">10</span></div>
            <div className="sheet-row"><span className="k">Spread</span><span className="v">{fmtSpread(effective)}</span></div>
            {d.week.playoff_bonus > 0 && (
              <div className="sheet-row"><span className="k">Playoff bonus</span><span className="v">+{d.week.playoff_bonus}</span></div>
            )}
            <div className="sheet-row big">
              <span className="k">{d.result.outcome === 'W' ? 'Won outright' : d.result.outcome === 'L' ? 'Did not win' : d.result.outcome}</span>
              <span className={`v ${d.result.outcome === 'W' ? 'pos' : 'neg'}`}>{d.result.total_points}</span>
            </div>
            {d.result.outcome === 'L' && (
              <div className="sheet-note" style={{ color: 'var(--faint)', fontSize: 11 }}>
                A loss or tie always scores 0. The spread only pays on an outright win.
              </div>
            )}
            {d.result.note && <div className="sheet-note" style={{ color: 'var(--red)', fontSize: 11 }}>{d.result.note}</div>}
          </>
        ) : (
          <>
            <div className="sheet-row big"><span className="k">If {d.pick.team_abbr} wins</span><span className="v pos">{d.potential_points}</span></div>
            <div className="sheet-row big"><span className="k">If they lose or tie</span><span className="v mut">0</span></div>
          </>
        )}
      </div>
    </div>
  );
}

function AccountSheet({ name, onClose, onProfile, onSignOut }: any) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-hero">
          <button className="sheet-close" onClick={onClose}>×</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="avatar" style={{ width: 40, height: 40, fontSize: 17, background: 'rgba(255,255,255,0.15)' }}>
              {(name ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <div>
              <div className="eyebrow" style={{ opacity: 0.7 }}>Signed in as</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{name}</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 16px 4px' }}>
          <button className="navchip" style={{ width: '100%', marginBottom: 8 }} onClick={onProfile}>
            View my season
          </button>
          <a className="navchip" style={{ display: 'block', width: '100%', textAlign: 'center', marginBottom: 8 }} href="/board">
            Public board
          </a>
          <button
            className="navchip"
            style={{ width: '100%', color: 'var(--red)', borderColor: 'var(--red)' }}
            onClick={onSignOut}
          >
            Sign out
          </button>
          <p style={{ fontSize: 11, color: 'var(--faint)', marginTop: 12 }}>
            Signing out here doesn't affect the iMessage app. Your enrollment code works on
            every device at once.
          </p>
        </div>
      </div>
    </div>
  );
}

function PlayerProfile({ playerId, standings, onBack, onDetail, detailNode }: any) {
  const row = standings.standings.find((s: any) => s.player_id === playerId);
  const rank = standings.standings.findIndex((s: any) => s.player_id === playerId) + 1;
  const weeks = standings.weeks
    .filter((w: any) => w.player_id === playerId)
    .sort((a: any, b: any) => b.week_number - a.week_number);

  const withPick = weeks.filter((w: any) => w.picked_team);
  const scored = withPick.filter((w: any) => w.outcome === 'W' || w.outcome === 'L');
  const pts = (w: any) => Number(w.total_points ?? 0);

  const best = scored.length ? scored.reduce((a: any, b: any) => (pts(b) > pts(a) ? b : a)) : null;
  const worst = scored.length ? scored.reduce((a: any, b: any) => (pts(b) < pts(a) ? b : a)) : null;
  const avg = scored.length ? (scored.reduce((t: number, w: any) => t + pts(w), 0) / scored.length) : null;

  const spreadOf = (w: any) => w.official_spread ?? w.lock_time_spread;
  const dogs = scored.filter((w: any) => (spreadOf(w) ?? 0) > 0);
  const favs = scored.filter((w: any) => (spreadOf(w) ?? 0) < 0);
  const recOf = (list: any[]) => `${list.filter((w) => w.outcome === 'W').length}–${list.filter((w) => w.outcome === 'L').length}`;

  const counts: Record<string, number> = {};
  for (const w of withPick) counts[w.picked_team] = (counts[w.picked_team] ?? 0) + 1;
  const favTeam = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const avgSpread = scored.length
    ? scored.reduce((t: number, w: any) => t + (spreadOf(w) ?? 0), 0) / scored.length
    : null;
  const noPicks = weeks.filter((w: any) => !w.picked_team).length;

  return (
    <main>
      <header className="hero">
        <div className="hero-inner">
          <div className="hero-title">{row?.display_name}</div>
          <div className="hero-sub">
            <span className="gold">#{rank}</span> · {row?.total_points} PTS · {row?.wins}–{row?.losses}
            {row?.streak ? <> · {row.streak}</> : null}
          </div>
        </div>
      </header>
      <div className="wrap">
        <button className="back-chip" onClick={onBack}>← Back</button>

        <div className="section-title">Season</div>
        <div className="statgrid">
          <div className="stat">
            <div className="lab">Avg / pick</div>
            <div className="val">{avg != null ? avg.toFixed(1) : '—'}</div>
            <div className="sub">{scored.length} scored week{scored.length === 1 ? '' : 's'}</div>
          </div>
          <div className="stat">
            <div className="lab">Avg spread taken</div>
            <div className="val">{avgSpread != null ? fmtSpread(Number(avgSpread.toFixed(1))) : '—'}</div>
            <div className="sub">{dogs.length} dogs · {favs.length} favs</div>
          </div>
          <div className="stat">
            <div className="lab">Best week</div>
            <div className="val pos">{best ? `+${best.total_points}` : '—'}</div>
            <div className="sub">{best ? `${best.picked_team} · Week ${best.week_number}` : 'no results yet'}</div>
          </div>
          <div className="stat">
            <div className="lab">Worst week</div>
            <div className="val neg">{worst ? worst.total_points : '—'}</div>
            <div className="sub">{worst ? `${worst.picked_team} · Week ${worst.week_number}` : 'no results yet'}</div>
          </div>
          <div className="stat">
            <div className="lab">As underdog</div>
            <div className="val">{recOf(dogs)}</div>
            <div className="sub">picking teams getting points</div>
          </div>
          <div className="stat">
            <div className="lab">As favourite</div>
            <div className="val">{recOf(favs)}</div>
            <div className="sub">picking teams laying points</div>
          </div>
          <div className="stat">
            <div className="lab">Most picked</div>
            <div className="val">{favTeam ? favTeam[0] : '—'}</div>
            <div className="sub">{favTeam ? `${favTeam[1]}×` : 'no picks yet'}</div>
          </div>
          <div className="stat">
            <div className="lab">Missed weeks</div>
            <div className="val">{noPicks}</div>
            <div className="sub">no pick submitted</div>
          </div>
        </div>

        <div className="section-title">Every pick</div>
        <div className="panel">
          {weeks.length === 0 && (
            <div className="row"><span className="mut">Nothing until the first week locks.</span></div>
          )}
          {weeks.map((w: any) => (
            <div className="row" key={w.week_id}>
              <span className="rank" style={{ fontSize: 11 }}>{w.round === 'REG' ? w.week_number : w.round}</span>
              <span className="pickcell">
                <Logo abbr={w.picked_team} size={22} />
                {w.picked_team ?? <span className="mut">no pick</span>}
                {w.picked_team && (
                  <span className={spreadClass(spreadOf(w))}>{fmtSpread(spreadOf(w))}</span>
                )}
              </span>
              <span className="score">
                {w.home_score != null
                  ? `${w.away_abbr} ${w.away_score}–${w.home_score} ${w.home_abbr}${w.game_status === 'FINAL' ? ' F' : ''}`
                  : ''}
              </span>
              <span className={`pts ${w.outcome === 'W' ? 'pos' : w.outcome ? 'neg' : 'mut'}`}>
                {!w.picked_team ? '0' : w.outcome ? `${w.total_points}` : 'pending'}
              </span>
              {w.pick_id && (
                <button className="info-btn" onClick={() => onDetail(w.pick_id)} aria-label="Details">ⓘ</button>
              )}
            </div>
          ))}
        </div>
      </div>
      {detailNode}
    </main>
  );
}

export default function Play() {
  const [token, setToken] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [week, setWeek] = useState<any>(null);
  const [standings, setStandings] = useState<any>(null);
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);

  useEffect(() => {
    if (!detailId || !token) { setDetail(null); return; }
    let live = true;
    fetch(`/api/pick/${detailId}`, { headers: { authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live) setDetail(d); });
    return () => { live = false; };
  }, [detailId, token]);

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

  async function removePick() {
    if (!token || !week) return;
    setMsg(null);
    const res = await fetch('/api/pick', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ week_id: week.week.id }),
    });
    if (res.status === 409) { setMsg({ text: 'Too late, picks locked at first kickoff.', kind: 'err' }); return; }
    if (!res.ok) { setMsg({ text: 'Could not clear the pick.', kind: 'err' }); return; }
    setMsg({ text: "Pick cleared. You're not in this week yet.", kind: 'ok' });
    await load(token);
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
    if (res.status === 409) { setMsg({ text: 'Too late, picks locked at first kickoff.', kind: 'err' }); return; }
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
          <nav className="navchips">
            <span className="navchip active">Log in</span>
            <a className="navchip" href="/board">Public board</a>
          </nav>
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
            {week.week.lock_at ? fmtLock(week.week.lock_at) : 'TBD'}
          </>}
    </>
  ) : undefined;

  if (profileId && standings) {
    return (
      <PlayerProfile
        playerId={profileId}
        standings={standings}
        onBack={() => setProfileId(null)}
        onDetail={(id: string) => setDetailId(id)}
        detailNode={detailId ? <DetailSheet detail={detail} onClose={() => setDetailId(null)} /> : null}
      />
    );
  }

  return (
    <main>
      <Hero sub={heroSub} />
      <div className={`wrap${showBar ? ' has-bar' : ''}`}>
        <nav className="navchips">
          <span className="navchip active">My picks</span>
          <a className="navchip" href="/board">Public board</a>
          <button className="navchip account" onClick={() => setAccountOpen(true)}>
            <span className="avatar">{(name ?? '?').slice(0, 1).toUpperCase()}</span>
            {name}
          </button>
        </nav>
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
                  {p.pick?.pick_id && (
                    <button className="info-btn" onClick={() => setDetailId(p.pick.pick_id)} aria-label="Details">ⓘ</button>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="section-title">
              {week.my_pick ? 'Tap another team to change your pick' : 'Tap a team. Win = 10 + spread'}
            </div>
            <div className="freshness">
              ↻ DraftKings lines updated {ago(week.lines_updated_at)}
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
                          onClick={() => (week.my_pick?.team_id === t.team_id ? removePick() : pick(g, t))}
                          title={week.my_pick?.team_id === t.team_id ? 'Click to clear your pick' : undefined}
                        >
                          {week.my_pick?.team_id === t.team_id && <span className="tile-x">✕</span>}
                          <Logo abbr={t.abbr} size={46} />
                          <span className="tile-info">
                            <span className="tile-abbr">{t.abbr}</span>
                            <span className="tile-nick">
                              {week.my_pick?.team_id === t.team_id ? 'CLICK TO CLEAR' : nickname(t.name)}
                            </span>
                            <span className="tile-line">
                              <span className={spreadClass(t.spread)}>{fmtSpread(t.spread)}</span>
                              {t.spread != null && (
                                <span className="payout"> → {fmtPts(10 + t.spread + bonus)}</span>
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
                <div className="row tappable" key={s.player_id} onClick={() => setProfileId(s.player_id)}>
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
                        {w.pick_id && (
                          <button className="info-btn" onClick={() => setDetailId(w.pick_id)} aria-label="Details">ⓘ</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {accountOpen && (
        <AccountSheet
          name={name}
          onClose={() => setAccountOpen(false)}
          onProfile={() => {
            setAccountOpen(false);
            const me = standings?.standings.find((s: any) => s.display_name === name);
            if (me) setProfileId(me.player_id);
          }}
          onSignOut={() => { localStorage.clear(); setToken(null); setAccountOpen(false); }}
        />
      )}

      {detailId && (
        <DetailSheet detail={detail} onClose={() => setDetailId(null)} />
      )}

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
