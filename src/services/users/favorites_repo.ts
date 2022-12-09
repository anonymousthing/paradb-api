import { PromisedResult } from 'base/result';
import { camelCaseKeys, DbError } from 'db/helpers';
import { getPool } from 'db/pool';
import { Index } from 'meilisearch';
import { PDMap } from 'paradb-api-schema';
import { convertToMeilisearchMap, MapsRepo, MeilisearchMap } from 'services/maps/maps_repo';
import * as db from 'zapatos/db';

export class FavoritesRepo {
  constructor(
    private readonly mapsRepo: MapsRepo,
    private readonly meilisearchMaps: Index<MeilisearchMap>,
  ) {}

  async setFavorites(
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

      const mapFavorites = await db
        .select('maps', { id: db.conditions.isIn(mapIds) }, { columns: ['id', 'download_count'] })
        .run(pool);

      await this.meilisearchMaps.updateDocuments(
        mapFavorites.map(m => convertToMeilisearchMap(camelCaseKeys(m))),
      );
    } catch (e) {
      // TODO: better favorites error handling
      return { success: false, errors: [{ type: DbError.UNKNOWN_DB_ERROR }] };
    }

    return { success: true, value: undefined };
  }

  async getFavorites(userId: string): PromisedResult<PDMap[], DbError> {
    const pool = getPool();

    try {
      const favorites = await db.select('favorites', { user_id: userId }).run(pool);
      const ids = favorites.map(f => f.map_id);
      const mapsResult = await this.mapsRepo.findMaps({ by: 'id', ids });
      return mapsResult;
    } catch (e) {
      return { success: false, errors: [{ type: DbError.UNKNOWN_DB_ERROR }] };
    }
  }
}
