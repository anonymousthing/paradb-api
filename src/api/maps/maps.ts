import { xssi } from 'api/middleware_helpers';
import { camelCaseKeys } from 'db/helpers';
import { getMap, listMaps } from 'db/maps/maps_repo';
import express from 'express';

const mapsRouter = express.Router({ strict: true });

mapsRouter.get('/', xssi, async (req, res) => {
  const result = await listMaps();
  if (result.success === false) {
    // TODO: API -> FE error handling
    throw new Error();
  }
  res.json({ maps: result.value });
});

mapsRouter.get('/:mapId', xssi, async (req, res) => {
  const id = req.params.mapId;
  const map = await getMap(id);
  res.json({ map: camelCaseKeys(map) });
});

export default mapsRouter;
