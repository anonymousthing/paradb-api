import { error } from 'api/helpers';
import { getEnvVars } from 'env';
import { Response, Router } from 'express';
import { MeiliSearch } from 'meilisearch';
import {
  deserializeSetFavoriteMapsRequest,
  serializeApiError,
  serializeApiSuccess,
  serializeGetFavoriteMapsResponse,
} from 'paradb-api-schema';
import { MapsRepo, MeilisearchMap } from 'services/maps/maps_repo';
import { FavoritesRepo } from 'services/users/favorites_repo';
import { getUserSession } from 'session/session';

export async function createFavoritesRouter() {
  const favoritesRouter = Router({ strict: true });
  const envVars = getEnvVars();

  const meilisearch = new MeiliSearch({
    host: envVars.meilisearchHost,
    apiKey: envVars.meilisearchKey,
  });
  const mapsIndex = await meilisearch.getIndex<MeilisearchMap>('maps');
  const mapsRepo = new MapsRepo(mapsIndex);
  const favoritesRepo = new FavoritesRepo(mapsRepo, mapsIndex);

  favoritesRouter.post('/set', async (req, res: Response<Buffer, {}>) => {
    const user = getUserSession(req, res);
    if (!user) {
      return;
    }

    const setFavoriteMapsReq = deserializeSetFavoriteMapsRequest(req.body);
    const result = await favoritesRepo.setFavorites(
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
    const result = await favoritesRepo.getFavorites(user.id);
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

  return favoritesRouter;
}
