import { Pool } from 'pg';

// Minimal query interface so tests can swap in an in-process PGlite database.
export interface Db {
  query<T = any>(text: string, params?: any[]): Promise<T[]>;
}

let db: Db | null = null;

export function setDb(d: Db | null) {
  db = d;
}

export function getDb(): Db {
  if (db) return db;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  db = {
    query: async (text, params) => (await pool.query(text, params)).rows,
  };
  return db;
}
