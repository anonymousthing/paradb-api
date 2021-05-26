import pool from 'db/pool';
import express from 'express';
import * as db from 'zapatos/db';

const port = 8081;
const app = express();

app.get('/', async (req, res) => {
  const maps = await db.select('maps', db.all).run(pool);
  res.send(JSON.stringify(maps));
});

app.listen(port, () => {
  console.log('Listening on 8081');
});
