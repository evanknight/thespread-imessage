# 🏈 The Spread

Private iMessage app for a 5-player season-long NFL pick'em league. One pick per
player per week. **Your team only has to WIN — the spread is the payout, not a
condition.**

```
points = 10 + signed_spread_for_picked_team + playoff_bonus   (picked team wins outright)
points = 0                                                    (loss or tie; tie counts as L)
```

Negative totals are real: a −10.5 favorite that wins scores −0.5. No pushes, no clamps.

## The two timing rules

- **Rule A — locking:** picks lock for everyone at the week's FIRST kickoff
  (`lock_at = MIN(kickoff_at)`, recomputed daily until lock). Change your pick as
  often as you like before that.
- **Rule B — pricing:** your official spread is the DraftKings line snapshotted
  right before **your picked game's own kickoff** — not the line at lock. The
  line at lock is stored too and always shown next to the final line.

## Layout

```
server/       Next.js (App Router) API + web board — deploys to Vercel
  app/api/          routes (enroll, pick, week/current, standings, history, admin, cron/*)
  lib/              scoring, lock logic, ESPN + Odds API adapters
  supabase/         migrations (schema, team seed, views) + pg_cron setup
  tests/            §11 acceptance suite — vitest + in-process Postgres (PGlite)
The Spread/   Xcode project — host app + iMessage extension (its own git repo)
```

## Server: first-time setup

1. **Supabase**: create a project. Grab the transaction-pooler connection string.
2. `cd server && cp .env.example .env.local`, fill in `DATABASE_URL` (the other
   secrets are already generated in the existing `.env.local`).
3. `npm install && npm run migrate` — applies schema, 32-team seed, views.
4. `node scripts/seed-players.mjs Evan <four more names>` — prints each player's
   enrollment code ONCE. Text them out.
5. **Vercel**: `vercel deploy` from `server/`, then set `DATABASE_URL`,
   `ODDS_API_KEY`, `CRON_SECRET`, `ADMIN_SECRET` in project env settings.
   Leave `DEBUG_MODE` unset in production.
6. **Scheduling**: enable `pg_cron` + `pg_net` extensions in Supabase, then run
   `server/supabase/pg_cron.sql` in the SQL editor with the placeholders filled
   in (Vercel domain + `CRON_SECRET`). Vercel Hobby cron only runs ~daily, hence
   pg_cron.
7. First sync (ESPN still shows preseason until ~Labor Day, so pre-sync Week 1):

   ```
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
     "https://<app>.vercel.app/api/cron/sync-schedule?year=2026&seasontype=2&week=1"
   ```

8. Point the iOS app at the deployment: edit `defaultBaseURL` in
   `The Spread/Shared/SpreadConfig.swift` (or set `api_base_url` in the app-group
   defaults via the host app for ad-hoc testing).

Tests: `cd server && npm test` — the full §11 acceptance list runs against real
SQL in an in-process Postgres. Lock/reveal/scoring paths are driven by the
`X-Debug-Now` header, honored only when `DEBUG_MODE=true`.

## iOS

Open `The Spread/The Spread.xcodeproj`. Both targets share the app group
`group.evanknight.thespread` (first build on a fresh machine: let Xcode's
automatic signing register the app group; if it complains, toggle the App Groups
capability once in Signing & Capabilities for each target).

- Host app: enrollment, board/standings/history fallback, setup walkthrough.
- Messages extension: the product. Compact = status; expanded = pick list before
  lock, full board + standings + history after.
- The message bubble carries ONLY opaque ids in its URL. Picks live server-side
  and other players' picks come back `null` until lock — filtered in SQL.
- One `MSSession` per week: submissions update a single bubble in place.
- Extensions can't send messages: submitting stages the bubble, the player taps send.

## Distribution (TestFlight, forever)

**Step 0 — you need the paid Apple Developer Program ($99/yr).** A free
personal team can only side-load to your own device for 7 days at a time;
TestFlight external testing requires the paid membership. Check at
developer.apple.com/account — if it says "Personal Team", enroll first.

1. **App Store Connect → create the app record.** appstoreconnect.apple.com →
   Apps → + → New App. Platform iOS; Bundle ID `evanknight.The-Spread`
   (Xcode's automatic signing registers it on first archive, so archive first
   if it isn't in the dropdown); SKU anything (`thespread2026`); Name must be
   globally unique even for TestFlight-only apps — if "The Spread" is taken,
   use "The Spread Pick'em". Nobody outside the league ever sees this name.
2. **Xcode → archive.** Set the run destination to **Any iOS Device (arm64)**
   (you cannot archive against a simulator), then Product → Archive.
3. **Organizer → Distribute App → TestFlight & App Store → Upload.** Let
   automatic signing manage certificates. Processing takes ~5–15 minutes;
   you get an email when the build is ready.
4. **TestFlight tab → Test Information.** Fill in a feedback email and
   "What to test" — both are required before external testing is allowed.
5. **External Testing → new group** ("The League") → add the four friends by
   email, or turn on the Public Link and text it to them.
6. **Beta App Review.** The first build of a new app goes through review
   (lighter than App Store review, usually under a day). Later builds of the
   same app normally skip it.
7. Testers install the **TestFlight** app, accept the invite, install The
   Spread — then **enable it in the Messages drawer** (⊕ → More → The
   Spread). The host app's Setup tab walks through this.

**Builds expire after 90 days.** Season runs Sep→Feb: upload in early
September and again around Thanksgiving. Put it in your calendar now.

## Ops notes

- Odds API free tier = 500 credits/mo; this design uses ~50–100 (gated cron
  snapshots + 60-min on-demand refresh when someone opens the board).
- `GET /board` is the public escape hatch when the drawer misbehaves.
- Unstick a bad row: `POST /api/admin/override` with `x-admin-secret` header —
  `{kind:'game', game_id, home_score, away_score, note}` or
  `{kind:'pick', pick_id, official_spread, outcome, note}`. `note` is mandatory.
- VOID results (no snapshot existed) surface in the board and history — fix via
  the pick override. Nothing is ever silently zeroed.
- Re-enrollment: the same code works again and rotates the token (kills the old
  one). That's the fix for "it broke on my phone."
