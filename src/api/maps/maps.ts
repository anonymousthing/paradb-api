import { error, xssi } from 'api/helpers';
import { getMap, listMaps } from 'db/maps/maps_repo';
import { Response, Router } from 'express';
import { FindMapsResponse, GetMapResponse } from 'paradb-api-schema';

const mapsRouter = Router({ strict: true });

mapsRouter.get('/', xssi, async (req, res: Response<FindMapsResponse, {}>) => {
  const result = await listMaps();
  if (!result.success) {
    return error(res, 500, 'Could not retrieve map', {});
  }
  return (res as Response<FindMapsResponse, {}>).json({ success: true, maps: result.value });
});

mapsRouter.get('/:mapId', xssi, async (req, res: Response<GetMapResponse, {}>) => {
  const id = req.params.mapId;
  const result = await getMap(id);
  if (result.success === false) {
    return error(res, 500, 'Could not retrieve maps', {});
  }
  return res.json({ success: true, map: result.value });
});

export default mapsRouter;
