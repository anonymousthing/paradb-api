import { EnvVars } from 'env';
import pg from 'pg';

// Connection details are pulled from env variables: https://node-postgres.com/features/connecting
const db: { pool: pg.Pool | undefined } = { pool: undefined };

export async function initPool(envVars: EnvVars) {
  console.log('initialized db pool');

  // Test DB
  try {
    db.pool = new pg.Pool({
      host: envVars.pgHost,
      port: envVars.pgPort,
      database: envVars.pgDatabase,
      user: envVars.pgUser,
      password: envVars.pgPassword,
    });
    db.pool.on('error', err => console.error(err));
  } catch (e) {
    throw new Error('Could not connect to database, is it running?');
  }

  return db.pool;
}

export function getPool() {
  if (db.pool == null) {
    throw new Error('Attempted to use db pool when it was uninitialized');
  }
  return db.pool;
}
