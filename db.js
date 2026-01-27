import pg from 'pg';

const { Pool } = pg;

// Database configuration - populate these via environment variables
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'mimic',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
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
