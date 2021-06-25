import { PromisedResult } from 'base/result';
import { CamelCase, camelCaseKeys } from 'db/helpers';
import pool from 'db/pool';
import * as db from 'zapatos/db';
import { maps } from 'zapatos/schema';

type Map = CamelCase<maps.JSONSelectable>;

export const enum ListMapError {
  UNKNOWN_DB_ERROR = 'unknown_db_error',
};
export async function listMaps(): PromisedResult<Map[], ListMapError> {
  try {
    const maps = await db.select('maps', db.all, {
      lateral: {
        complexities: db.select('complexities', { map_id: db.parent('id') }, { columns: ['complexity', 'complexity_name'] }),
      },
      columns: ['id', 'title', 'artist', 'author', 'uploader', 'description', 'download_link', 'album_art'],
      order: {
        by: 'title',
        direction: 'ASC',
      },
    }).run(pool);
    return {
      success: true,
      value: maps.map(m => camelCaseKeys(m)),
    };
  } catch (e) {
    return {
      success: false,
      errors: [{ type: ListMapError.UNKNOWN_DB_ERROR }],
    };
  }
}

export const enum GetMapError {
  UNKNOWN_DB_ERROR = 'unknown_db_error',
};
export async function getMap(id: string): PromisedResult<Map, GetMapError> {
  try {
    const map = await db.selectExactlyOne('maps', { id }, {
      lateral: {
        complexities: db.select('complexities', { map_id: db.parent('id') }, { columns: ['complexity', 'complexity_name'] }),
      },
      columns: ['id', 'title', 'artist', 'author', 'uploader', 'description', 'download_link', 'album_art'],
    }).run(pool);
    return {
      success: true,
      value: camelCaseKeys(map),
    };
  } catch (e) {
    return {
      success: false,
      errors: [{ type: GetMapError.UNKNOWN_DB_ERROR }],
    };
  }
};
