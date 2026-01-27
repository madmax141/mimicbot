import pg from 'pg';

const { Pool } = pg;

// Database configuration via DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com') 
    ? { rejectUnauthorized: false } 
    : false,
});

// Initialize tables
export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS botbslack (
      id SERIAL PRIMARY KEY,
      user_id TEXT,
      message TEXT
    )
  `);
}

// Query helper
export async function query(text, params) {
  return pool.query(text, params);
}

// Get a client for transactions
export async function getClient() {
  return pool.connect();
}

export default pool;
