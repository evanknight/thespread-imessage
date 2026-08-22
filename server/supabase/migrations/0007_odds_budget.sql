-- Ledger of real Odds API calls, so freshness-on-load can never overrun the
-- free tier. Every outbound call is recorded; callers check the caps first.
create table if not exists odds_api_calls (
  id        uuid primary key default gen_random_uuid(),
  called_at timestamptz not null default now(),
  reason    text
);
create index if not exists odds_api_calls_time_idx on odds_api_calls (called_at desc);
