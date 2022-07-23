import * as fs from 'fs/promises';

export type EnvVars = {
  pgHost: string,
  pgPort: number,
  pgDatabase: string,
  pgUser: string,
  pgPassword: string,
  mapsDir: string,
  sentryDsn: string,
  sentryEnvironment: string,
  cookieSecret: string,
};

export function initEnvVars() {
  const _envVars: { [K in keyof EnvVars]: EnvVars[K] | undefined } = {
    pgHost: process.env.PGHOST,
    pgPort: Number(process.env.PGPORT || undefined),
    pgDatabase: process.env.PGDATABASE,
    pgUser: process.env.PGUSER,
    pgPassword: process.env.PGPASSWORD,
    mapsDir: process.env.MAPS_DIR,
    sentryDsn: process.env.SENTRY_DSN,
    sentryEnvironment: process.env.SENTRY_ENV,
    cookieSecret: process.env.COOKIE_SECRET,
  };
  let fail = false;
  for (const [key, value] of Object.entries(_envVars)) {
    if (
      value == null
      || (typeof value === 'string' && value.trim() === '')
      || (typeof value === 'number' && isNaN(value))
    ) {
      console.error(`${key} has been left blank in .env -- intentional?`);
      fail = true;
    }
  }
  const envVars = _envVars as EnvVars;
  if (fail) {
    throw new Error('One or more environment variables were missing, see above.');
  }
  try {
    fs.access(envVars.mapsDir);
  } catch (e) {
    throw new Error('Could not access maps dir; ' + e);
  }

  return envVars;
}
