require('dotenv').config();

import { createApiRouter } from 'api/api';
import cookieParser from 'cookie-parser';
import session from 'cookie-session';
import express from 'express';
import * as fs from 'fs/promises';
import passport from 'passport';
import path from 'path';
import { installSession } from 'session/session';

type Whole<T> = {
  [K in keyof T]: NonNullable<T[K]>;
};

function getEnvVars() {
  const envVars = {
    pgUser: process.env.PGUSER,
    pgPassword: process.env.PGPASSWORD,
    mapsDir: process.env.MAPS_DIR,
  };
  for (const [key, value] of Object.entries(envVars)) {
    if (value == null) {
      console.error(`${key} has been left blank in .env -- intentional?`);
    }
  }
  return envVars as Whole<typeof envVars>;
}

async function main() {
  const envVars = getEnvVars();

  try {
    fs.access(envVars.mapsDir);
  } catch (e) {
    throw new Error('Could not access maps dir; ' + e);
  }

  const port = 8080;
  const app = express();

  installSession();

  app.use(cookieParser());
  app.use(express.json({
    limit: '50mb',
  }));
  app.use(session({
    secret: 'catsaregreat',
  }))
  app.use(passport.initialize());
  app.use(passport.session());


  app.get('/favicon.ico', (req, res) => {
    res.status(404).end();
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

  app.listen(port, () => {
    console.log(`Listening on ${port}`);
  });
}

main();
