import mapsRouter from 'api/maps/maps';
import usersRouter from 'api/users/users';
import express from 'express';

const apiRouter = express.Router({ strict: true });
// Logged out routes
apiRouter.use('/maps', mapsRouter);

// Logged in routes
apiRouter.use('/users', usersRouter);

export default apiRouter;
