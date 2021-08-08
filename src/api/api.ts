import { createMapsRouter } from 'api/maps/maps';
import usersRouter from 'api/users/users';
import express from 'express';

export function createApiRouter(mapsDir: string) {
  const apiRouter = express.Router({ strict: true });
  // Logged out routes
  const mapsRouter = createMapsRouter(mapsDir);
  apiRouter.use('/maps', mapsRouter);

  // Logged in routes
  apiRouter.use('/users', usersRouter);

  return apiRouter;
}
