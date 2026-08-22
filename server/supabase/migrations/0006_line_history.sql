-- Richer historical record per pick.
--
-- official_spread was already permanent (written once, never rewritten). These
-- add the rest of the line's story so a pick can be audited years later even
-- if snapshots are ever pruned: where the line opened, where it sat at lock,
-- and which snapshot produced the official number.
alter table pick_results add column if not exists open_spread numeric(5,2);
alter table pick_results add column if not exists open_snapshot_id uuid references odds_snapshots(id);
alter table pick_results add column if not exists lock_snapshot_id uuid references odds_snapshots(id);
alter table pick_results add column if not exists kickoff_at timestamptz;   -- kickoff as of scoring

-- How many times the player switched teams before lock. Cheap flavor for the
-- detail sheet; we still keep no full pick history.
alter table picks add column if not exists change_count int not null default 0;

-- Denser sampling makes the movement series meaningful.
create index if not exists odds_snapshots_captured_idx on odds_snapshots (captured_at);
