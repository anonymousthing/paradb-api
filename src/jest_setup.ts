import { getPool, initPool } from 'db/pool';
import { EnvVars } from 'env';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

let envVars: EnvVars | undefined = undefined;

async function createTestEnvVars() {
  const tmpMapsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'paradb_test_'));
  return {
    pgHost: 'localhost',
    pgPort: 5432,
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
});
