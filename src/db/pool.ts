import pg from 'pg';

// Connection details are pulled from env variables: https://node-postgres.com/features/connecting
const pool = new pg.Pool();
pool.on('error', err => console.error(err));

export default pool;
