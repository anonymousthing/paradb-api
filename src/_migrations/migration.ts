import { initPool } from 'db/pool';
import path from 'path';

export const setupMigration = async () => {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
  await initPool();
};

// TODO: setup a test DB framework for testing migrations over fake data
