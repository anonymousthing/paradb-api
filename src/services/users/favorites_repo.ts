import { PromisedResult } from 'base/result';
import { DbError } from 'db/helpers';
import { getPool } from 'db/pool';
import { PDMap } from 'paradb-api-schema';
import { findMaps } from 'services/maps/maps_repo';
import * as db from 'zapatos/db';

export async function setFavorites(
  userId: string,
  mapIds: string[],
  isFavorited: boolean,
): PromisedResult<void, DbError> {
  const pool = getPool();
  const now = new Date();

  try {
    if (isFavorited) {
      await db
        .upsert(
          'favorites',
          mapIds.map(m => ({ map_id: m, user_id: userId, favorited_date: now })),
          ['map_id', 'user_id'],
          { updateColumns: db.doNothing },
        )
        .run(pool);
    } else {
      await db.readCommitted(
        pool,
        async client =>
          Promise.all(
            mapIds.map(m => db.deletes('favorites', { user_id: userId, map_id: m }).run(client)),
          ),
      );
    }
  } catch (e) {
    // TODO: better favorites error handling
    return { success: false, errors: [{ type: DbError.UNKNOWN_DB_ERROR }] };
  }

  return { success: true, value: undefined };
}

export async function getFavorites(userId: string): PromisedResult<PDMap[], DbError> {
  const pool = getPool();

  try {
    const favorites = await db.select('favorites', { user_id: userId }).run(pool);
    const ids = favorites.map(f => f.map_id);
    const mapsResult = await findMaps({ by: 'id', ids });
    return mapsResult;
  } catch (e) {
    return { success: false, errors: [{ type: DbError.UNKNOWN_DB_ERROR }] };
  }
}
