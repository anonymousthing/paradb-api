import express from 'express';
import { createMapsRouter } from 'services/maps/maps';
import usersRouter from 'services/users/users';

export function createApiRouter(mapsDir: string) {
  const apiRouter = express.Router({ strict: true });
  apiRouter.use((req, res, next) => {
    // Set MIME type for responses to 'application/x-protobuf' to allow Cloudflare to use
    // brotli / gzip encoding over the wire. We don't actually use protobuf but Cloudflare doesn't
    // let you force compression for 'application/octet-stream', so this is the closest.
    res.contentType('application/x-protobuf');
    next();
  });

  // Logged out routes
  const mapsRouter = createMapsRouter(mapsDir);
  apiRouter.use('/maps', mapsRouter);

  // Logged in routes
  apiRouter.use('/users', usersRouter);

  return apiRouter;
}
