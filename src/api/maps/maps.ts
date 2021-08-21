import { error, guardAuth } from 'api/helpers';
import { createMap, getMap, listMaps } from 'db/maps/maps_repo';
import { Response, Router } from 'express';
import {
  deserializeSubmitMapRequest,
  serializeApiError,
  serializeFindMapsResponse,
  serializeGetMapResponse,
  serializeSubmitMapError,
  serializeSubmitMapResponse,
} from 'paradb-api-schema';
import { getUserSession } from 'session/session';

export function createMapsRouter(mapsDir: string) {
  const mapsRouter = Router({ strict: true });

  mapsRouter.get('/', async (req, res: Response<Buffer, {}>) => {
    const result = await listMaps();
    if (!result.success) {
      return error({
        res,
        statusCode: 500,
        errorSerializer: serializeApiError,
        errorBody: {},
        message: 'Could not retrieve map',
        internalTags: { message: result.errors[0].type },
      });
    }
    return res.send(Buffer.from(serializeFindMapsResponse({
      success: true,
      maps: result.value,
    })));
  });

  mapsRouter.get('/:mapId', async (req, res: Response<Buffer, {}>) => {
    const id = req.params.mapId;
    const result = await getMap(id);
    if (result.success === false) {
      return error({
        res,
        errorSerializer: serializeApiError,
        errorBody: {},
        statusCode: 500,
        message: 'Could not retrieve maps',
        internalTags: { message: result.errors[0].type },
      });
    }
    return res.send(Buffer.from(serializeGetMapResponse({
      success: true,
      map: result.value,
    })));
  });

  mapsRouter.post('/submit', guardAuth, async (req, res: Response<Buffer, {}>) => {
    const user = getUserSession(req, res);
    if (!user) {
      return;
    }
    const submitMapReq = deserializeSubmitMapRequest(req.body);
    const result = await createMap(mapsDir, {
      uploader: user.id,
      mapFile: submitMapReq.mapData,
    });
    if (!result.success) {
      // TODO: granular errors
      return error({
        res,
        statusCode: 500,
        errorSerializer: serializeSubmitMapError,
        errorBody: {
          title: undefined,
          artist: undefined,
          downloadLink: undefined,
        },
        message: 'Could not submit map',
        internalTags: { message: result.errors[0].type },
      });
    }
    return res.send(Buffer.from(serializeSubmitMapResponse({
      success: true,
      id: result.value.id,
    })));
  });

  return mapsRouter;
}
