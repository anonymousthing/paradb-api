require('dotenv').config();

import * as Sentry from '@sentry/node';
import { createApiRouter } from 'api/api';
import cookieParser from 'cookie-parser';
import session from 'cookie-session';
import pool from 'db/pool';
import express from 'express';
import * as fs from 'fs/promises';
import passport from 'passport';
import path from 'path';
import { installSession } from 'session/session';
import { Request, Response } from 'express';

type EnvVars = {
  pgUser: string,
  pgPassword: string,
  mapsDir: string,
  sentryDsn: string,
  sentryEnvironment: string,
};

function setupEnvVars() {
  const _envVars: { [K in keyof EnvVars]: EnvVars[K] | undefined } = {
    pgUser: process.env.PGUSER,
    pgPassword: process.env.PGPASSWORD,
    mapsDir: process.env.MAPS_DIR,
    sentryDsn: process.env.SENTRY_DSN,
    sentryEnvironment: process.env.SENTRY_ENV,
  };
  for (const [key, value] of Object.entries(_envVars)) {
    if (value == null) {
      console.error(`${key} has been left blank in .env -- intentional?`);
    }
  }
  const envVars = _envVars as EnvVars;

  try {
    fs.access(envVars.mapsDir);
  } catch (e) {
    throw new Error('Could not access maps dir; ' + e);
  }

  return envVars;
}

async function main(envVars: EnvVars) {
  // Test DB
  try {
    await pool.connect();
  } catch (e) {
    throw new Error('Could not connect to database, is it running?');
  }

  const port = 8080;
  const app = express();

  installSession();

  app.use(cookieParser());
  app.use(express.raw({
    type: 'application/octet-stream',
    limit: '150mb',
  }));
  app.use(session({
    secret: 'catsaregreat',
  }));
  app.use(passport.initialize());
  app.use(passport.session());

  app.get('/favicon.ico', (req, res) => {
    res.status(404).end();
  });
  app.use(async (req, _res, next) => {
    _res.on('finish', async () => {
      const res: typeof _res & { paradbError?: Error, paradbErrorTags?: Record<string, string> } =
          _res;
      if (res.paradbError && res.statusCode >= 400) {
        Sentry.withScope(scope => {
          if (res.paradbErrorTags) {
            scope.setTags(res.paradbErrorTags);
          }
          Sentry.captureException(res.paradbError)
        });
      }
    });
    next();
  });

  const apiRouter = createApiRouter(envVars.mapsDir);
  app.use('/api', apiRouter);

  // Serve static assets
  app.use('/static', express.static(path.join(__dirname, '../fe/')));
  // TODO: allowlist to only images and zip files
  app.use('/static/map_data/', express.static(envVars.mapsDir));
  // Always serve the React SPA for all non-static and non-api routes.
  app.get([
    '/',
    '/instructions',
    '/login',
    '/signup',
    '/map/*',
  ], (req, res) => {
    res.sendFile(path.join(__dirname, '../fe/index.html'));
  });
  app.get('/logout', (req, res) => {
    req.logout();
    res.redirect('/');
  });

  app.use((error: any, req: Request, res: Response, next: () => void) => {
    if (error.statusCode == null || (typeof error.statusCode === 'number' && error.statusCode >= 400)) {
      Sentry.captureException(error);
    }
    res.status(500).send({ error: 'internal server error' });
  });

  app.listen(port, () => {
    console.log(`Listening on ${port}`);
  });
}

const envVars = setupEnvVars();

Sentry.init({
  dsn: envVars.sentryDsn,
  environment: envVars.sentryEnvironment,
});

try {
  main(envVars);
} catch (e) {
  Sentry.captureException(e);
}
