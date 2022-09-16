import * as Sentry from '@sentry/node';
import { contentType, createApiRouter } from 'api/api';
import cookieParser from 'cookie-parser';
import session from 'cookie-session';
import { EnvVars } from 'env';
import express from 'express';
import { Request, Response } from 'express';
import passport from 'passport';
import path from 'path';
import { installSession } from 'session/session';

export function createServer(envVars: EnvVars) {
  const app = express();

  installSession();

  app.use(cookieParser());
  app.use(express.raw({ type: contentType, limit: '150mb' }));
  app.use(session({ secret: envVars.cookieSecret }));
  app.use(passport.initialize());
  app.use(passport.session());

  app.use(async (req, _res, next) => {
    _res.on('finish', async () => {
      const res: typeof _res & { paradbError?: Error, paradbErrorTags?: Record<string, string> } =
        _res;
      if (res.paradbError && res.statusCode >= 400) {
        Sentry.withScope(scope => {
          if (res.paradbErrorTags) {
            scope.setTags(res.paradbErrorTags);
          }
          Sentry.captureException(res.paradbError);
        });
      }
    });
    next();
  });

  const apiRouter = createApiRouter(envVars.mapsDir);
  app.use('/api', apiRouter);

  // Serve static assets (JS, CSS)
  app.use('/static', express.static(path.join(__dirname, '../fe/')));
  app.use('/favicon.png', (_, res) => res.sendFile(path.join(__dirname, '../static/favicon.png')));
  // Serve static map data (cover art images). Note that the actual map downloads are handled via the map API /download
  // route instead.
  app.use('/static/map_data/:mapId/:coverFile', (req, res) => {
    const { mapId, coverFile } = req.params;
    return res.sendFile(path.resolve(envVars.mapsDir, mapId, coverFile));
  });
  // Always serve the React SPA for all non-static and non-api routes.
  app.get(['/', '/instructions', '/login', '/settings', '/signup', '/map/*'], (req, res) => {
    res.sendFile(path.join(__dirname, '../fe/index.html'));
  });
  app.get('/logout', (req, res) => {
    req.logout();
    res.redirect('/');
  });

  app.use((error: any, req: Request, res: Response, next: () => void) => {
    if (
      error.statusCode == null || (typeof error.statusCode === 'number' && error.statusCode >= 400)
    ) {
      Sentry.captureException(error);
    }
    res.status(500).send({ error: 'internal server error' });
  });
  return app;
}
