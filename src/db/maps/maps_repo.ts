import pool from 'db/pool';
import * as db from 'zapatos/db';

export function listMaps() {
  return db.select('maps', db.all, {
    lateral: {
      complexities: db.select('complexities', { map_id: db.parent('id') }, { columns: ['complexity', 'complexity_name'] }),
    },
    columns: ['id', 'title', 'artist', 'author', 'uploader', 'description', 'download_link', 'album_art'],
    order: {
      by: 'title',
      direction: 'ASC',
    },
  }).run(pool);
}

export function getMap(id: string) {
  return db.selectExactlyOne('maps', { id }, {
    lateral: {
      complexities: db.select('complexities', { map_id: db.parent('id') }, { columns: ['complexity', 'complexity_name'] }),
    },
    columns: ['id', 'title', 'artist', 'author', 'uploader', 'description', 'download_link'],
  }).run(pool);
};
