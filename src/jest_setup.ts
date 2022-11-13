import { createServer } from 'app';
import { getPool, initPool } from 'db/pool';
import dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

let tmpMapsDir: string | undefined;

dotenv.config({ path: process.env.ENV_FILE });

beforeAll(async () => {
  if (tmpMapsDir == null) {
    tmpMapsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'paradb_test_'));
    process.env = { ...process.env, MAPS_DIR: tmpMapsDir };
    (global as any).server = await createServer();
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
