import { createServer } from 'app';
import { getPool, initPool } from 'db/pool';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

let tmpMapsDir: string | undefined;

beforeAll(async () => {
  if (tmpMapsDir == null) {
    tmpMapsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'paradb_test_'));
    process.env = {
      ...process.env,
      PGHOST: 'localhost',
      PGPORT: process.env.PGPORT || '5432',
      PGDATABASE: 'paradb_test',
      PGUSER: 'paradb_test',
      PGPASSWORD: '1234',
      MAPS_DIR: tmpMapsDir,
      SENTRY_DSN: 'sentryDsn',
      SENTRY_ENV: 'sentryEnv',
      COOKIE_SECRET: 'catsaregreat',
      PUBLIC_S3_BASE_URL: 'https://test.example.com',
      S3_ENDPOINT: 'https://test.example.com',
      S3_REGION: 's3region',
      S3_ACCESS_KEY_ID: 's3accessId',
      S3_ACCESS_KEY_SECRET: 's3accessSecret',
      S3_MAPS_BUCKET: 's3bucket',
    };
    (global as any).server = createServer();
  }
  await initPool(1);
});
beforeEach(async () => {
  await getPool().query('BEGIN');
});
afterEach(async () => {
  await getPool().query('ROLLBACK');
});
afterAll(async () => {
  await getPool().end();
  if (tmpMapsDir) {
    fs.rm(tmpMapsDir, { recursive: true, force: true });
  }
});

global.console.info = jest.fn();
