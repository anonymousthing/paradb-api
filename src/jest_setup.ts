import { createServer } from 'app';
import { getPool, initPool } from 'db/pool';
import { EnvVars } from 'env';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

let envVars: EnvVars | undefined = undefined;
let tmpMapsDir: string;

async function createTestEnvVars() {
  tmpMapsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'paradb_test_'));
  return {
    pgHost: 'localhost',
    pgPort: Number(process.env.PGPORT) || 5432,
    pgDatabase: 'paradb_test',
    pgUser: 'paradb_test',
    pgPassword: '1234',
    mapsDir: tmpMapsDir,
    sentryDsn: '',
    sentryEnvironment: 'test',
    cookieSecret: 'catsaregreat',
  };
}

beforeAll(async () => {
  if (envVars == null) {
    envVars = await createTestEnvVars();
    (global as any).server = createServer(envVars);
  }
  await initPool(envVars);
});
beforeEach(async () => {
  await getPool().query('BEGIN');
});
afterEach(async () => {
  await getPool().query('ROLLBACK');
});
afterAll(async () => {
  await getPool().end();
  fs.rm(tmpMapsDir, { recursive: true, force: true });
});

global.console.info = jest.fn();
