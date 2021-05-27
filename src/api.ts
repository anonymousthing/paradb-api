import { camelCaseKeys } from 'db/camelcase';
import pool from 'db/pool';
import express from 'express';
import * as db from 'zapatos/db';

const apiRouter = express.Router({ strict: true });

const xssiPrefix = '\'"])}while(1);</x>//';

apiRouter.get('/map', async (req, res) => {
  const maps = await db.select('maps', db.all, {
    lateral: {
      complexities: db.select('complexities', { map_id: db.parent('id') }, { columns: ['complexity', 'complexity_name'] }),
    },
    columns: ['id', 'title', 'artist', 'author', 'uploader', 'description', 'download_link']
  }).run(pool);
  res.write(xssiPrefix);
  res.write(JSON.stringify({
    maps: maps.map(m => camelCaseKeys(m))
  }));
  res.end();
});
apiRouter.get('/map/:mapId', async (req, res) => {
  const id = req.params.mapId;
  const map = await db.selectExactlyOne('maps', { id }, {
    lateral: {
      complexities: db.select('complexities', { map_id: db.parent('id') }, { columns: ['complexity', 'complexity_name'] }),
    },
    columns: ['id', 'title', 'artist', 'author', 'uploader', 'description', 'download_link']
  }).run(pool);
  res.write(xssiPrefix);
  res.write(JSON.stringify({ map: camelCaseKeys(map) }));
  res.end();
});

export default apiRouter;
