import { initPool } from 'db/pool';
import path from 'path';

export const setupMigration = async () => {
  const customEnv = process.env.ENV_FILE;
  require('dotenv').config({ path: customEnv || path.resolve(__dirname, '../../.env') });
  await initPool();
};

// TODO: setup a test DB framework for testing migrations over fake data
