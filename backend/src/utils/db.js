import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 8_000
});
pool.on('error', (error) => console.error('Unexpected PostgreSQL pool error:', error.message));

export async function query(text, params = []) {
  return pool.query(text, params);
}
