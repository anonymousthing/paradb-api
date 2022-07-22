import express from 'express';
import { createMapsRouter } from 'services/maps/maps';
import usersRouter from 'services/users/users';

export function createApiRouter(mapsDir: string) {
  const apiRouter = express.Router({ strict: true });
  // Logged out routes
  const mapsRouter = createMapsRouter(mapsDir);
  apiRouter.use('/maps', mapsRouter);

  // Logged in routes
  apiRouter.use('/users', usersRouter);

  return apiRouter;
}
