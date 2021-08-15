import { error, guardAuth, xssi } from 'api/helpers';
import { createMap, getMap, listMaps } from 'db/maps/maps_repo';
import { Response, Router } from 'express';
import {
  deserializeSubmitMapRequest,
  deserializeUserSession,
  FindMapsResponse,
  GetMapResponse,
  SubmitMapResponse,
} from 'paradb-api-schema';

export function createMapsRouter(mapsDir: string) {
  const mapsRouter = Router({ strict: true });

  mapsRouter.get('/', xssi, async (req, res: Response<FindMapsResponse, {}>) => {
    const result = await listMaps();
    if (!result.success) {
      return error(res, 500, 'Could not retrieve map', {}, { message: result.errors[0].type });
    }
    return (res as Response<FindMapsResponse, {}>).json({ success: true, maps: result.value });
  });

  mapsRouter.get('/:mapId', xssi, async (req, res: Response<GetMapResponse, {}>) => {
    const id = req.params.mapId;
    const result = await getMap(id);
    if (result.success === false) {
      return error(res, 500, 'Could not retrieve maps', {}, { message: result.errors[0].type });
    }
    return res.json({ success: true, map: result.value });
  });

  mapsRouter.post('/submit', xssi, guardAuth, async (req, res: Response<SubmitMapResponse, {}>) => {
    const user = deserializeUserSession(req.user);
    const submitMapReq = deserializeSubmitMapRequest(req.body);
    const result = await createMap(mapsDir, {
      uploader: user.id,
      mapFile: submitMapReq.mapData,
    });
    if (!result.success) {
      // TODO: granular errors
      return error(
        res,
        500,
        'Could not submit map',
        { title: undefined, artist: undefined, downloadLink: undefined },
        { message: result.errors[0].type },
      );
    }
    return res.json({ success: true, id: result.value.id });
  });

  return mapsRouter;
}
