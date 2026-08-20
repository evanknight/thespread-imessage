import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const secret = process.env.CRON_SECRET;
const base = 'https://thespread-imessage.vercel.app';

for (const ext of ['pg_cron', 'pg_net']) {
  try { await client.query(`create extension if not exists ${ext}`); console.log(`ext ok: ${ext}`); }
  catch (e) { console.log(`ext FAIL ${ext}: ${e.message}`); }
}

const jobs = [
  ['sync-schedule', '0 9 * * *', '/api/cron/sync-schedule'],
  ['snapshot-odds', '*/5 * * * *', '/api/cron/snapshot-odds'],
  ['ingest-scores', '*/10 * * * *', '/api/cron/ingest-scores'],
  ['score-picks', '30 * * * *', '/api/cron/score-picks'],
];
for (const [name, schedule, path] of jobs) {
  try { await client.query(`select cron.unschedule($1)`, [name]); } catch {}
  const cmd = `select net.http_post(url := '${base}${path}', headers := jsonb_build_object('Authorization', 'Bearer ${secret}', 'Content-Type', 'application/json'), body := '{}'::jsonb);`;
  await client.query(`select cron.schedule($1, $2, $3)`, [name, schedule, cmd]);
  console.log(`scheduled: ${name} (${schedule})`);
}
const rows = await client.query('select jobname, schedule, active from cron.job order by jobname');
console.table(rows.rows);
await client.end();
