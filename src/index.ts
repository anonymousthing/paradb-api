require('dotenv').config();

import * as Sentry from '@sentry/node';
import { createServer } from 'app';
import { initPool } from 'db/pool';
import { getEnvVars } from 'env';

const SERVER_PORT = 8080;

async function main() {
  await initPool();
  const app = createServer();
  app.listen(SERVER_PORT, () => {
    console.info(`Listening on ${SERVER_PORT}`);
  });
}

const envVars = getEnvVars();
Sentry.init({ dsn: envVars.sentryDsn, environment: envVars.sentryEnvironment });

try {
  main();
} catch (e) {
  Sentry.captureException(e);
}
