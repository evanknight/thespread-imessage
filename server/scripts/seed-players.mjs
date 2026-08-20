// Creates the 5 players and prints each one's enrollment code ONCE.
// Usage: DATABASE_URL=... node scripts/seed-players.mjs Evan Mike Sarah Dan Chris
import { createHash, randomBytes } from 'crypto';
import pg from 'pg';

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error('usage: node scripts/seed-players.mjs <name1> <name2> ...');
  process.exit(1);
}
const sha = (s) => createHash('sha256').update(s).digest('hex');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

console.log('\nEnrollment codes — send each player theirs. Codes rotate the token if reused.\n');
for (const name of names) {
  const code = randomBytes(4).toString('hex').toUpperCase();   // e.g. 9F3A21BC
  await client.query(
    `insert into players (display_name, enrollment_code_hash) values ($1, $2)
     on conflict (display_name) do update set enrollment_code_hash = excluded.enrollment_code_hash`,
    [name, sha(code)]
  );
  console.log(`  ${name.padEnd(12)} ${code}`);
}
await client.end();
console.log('\nDone. Codes are stored only as hashes — this printout is the only copy.\n');
