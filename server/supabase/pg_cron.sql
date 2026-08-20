-- Scheduling via Supabase pg_cron + pg_net (Vercel Hobby cron is ~once/day per job,
-- which is useless here). Run this in the Supabase SQL editor AFTER:
--   1. Dashboard -> Database -> Extensions: enable pg_cron and pg_net
--   2. Replace YOUR_APP.vercel.app and YOUR_CRON_SECRET below
-- The routes themselves are guarded by CRON_SECRET, so the scheduler is swappable.

select cron.schedule('sync-schedule', '0 9 * * *', $$
  select net.http_post(
    url     := 'https://YOUR_APP.vercel.app/api/cron/sync-schedule',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET', 'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
$$);

-- Cheap no-op most runs; calls The Odds API only in kickoff/lock windows.
select cron.schedule('snapshot-odds', '*/5 * * * *', $$
  select net.http_post(
    url     := 'https://YOUR_APP.vercel.app/api/cron/snapshot-odds',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET', 'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
$$);

-- Cheap no-op when nothing is in flight; also runs the idempotent scoring pass.
select cron.schedule('ingest-scores', '*/10 * * * *', $$
  select net.http_post(
    url     := 'https://YOUR_APP.vercel.app/api/cron/ingest-scores',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET', 'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
$$);

-- Belt-and-suspenders scoring sweep, hourly.
select cron.schedule('score-picks', '30 * * * *', $$
  select net.http_post(
    url     := 'https://YOUR_APP.vercel.app/api/cron/score-picks',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET', 'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
$$);

-- To inspect:  select * from cron.job;
-- To remove :  select cron.unschedule('snapshot-odds');
