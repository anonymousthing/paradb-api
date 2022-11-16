import { checkExists } from 'base/conditions';
import { PromisedResult, Result, ResultError, wrapError } from 'base/result';
import { camelCaseKeys, DbError, snakeCaseKeys } from 'db/helpers';
import { generateId, IdDomain } from 'db/id_gen';
import { getPool } from 'db/pool';
// @ts-ignore
import * as encoding from 'encoding';
import { Index } from 'meilisearch';
import { MapSortableAttributes, PDMap } from 'paradb-api-schema';
import path from 'path';
import { deleteFiles, S3Error, uploadFiles } from 'services/maps/s3_handler';
import * as unzipper from 'unzipper';
import * as db from 'zapatos/db';

const exists = <T>(t: T | undefined): t is NonNullable<T> => !!t;

export type MeilisearchMap = {
  id: string,
  title: string,
  artist: string,
  author: string,
  uploader: string,
  description: string,
  submissionDate: number,
  favorites: number,
};
export type FindMapsBy = { by: 'id', ids: string[] };

// TODO: add search parameters to findMaps
export async function findMaps(by?: FindMapsBy, userId?: string): PromisedResult<PDMap[], DbError> {
  const pool = getPool();

  const whereable = by ? { id: db.conditions.isIn(by.ids) } : db.all;

  try {
    const maps = await db
      .select('maps', whereable, {
        lateral: {
          difficulties: db.select('difficulties', { map_id: db.parent('id') }, {
            columns: ['difficulty', 'difficulty_name'],
          }),
          favorites: db.count('favorites', { map_id: db.parent('id') }),
          ...(userId
            ? {
              userProjection: db.selectOne('favorites', {
                map_id: db.parent('id'),
                user_id: userId,
              }, {
                columns: [],
                lateral: {
                  isFavorited: db.selectOne('favorites', {
                    map_id: db.parent('map_id'),
                    user_id: userId,
                  }, { alias: 'favorites2' }),
                },
              }),
            }
            : {}),
        },
        columns: [
          'id',
          'submission_date',
          'title',
          'artist',
          'author',
          'uploader',
          'description',
          'complexity',
          'album_art',
        ],
        order: { by: 'title', direction: 'ASC' },
      })
      .run(pool);
    return {
      success: true,
      value: maps.map(m => ({
        ...camelCaseKeys(m),
        userProjection: {
          isFavorited: !!m
            .userProjection
            ?.isFavorited,
        },
      })),
    };
  } catch (e) {
    return { success: false, errors: [wrapError(e, DbError.UNKNOWN_DB_ERROR)] };
  }
}

/** User id is used for projections (favorites, etc) */
export async function searchMaps(
  index: Index<MeilisearchMap>,
  searchOptions: {
    user?: string,
    query: string,
    sort?: MapSortableAttributes,
    sortDirection?: 'asc' | 'desc',
    offset: number,
    limit: number,
  },
): PromisedResult<PDMap[], DbError> {
  const { user, query, offset, limit, sort, sortDirection } = searchOptions;
  const response = await index.search<MeilisearchMap>(query, {
    offset,
    limit,
    sort: sort && sortDirection ? [`${sort}:${sortDirection}`] : undefined,
  });
  const searchResults = response.hits;
  const ids = searchResults.map(r => r.id);

  const mapsResult = await findMaps({ by: 'id', ids }, user);
  if (!mapsResult.success) {
    return mapsResult;
  }

  const maps = new Map(mapsResult.value.map(m => [m.id, m]));
  return { success: true, value: searchResults.map(m => maps.get(m.id)).filter(exists) };
}

export function convertToMeilisearchMap(map: PDMap): MeilisearchMap {
  const { id, title, artist, author, uploader, description, submissionDate, favorites } = map;
  return {
    id,
    title,
    artist,
    author: author || '',
    uploader,
    description: description || '',
    submissionDate: Number(new Date(submissionDate)),
    favorites,
  };
}

export const enum GetMapError {
  MISSING_MAP = 'missing_map',
  UNKNOWN_DB_ERROR = 'unknown_db_error',
}
export async function getMap(mapId: string, userId?: string): PromisedResult<PDMap, GetMapError> {
  const pool = getPool();
  try {
    const map = await db
      .selectOne('maps', { id: mapId }, {
        lateral: {
          difficulties: db.select('difficulties', { map_id: db.parent('id') }, {
            columns: ['difficulty', 'difficulty_name'],
          }),
          favorites: db.count('favorites', { map_id: db.parent('id') }),
        },
        columns: [
          'id',
          'submission_date',
          'title',
          'artist',
          'author',
          'uploader',
          'description',
          'complexity',
          'album_art',
        ],
      })
      .run(pool);
    if (map == null) {
      return { success: false, errors: [{ type: GetMapError.MISSING_MAP }] };
    }
    const userProjection = userId
      ? {
        isFavorited: !!(await db
          .selectOne('favorites', { map_id: mapId, user_id: userId })
          .run(pool)),
      }
      : undefined;
    return { success: true, value: { ...camelCaseKeys(map), userProjection } };
  } catch (e) {
    return { success: false, errors: [wrapError(e, GetMapError.UNKNOWN_DB_ERROR)] };
  }
}

export const enum DeleteMapError {
  MISSING_MAP = 'missing_map',
}
export async function deleteMap(
  id: string,
): PromisedResult<undefined, DbError | DeleteMapError | S3Error> {
  const pool = getPool();
  try {
    // Delete dependent tables / foreign keys first
    await Promise.all([
      db.deletes('difficulties', { map_id: id }).run(pool),
      db.deletes('favorites', { map_id: id }).run(pool),
    ]);
    // Delete the map
    // TODO: soft deletion
    const deleted = await db.deletes('maps', { id }).run(pool);
    if (deleted.length === 0) {
      return { success: false, errors: [{ type: DeleteMapError.MISSING_MAP }] };
    }
    return deleteFiles({ id });
  } catch (e) {
    return { success: false, errors: [wrapError(e, DbError.UNKNOWN_DB_ERROR)] };
  }
}

type CreateMapOpts = {
  uploader: string,
  // zip file of the map
  mapFile: ArrayBuffer,
};
export const enum CreateMapError {
  TOO_MANY_ID_GEN_ATTEMPTS = 'too_many_id_gen_attempts',
}
export async function createMap(
  mapsDir: string,
  opts: CreateMapOpts,
): PromisedResult<
  PDMap,
  S3Error | DbError | CreateMapError | ValidateMapError | ValidateMapDifficultyError
> {
  const pool = getPool();
  const id = await generateId(IdDomain.MAPS, async id => (await getMap(id)).success);
  if (id == null) {
    return { success: false, errors: [{ type: CreateMapError.TOO_MANY_ID_GEN_ATTEMPTS }] };
  }

  const mapResult = await storeFile({ id, mapsDir: mapsDir, mapFile: opts.mapFile });

  if (!mapResult.success) {
    return mapResult;
  }
  const map = mapResult.value;

  const now = new Date();
  try {
    const insertedMap = await db
      .insert(
        'maps',
        snakeCaseKeys({
          id,
          submissionDate: now,
          title: map.title,
          artist: map.artist,
          author: map.author || null,
          uploader: opts.uploader,
          albumArt: map.albumArt || null,
          description: map.description || null,
          complexity: checkExists(map.complexity, 'complexity'),
        }),
      )
      .run(pool);
    const insertedDifficulties = await db
      .insert(
        'difficulties',
        map.difficulties.map(d =>
          snakeCaseKeys({
            mapId: id,
            difficulty: d.difficulty || null,
            difficultyName: checkExists(d.difficultyName, 'difficultyName'),
          })
        ),
      )
      .run(pool);
    return {
      success: true,
      value: camelCaseKeys({
        ...insertedMap,
        difficulties: insertedDifficulties,
        // A newly created map will never be favorited
        favorites: 0,
        userProjection: { isFavorited: false },
      }),
    };
  } catch (e) {
    return { success: false, errors: [wrapError(e, DbError.UNKNOWN_DB_ERROR)] };
  }
}

type RawMap = Pick<
  PDMap,
  'title' | 'artist' | 'author' | 'description' | 'complexity' | 'difficulties'
>;
export const enum ValidateMapError {
  MISMATCHED_DIFFICULTY_METADATA = 'mismatched_difficulty_metadata',
  INCORRECT_FOLDER_STRUCTURE = 'incorrect_folder_structure',
  INCORRECT_FOLDER_NAME = 'incorrect_folder_name',
  NO_DATA = 'no_data',
  MISSING_ALBUM_ART = 'missing_album_art',
}
async function storeFile(
  opts: { id: string, mapsDir: string, mapFile: ArrayBuffer },
): PromisedResult<
  RawMap & Pick<PDMap, 'albumArt'>,
  S3Error | ValidateMapError | ValidateMapDifficultyError
> {
  const buffer = Buffer.from(opts.mapFile);
  let map: unzipper.CentralDirectory;
  try {
    map = await unzipper.Open.buffer(buffer);
  } catch (e) {
    // Failed to open zip -- corrupted, or incorrect format
    return { success: false, errors: [{ type: ValidateMapError.NO_DATA }] };
  }
  // A submitted map must have exactly one directory in it, and all of the files must be directly
  // under that directory.
  const files = map.files.filter(f => f.type === 'File');
  let mapName = files[0].path.match(/(.+?)\//)?.[1];
  if (mapName?.startsWith('/')) {
    mapName = mapName.substring(1);
  }
  if (mapName == null || !files.every(f => path.dirname(f.path) === mapName)) {
    return { success: false, errors: [{ type: ValidateMapError.INCORRECT_FOLDER_STRUCTURE }] };
  }
  const validatedResult = await validateMapFiles({ expectedMapName: mapName, mapFiles: files });
  if (!validatedResult.success) {
    return validatedResult;
  }
  const { title, artist, author, description, complexity, difficulties, albumArtFiles } =
    validatedResult.value;
  const uploadResult = await uploadFiles({
    id: opts.id,
    mapsDir: opts.mapsDir,
    buffer,
    albumArtFiles,
  });
  if (!uploadResult.success) {
    return uploadResult;
  }

  return {
    success: true,
    value: {
      title,
      artist,
      author,
      description,
      complexity,
      difficulties,
      albumArt: uploadResult.value,
    },
  };
}

function allExists<T>(a: (T | undefined)[]): a is T[] {
  return a.every(t => t != null);
}
export async function validateMapFiles(
  opts: { expectedMapName: string, mapFiles: unzipper.File[] },
): PromisedResult<
  RawMap & { albumArtFiles: unzipper.File[] },
  ValidateMapError | ValidateMapDifficultyError
> {
  // The map directory needs to have the same name as the rlrr files.
  // TODO: remove this check once Paradiddle supports arbitrary folder names
  const difficultyFiles = opts.mapFiles.filter(f => f.path.endsWith('.rlrr'));
  if (!difficultyFiles.every(f => path.basename(f.path).startsWith(opts.expectedMapName))) {
    return { success: false, errors: [{ type: ValidateMapError.INCORRECT_FOLDER_NAME }] };
  }

  const difficultyResults = await Promise.all(
    difficultyFiles.map(f => f.buffer().then(b => validateMapMetadata(path.basename(f.path), b))),
  );
  if (difficultyResults.length === 0) {
    return { success: false, errors: [{ type: ValidateMapError.NO_DATA }] };
  }
  const firstError = difficultyResults.find(m => m.success === false);
  if (firstError && firstError.success === false) {
    return { success: false, errors: firstError.errors };
  }

  const validDifficultyResults = difficultyResults as Exclude<
    (typeof difficultyResults)[number],
    ResultError<ValidateMapDifficultyError>
  >[];

  // Check that all maps have the same metadata.
  for (let i = 1; i < validDifficultyResults.length; i++) {
    const map = validDifficultyResults[i].value;
    for (const [key, value] of Object.entries(map)) {
      // Difficulty name is expected to change between difficulties.
      // Complexity is not, but some existing maps have mismatched complexities between rlrr files,
      // and so this check has been skipped temporarily.
      // TODO: fix all maps with mismatched complexities
      if (key === 'difficultyName' || key === 'complexity') {
        continue;
      }
      const expected = validDifficultyResults[0].value[key as keyof RawMapMetadata];
      if (value !== expected) {
        return {
          success: false,
          errors: [{
            type: ValidateMapError.MISMATCHED_DIFFICULTY_METADATA,
            userMessage: `mismatched '${key}': '${value}' vs '${expected}'`,
          }],
        };
      }
    }
  }

  const albumArtFiles = validDifficultyResults
    .map(v => v.value.albumArt)
    .filter((s): s is string => s != null)
    .map(fn => opts.mapFiles.find(f => path.basename(f.path) === fn));

  if (!allExists(albumArtFiles)) {
    return { success: false, errors: [{ type: ValidateMapError.MISSING_ALBUM_ART }] };
  }

  return {
    success: true,
    value: {
      title: validDifficultyResults[0].value.title,
      artist: validDifficultyResults[0].value.artist,
      author: validDifficultyResults[0].value.author,
      description: validDifficultyResults[0].value.description,
      complexity: validDifficultyResults[0].value.complexity,
      difficulties: validDifficultyResults.map(d => ({
        // Currently, custom difficulty values are not supported in the rlrr format. Persist them as
        // undefined for now, and look into generating a difficulty level later based on the map
        // content.
        difficulty: undefined,
        difficultyName: d.value.difficultyName,
      })),
      albumArtFiles,
    },
  };
}

type RawMapMetadata = Pick<
  PDMap,
  'title' | 'artist' | 'author' | 'albumArt' | 'description' | 'complexity'
>;
export const enum ValidateMapDifficultyError {
  INVALID_FORMAT = 'invalid_format',
  MISSING_VALUES = 'missing_values',
}
function validateMapMetadata(
  filename: string,
  mapBuffer: Buffer,
): Result<RawMapMetadata & { difficultyName: string }, ValidateMapDifficultyError> {
  let map: any;
  try {
    map = parseJsonBuffer(mapBuffer);
  } catch (e) {
    return { success: false, errors: [{ type: ValidateMapDifficultyError.INVALID_FORMAT }] };
  }
  const metadata = map.recordingMetadata;
  if (!metadata) {
    return { success: false, errors: [{ type: ValidateMapDifficultyError.INVALID_FORMAT }] };
  }
  const requiredFields = {
    title: metadata.title,
    artist: metadata.artist,
    complexity: metadata.complexity,
  };
  for (const [key, value] of Object.entries(requiredFields)) {
    if (value == null) {
      return {
        success: false,
        errors: [{
          type: ValidateMapDifficultyError.MISSING_VALUES,
          userMessage: `Property ${key} was missing a value`,
        }],
      };
    }
  }
  const optionalFields = {
    description: metadata.description,
    author: metadata.creator,
    albumArt: metadata.coverImagePath,
  };
  const difficultyMatch = filename.match(/.*_(.+?).rlrr/);
  if (difficultyMatch == null) {
    return { success: false, errors: [{ type: ValidateMapDifficultyError.INVALID_FORMAT }] };
  }
  return {
    success: true,
    value: { ...requiredFields, ...optionalFields, difficultyName: difficultyMatch[1] },
  };
}

function parseJsonBuffer(buffer: Buffer) {
  if (buffer.indexOf('\uFEFF', 0, 'utf16le') === 0) {
    return JSON.parse(encoding.convert(buffer, 'utf8', 'utf16le'));
  }
  return JSON.parse(buffer.toString());
}
