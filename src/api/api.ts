import express from 'express';
import { createMapsRouter } from 'services/maps/maps';
import usersRouter from 'services/users/users';

// Set MIME type for requests and responses to 'application/x-protobuf' to allow Cloudflare to use
// brotli / gzip encoding over the wire. We don't actually use protobuf but Cloudflare doesn't let
// you force compression for 'application/octet-stream', so this is the closest.
// However, when express / supertest communicate with each other, it only sends binary Buffer
// responses when the response type is set to 'application/octet-stream', which is a bit annoying.
// (This is not a problem when the actual web client fetches data via fetch() though).
export const contentType = process.env.NODE_ENV === 'test'
  ? 'application/octet-stream'
  : 'application/x-protobuf';

export function createApiRouter(mapsDir: string) {
  const apiRouter = express.Router({ strict: true });
  apiRouter.use((req, res, next) => {
    res.contentType(contentType);
    next();
  });

  // Logged out routes
  const mapsRouter = createMapsRouter(mapsDir);
  apiRouter.use('/maps', mapsRouter);

  // Logged in routes
  apiRouter.use('/users', usersRouter);

  return apiRouter;
}
