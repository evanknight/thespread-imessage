-- Multiple live tokens per player, so web and iMessage sessions coexist.
-- Enrolling mints a new token; the newest 5 per player stay valid.
create table if not exists player_tokens (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references players(id),
  token_hash text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists player_tokens_player_idx on player_tokens (player_id);

insert into player_tokens (player_id, token_hash)
  select id, token_hash from players where token_hash is not null
on conflict (token_hash) do nothing;

alter table players drop column if exists token_hash;
