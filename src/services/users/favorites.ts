import { error } from 'api/helpers';
import { Response, Router } from 'express';
import {
  deserializeSetFavoriteMapsRequest,
  serializeApiError,
  serializeApiSuccess,
  serializeGetFavoriteMapsResponse,
} from 'paradb-api-schema';
import { getFavorites, setFavorites } from 'services/users/favorites_repo';
import { getUserSession } from 'session/session';

const favoritesRouter = Router({ strict: true });

favoritesRouter.post('/set', async (req, res: Response<Buffer, {}>) => {
  const user = getUserSession(req, res);
  if (!user) {
    return;
  }

  const setFavoriteMapsReq = deserializeSetFavoriteMapsRequest(req.body);
  const result = await setFavorites(
    user.id,
    setFavoriteMapsReq.mapIds,
    setFavoriteMapsReq.isFavorite,
  );

  if (!result.success) {
    return error({
      res,
      statusCode: 500,
      errorSerializer: serializeApiError,
      errorBody: {},
      message: 'Unknown error when setting favorites, please try again later',
    });
  }
  return res.send(Buffer.from(serializeApiSuccess({ success: true })));
});

favoritesRouter.get('/', async (req, res: Response<Buffer, {}>) => {
  const user = getUserSession(req, res);
  if (!user) {
    return;
  }
  const result = await getFavorites(user.id);
  if (!result.success) {
    return error({
      res,
      statusCode: 500,
      errorSerializer: serializeApiError,
      errorBody: {},
      message: 'Unknown error when retrieving favorites, please try again later',
    });
  }

  return res.send(
    Buffer.from(serializeGetFavoriteMapsResponse({ success: true, maps: result.value })),
  );
});

export default favoritesRouter;
