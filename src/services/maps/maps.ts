import { error, guardAuth, handleAsyncErrors } from 'api/helpers';
import { Request, Response, Router } from 'express';
import {
  deserializeSubmitMapRequest,
  serializeApiError,
  serializeDeleteMapResponse,
  serializeFindMapsResponse,
  serializeGetMapResponse,
  serializeSubmitMapError,
  serializeSubmitMapResponse,
} from 'paradb-api-schema';
import { getUserSession } from 'session/session';
import { createMap, deleteMap, getMap, GetMapError, listMaps } from './maps_repo';

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
        resultError: result,
      });
    }
    return res.send(Buffer.from(serializeFindMapsResponse({ success: true, maps: result.value })));
  });

  mapsRouter.get('/:mapId', async (req, res: Response<Buffer, {}>) => {
    const id = req.params.mapId;
    const result = await getMap(id);
    if (result.success === false) {
      const isMissing = result.errors.some(e => e.type === GetMapError.MISSING_MAP);
      return error({
        res,
        errorSerializer: serializeApiError,
        errorBody: {},
        statusCode: isMissing ? 404 : 500,
        message: isMissing ? 'Map not found' : 'Could not retrieve map',
        resultError: result,
      });
    }
    return res.send(Buffer.from(serializeGetMapResponse({ success: true, map: result.value })));
  });

  mapsRouter.post('/:mapId/delete', guardAuth, async (req: Request, res: Response<Buffer, {}>) => {
    const id = req.params.mapId;
    const getResult = await getMap(id);
    if (getResult.success === false) {
      const isMissing = getResult.errors.some(e => e.type === GetMapError.MISSING_MAP);
      return error({
        res,
        errorSerializer: serializeApiError,
        errorBody: {},
        statusCode: isMissing ? 404 : 500,
        message: isMissing ? 'Map not found' : 'Could not delete map',
        resultError: getResult,
      });
    }
    const user = getUserSession(req, res);
    if (!user) {
      return;
    }
    if (user.id !== getResult.value.uploader) {
      return error({
        res,
        errorSerializer: serializeApiError,
        errorBody: {},
        statusCode: 403,
        message: 'Only the map uploader can delete their own maps',
      });
    }

    const deleteResult = await deleteMap(id);
    if (deleteResult.success === false) {
      return error({
        res,
        errorSerializer: serializeApiError,
        errorBody: {},
        statusCode: 500,
        message: 'Could not delete map',
        resultError: deleteResult,
      });
    }
    return res.send(Buffer.from(serializeDeleteMapResponse({ success: true })));
  });

  mapsRouter.post('/submit', guardAuth, async (req: Request, res: Response<Buffer, {}>, next) => {
    handleAsyncErrors(next, async () => {
      const user = getUserSession(req, res);
      if (!user) {
        return;
      }
      const submitMapReq = deserializeSubmitMapRequest(req.body);
      const result = await createMap(mapsDir, { uploader: user.id, mapFile: submitMapReq.mapData });
      if (!result.success) {
        // TODO: granular errors
        return error({
          res,
          statusCode: 500,
          errorSerializer: serializeSubmitMapError,
          errorBody: { title: undefined, artist: undefined, downloadLink: undefined },
          message: 'Could not submit map',
          resultError: result,
        });
      }
      return res.send(
        Buffer.from(serializeSubmitMapResponse({ success: true, id: result.value.id })),
      );
    });
  });

  return mapsRouter;
}
