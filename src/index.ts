require('dotenv').config();

import * as Sentry from '@sentry/node';
import { createServer } from 'app';
import { initPool } from 'db/pool';
import { EnvVars, initEnvVars } from 'env';

const SERVER_PORT = 8080;

async function main(envVars: EnvVars) {
  await initPool(envVars);
  const app = createServer(envVars);
  app.listen(SERVER_PORT, () => {
    console.info(`Listening on ${SERVER_PORT}`);
  });
}

const envVars = initEnvVars();
Sentry.init({ dsn: envVars.sentryDsn, environment: envVars.sentryEnvironment });

try {
  main(envVars);
} catch (e) {
  Sentry.captureException(e);
}
