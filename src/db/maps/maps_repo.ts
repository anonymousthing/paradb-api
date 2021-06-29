import { PromisedResult, ResultError } from 'base/result';
import { camelCaseKeys, snakeCaseKeys } from 'db/helpers';
import { generateId, IdDomain } from 'db/id_gen';
import pool from 'db/pool';
import { Complexity, PDMap } from 'paradb-api-schema';
import * as db from 'zapatos/db';

export const enum ListMapError {
  UNKNOWN_DB_ERROR = 'unknown_db_error',
};
export async function listMaps(): PromisedResult<PDMap[], ListMapError> {
  try {
    const maps = await db.select('maps', db.all, {
      lateral: {
        complexities: db.select('complexities', { map_id: db.parent('id') }, { columns: ['complexity', 'complexity_name'] }),
      },
      columns: ['id', 'submission_date', 'title', 'artist', 'author', 'uploader', 'description', 'download_link', 'album_art'],
      order: {
        by: 'title',
        direction: 'ASC',
      },
    }).run(pool);
    return {
      success: true,
      value: maps.map(m => camelCaseKeys(m)) as PDMap[],
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
export async function getMap(id: string): PromisedResult<PDMap, GetMapError> {
  try {
    const map = await db.selectExactlyOne('maps', { id }, {
      lateral: {
        complexities: db.select('complexities', { map_id: db.parent('id') }, { columns: ['complexity', 'complexity_name'] }),
      },
      columns: ['id', 'submission_date', 'title', 'artist', 'author', 'uploader', 'description', 'download_link', 'album_art'],
    }).run(pool);
    return {
      success: true,
      value: camelCaseKeys(map) as PDMap,
    };
  } catch (e) {
    return {
      success: false,
      errors: [{ type: GetMapError.UNKNOWN_DB_ERROR }],
    };
  }
};

type CreateMapOpts = {
  title: string,
  artist: string,
  author: string | undefined,
  uploader: string,
  albumArt: string | undefined,
  complexities: Complexity[],
  description: string | undefined,
  downloadLink: string,
};
export const enum CreateMapError {
  TOO_MANY_ID_GEN_ATTEMPTS = 'too_many_id_gen_attempts',
  UNKNOWN_DB_ERROR = 'unknown_db_error',
  NO_COMPLEXITIES = 'no_complexities',
};
export async function createMap(opts: CreateMapOpts): PromisedResult<PDMap, CreateMapError> {
  const errorResult: ResultError<CreateMapError> = { success: false, errors: [] };
  if (opts.complexities.length === 0) {
    errorResult.errors.push({ type: CreateMapError.NO_COMPLEXITIES });
  }
  if (errorResult.errors.length) {
    return errorResult;
  }

  const id = await generateId(IdDomain.MAPS, async (id) => (await getMap(id)).success);
  if (id == null) {
    return {
      success: false,
      errors: [{ type: CreateMapError.TOO_MANY_ID_GEN_ATTEMPTS }],
    };
  }

  const now = new Date();
  try {
    const insertedMap = await db.insert('maps', snakeCaseKeys({
      id,
      submissionDate: now,
      title: opts.title,
      artist: opts.artist,
      author: opts.author || null,
      uploader: opts.uploader,
      albumArt: opts.albumArt || null,
      description: opts.description || null,
      downloadLink: opts.downloadLink,
    })).run(pool);
    const insertedComplexities = await db.insert('complexities', opts.complexities.map(c => snakeCaseKeys({
      complexity: c.complexity,
      complexityName: c.complexityName || null,
    }))).run(pool);
    return {
      success: true,
      value: camelCaseKeys({
        ...insertedMap,
        complexities: insertedComplexities,
      }),
    };
  } catch (e) {
    return {
      success: false,
      errors: [{ type: CreateMapError.UNKNOWN_DB_ERROR }],
    };
  }
}
