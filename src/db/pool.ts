import pg from 'pg';

const pool = new pg.Pool({ connectionString: 'postgresql://localhost/paradb' });
pool.on('error', err => console.error(err));

export default pool;
