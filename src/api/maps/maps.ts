import { error, xssi } from 'api/helpers';
import { camelCaseKeys } from 'db/helpers';
import { getMap, listMaps } from 'db/maps/maps_repo';
import express from 'express';

const mapsRouter = express.Router({ strict: true });

mapsRouter.get('/', xssi, async (req, res) => {
  const result = await listMaps();
  if (result.success === false) {
    return error(res, 500, 'Could not retrieve map', {});
  }
  res.json({ maps: result.value });
});

mapsRouter.get('/:mapId', xssi, async (req, res) => {
  const id = req.params.mapId;
  const result = await getMap(id);
  if (result.success === false) {
    return error(res, 500, 'Could not retrieve maps', {});
  }
  res.json({ map: camelCaseKeys(result.value) });
});

export default mapsRouter;
