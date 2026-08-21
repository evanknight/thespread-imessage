import type { ReactNode } from 'react';
import type { Viewport } from 'next';

export const metadata = {
  title: 'The Spread',
  description: 'Private NFL pick’em — pick a winner, win the spread.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0d4020',
};

const css = `
:root {
  color-scheme: light dark;
  --condensed: "Avenir Next Condensed", "Helvetica Neue Condensed", "Arial Narrow", "Roboto Condensed", "Liberation Sans Narrow", sans-serif;
  --field-grad: linear-gradient(160deg, #0d4020 0%, #093018 52%, #051f10 100%);
  --yard-lines: repeating-linear-gradient(90deg, rgba(255,255,255,0.055) 0px, rgba(255,255,255,0.055) 2px, transparent 2px, transparent 46px);
  --gold: #ffd64d;
  --blue: #1f6feb;

  --bg: #f5f6f3;
  --surface: #ffffff;
  --text: #16211a;
  --muted: #5f6b64;
  --faint: #98a29b;
  --divider: rgba(22, 51, 33, 0.10);
  --tile-bg: #f3f4f1;
  --tile-border: rgba(22, 51, 33, 0.14);
  --green: #167a3d;
  --red: #cf222e;
  --green-soft: rgba(22, 122, 61, 0.12);
  --red-soft: rgba(207, 34, 46, 0.10);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0c110e;
    --surface: #141a16;
    --text: #e8ede9;
    --muted: #93a29a;
    --faint: #6b7a72;
    --divider: rgba(230, 255, 238, 0.09);
    --tile-bg: #1b231e;
    --tile-border: rgba(230, 255, 238, 0.13);
    --green: #3fb950;
    --red: #f47067;
    --green-soft: rgba(63, 185, 80, 0.16);
    --red-soft: rgba(244, 112, 103, 0.14);
  }
}

* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  line-height: 1.45;
}
a { color: var(--blue); text-decoration: none; }
a:hover { text-decoration: underline; }
button { font: inherit; }
img { vertical-align: middle; }

/* ------- field hero ------- */
.hero {
  background-image: var(--yard-lines), var(--field-grad);
  color: #fff;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.hero-inner {
  max-width: 560px;
  margin: 0 auto;
  padding: calc(20px + env(safe-area-inset-top)) 18px 16px;
}
.hero-title {
  font-family: var(--condensed);
  font-stretch: condensed;
  text-transform: uppercase;
  font-weight: 800;
  font-size: 30px;
  line-height: 1.1;
  letter-spacing: 0.03em;
  color: #fff;
}
.hero-sub {
  margin-top: 6px;
  font-family: var(--condensed);
  font-stretch: condensed;
  text-transform: uppercase;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.82);
}
.gold { color: var(--gold); }

/* ------- page scaffold ------- */
.wrap { max-width: 560px; margin: 0 auto; padding: 0 14px 48px; }
.wrap.has-bar { padding-bottom: 132px; }
.meta { margin: 14px 2px 0; font-size: 13px; color: var(--muted); }
.linklike { color: var(--blue); cursor: pointer; }
.section-title {
  margin: 24px 4px 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--muted);
}
.panel {
  background: var(--surface);
  border: 1px solid var(--divider);
  border-radius: 16px;
  overflow: hidden;
}
.toast {
  margin: 14px 0 0;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
}
.toast.ok { background: var(--green-soft); color: var(--green); }
.toast.err { background: var(--red-soft); color: var(--red); }

/* ------- flat rows ------- */
.row { display: flex; align-items: center; gap: 10px; padding: 11px 14px; }
.row.sm { padding: 8px 14px; font-size: 13px; }
.row + .row, .game + .game { border-top: 1px solid var(--divider); }
.rank { flex: none; width: 28px; text-align: center; font-size: 15px; font-weight: 700; color: var(--muted); }
.name {
  flex: 1 1 auto; min-width: 0;
  font-weight: 600; font-size: 15px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.row.sm .name { font-size: 13px; }
.wl { flex: none; font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; }
.chip {
  flex: none; min-width: 36px; text-align: center;
  padding: 2px 8px; border-radius: 999px;
  font-size: 12px; font-weight: 800;
}
.chip.w { background: var(--green-soft); color: var(--green); }
.chip.l { background: var(--red-soft); color: var(--red); }
.pts {
  flex: none; min-width: 44px; text-align: right;
  font-weight: 800; font-size: 15px; font-variant-numeric: tabular-nums;
}
.row.sm .pts { font-size: 13px; font-weight: 700; }
.pos { color: var(--green); }
.neg { color: var(--red); }
.mut { color: var(--muted); font-weight: 500; }
.pickcell { flex: none; display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 13px; }
.subline { display: block; font-size: 11px; font-weight: 500; color: var(--faint); }
.score { flex: none; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }

/* ------- game list + team tiles ------- */
.game { padding: 12px; }
.game-time { margin: 0 2px 8px; font-size: 12px; font-weight: 600; color: var(--muted); }
.game-tiles { display: flex; align-items: stretch; gap: 8px; }
.at { flex: none; align-self: center; font-size: 12px; font-weight: 700; color: var(--faint); }
.tile {
  flex: 1 1 0; min-width: 0;
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  background: var(--tile-bg);
  border: 1px solid var(--tile-border);
  border-radius: 14px;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  transition: transform 0.06s ease, background-color 0.12s ease, border-color 0.12s ease;
}
.tile:active { transform: scale(0.97); }
.tile.selected {
  background: var(--text);
  border-color: var(--text);
  color: var(--bg);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
}
.tile img { flex: none; }
.tile-info { min-width: 0; display: flex; flex-direction: column; }
.tile-abbr { font-weight: 800; font-size: 15px; letter-spacing: 0.02em; line-height: 1.2; }
.tile-nick {
  font-size: 9px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--faint); line-height: 1.3;
}
.tile.selected .tile-nick { color: rgba(255, 255, 255, 0.75); }
.tile-line { font-size: 12.5px; font-weight: 600; white-space: nowrap; }
.payout { color: var(--muted); font-weight: 600; }
.tile.selected .pos, .tile.selected .neg, .tile.selected .mut { color: var(--bg); }
.tile.selected .payout { color: var(--bg); opacity: 0.8; }
.tile.selected .tile-nick { color: var(--bg); opacity: 0.75; }

/* ------- fixed pick bar ------- */
.pickbar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 40;
  padding: 0 12px calc(12px + env(safe-area-inset-bottom));
  pointer-events: none;
}
.pickbar-inner {
  pointer-events: auto;
  max-width: 536px; margin: 0 auto;
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px;
  border-radius: 16px;
  color: #fff;
  background-image: var(--yard-lines), var(--field-grad);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 12px 32px rgba(3, 20, 10, 0.45);
}
.pickbar-label {
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: rgba(255, 255, 255, 0.65);
}
.pickbar-main { font-size: 16px; font-weight: 800; line-height: 1.25; }

/* ------- forms ------- */
.input {
  width: 100%;
  padding: 13px 14px;
  border-radius: 12px;
  border: 1px solid var(--tile-border);
  background: var(--tile-bg);
  color: var(--text);
  font-size: 17px; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase;
  outline: none;
}
.input:focus { border-color: var(--blue); }
.input::placeholder { color: var(--faint); font-weight: 500; letter-spacing: 0.06em; text-transform: none; }
.btn {
  display: block; width: 100%;
  margin-top: 10px; padding: 13px 14px;
  border: none; border-radius: 12px;
  background-image: var(--field-grad);
  color: #fff;
  font-size: 15px; font-weight: 800;
  letter-spacing: 0.06em; text-transform: uppercase;
  cursor: pointer;
}
.btn:active { transform: scale(0.98); }

.footer-note { margin-top: 28px; font-size: 12.5px; color: var(--faint); text-align: center; }

/* ------- nav chips + hero CTA ------- */
.hero-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.cta-gold {
  display: inline-block; flex: none;
  padding: 10px 16px; border-radius: 999px;
  background: var(--gold); color: #1a1500;
  font-weight: 800; font-size: 13px;
  letter-spacing: 0.05em; text-transform: uppercase;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
}
a.cta-gold:hover { text-decoration: none; filter: brightness(1.05); }
.navchips { display: flex; gap: 8px; margin: 14px 0 2px; }
.navchip {
  padding: 9px 16px; border-radius: 999px;
  background: var(--tile-bg); border: 1px solid var(--tile-border);
  color: var(--text); font-weight: 700; font-size: 14px;
}
.navchip.active { background: var(--text); border-color: var(--text); color: var(--bg); }
a.navchip:hover { text-decoration: none; }
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <style dangerouslySetInnerHTML={{ __html: css }} />
        {children}
      </body>
    </html>
  );
}
