import { initPool } from 'db/pool';
import { initEnvVars } from 'env';
import path from 'path';

export const setupMigration = async () => {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
  const envVars = initEnvVars();
  await initPool(envVars);
  return envVars;
};

// TODO: setup a test DB framework for testing migrations over fake data
