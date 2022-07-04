import pg from 'pg';

// Connection details are pulled from env variables: https://node-postgres.com/features/connecting
export const pool = new pg.Pool();
pool.on('error', err => console.error(err));

export async function initPool() {
  // Test DB
  try {
    await pool.connect();
  } catch (e) {
    throw new Error('Could not connect to database, is it running?');
  }

  return pool;
}
