-- The Spread: core schema
-- All money-like numbers are NUMERIC(5,2). All timestamps are timestamptz (UTC).

create table if not exists players (
  id                   uuid primary key default gen_random_uuid(),
  display_name         text not null unique,
  enrollment_code_hash text not null unique,
  token_hash           text unique,
  created_at           timestamptz not null default now()
);

create table if not exists seasons (
  id   uuid primary key default gen_random_uuid(),
  year int not null unique
);

create table if not exists weeks (
  id            uuid primary key default gen_random_uuid(),
  season_id     uuid not null references seasons(id),
  week_number   int not null,          -- REG 1..18, then WC=19 DIV=20 CONF=21 SB=22
  round         text not null default 'REG'
                check (round in ('REG','WC','DIV','CONF','SB')),
  lock_at       timestamptz,           -- MIN(kickoff_at) across the week's games
  playoff_bonus numeric(5,2) not null default 0,
  locked_line_captured_at timestamptz, -- when the at-lock odds snapshot was taken
  unique (season_id, week_number)
);

create table if not exists teams (
  id             uuid primary key default gen_random_uuid(),
  canonical_abbr text not null unique,
  full_name      text not null unique,
  espn_abbr      text not null unique,
  odds_api_name  text not null unique
);

create table if not exists games (
  id                uuid primary key default gen_random_uuid(),
  week_id           uuid not null references weeks(id),
  espn_event_id     text unique,
  odds_api_event_id text unique,
  home_team_id      uuid not null references teams(id),
  away_team_id      uuid not null references teams(id),
  kickoff_at        timestamptz not null,
  status            text not null default 'SCHEDULED'
                    check (status in ('SCHEDULED','IN_PROGRESS','FINAL','POSTPONED','CANCELLED')),
  home_score        int,
  away_score        int,
  winner_team_id    uuid references teams(id),  -- NULL for ties
  completed_at      timestamptz
);
create index if not exists games_week_idx on games (week_id);
create index if not exists games_kickoff_idx on games (kickoff_at);

create table if not exists odds_snapshots (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references games(id),
  captured_at timestamptz not null default now(),
  bookmaker   text not null default 'draftkings',
  home_spread numeric(5,2),
  away_spread numeric(5,2),
  home_ml     int,
  away_ml     int,
  raw         jsonb
);
create index if not exists odds_snapshots_game_time_idx on odds_snapshots (game_id, captured_at desc);

create table if not exists picks (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references players(id),
  week_id      uuid not null references weeks(id),
  game_id      uuid not null references games(id),
  team_id      uuid not null references teams(id),
  submitted_at timestamptz not null default now(),  -- fixed at first submission
  updated_at   timestamptz not null default now(),  -- bumped on every change
  unique (player_id, week_id)
);
create index if not exists picks_week_idx on picks (week_id);

create table if not exists pick_results (
  pick_id              uuid primary key references picks(id),
  official_spread      numeric(5,2),          -- signed, from picked team's perspective
  snapshot_id          uuid references odds_snapshots(id),
  lock_time_spread     numeric(5,2),          -- picked team's spread at week lock
  base_points          numeric(5,2) not null default 0,
  bonus_points         numeric(5,2) not null default 0,
  total_points         numeric(5,2) not null default 0,
  outcome              text not null check (outcome in ('W','L','NP','VOID')),
  scored_at            timestamptz not null default now(),
  manual_override_note text
);
