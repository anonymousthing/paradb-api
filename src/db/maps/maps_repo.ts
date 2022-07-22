import { checkExists } from 'base/conditions';
import { PromisedResult, Result, ResultError, wrapError } from 'base/result';
import { camelCaseKeys, snakeCaseKeys } from 'db/helpers';
import { generateId, IdDomain } from 'db/id_gen';
import { pool } from 'db/pool';
// @ts-ignore
import * as encoding from 'encoding';
import * as fs from 'fs/promises';
import { PDMap } from 'paradb-api-schema';
import path from 'path';
import * as unzipper from 'unzipper';
import * as db from 'zapatos/db';

export const enum ListMapError {
  UNKNOWN_DB_ERROR = 'unknown_db_error',
}
export async function listMaps(): PromisedResult<PDMap[], ListMapError> {
  try {
    const maps = await db
      .select('maps', db.all, {
        lateral: {
          difficulties: db.select('difficulties', { map_id: db.parent('id') }, {
            columns: ['difficulty', 'difficulty_name'],
          }),
        },
        columns: [
          'id',
          'submission_date',
          'title',
          'artist',
          'author',
          'uploader',
          'description',
          'album_art',
        ],
        order: { by: 'title', direction: 'ASC' },
      })
      .run(pool);
    return { success: true, value: maps.map(m => camelCaseKeys(m)) as PDMap[] };
  } catch (e) {
    return { success: false, errors: [wrapError(e, ListMapError.UNKNOWN_DB_ERROR)] };
  }
}

export const enum GetMapError {
  MISSING_MAP = 'missing_map',
  UNKNOWN_DB_ERROR = 'unknown_db_error',
}
export async function getMap(id: string): PromisedResult<PDMap, GetMapError> {
  try {
    const map = await db
      .selectOne('maps', { id }, {
        lateral: {
          difficulties: db.select('difficulties', { map_id: db.parent('id') }, {
            columns: ['difficulty', 'difficulty_name'],
          }),
        },
        columns: [
          'id',
          'submission_date',
          'title',
          'artist',
          'author',
          'uploader',
          'description',
          'album_art',
        ],
      })
      .run(pool);
    if (map == null) {
      return { success: false, errors: [{ type: GetMapError.MISSING_MAP }] };
    }
    return { success: true, value: camelCaseKeys(map) as PDMap };
  } catch (e) {
    return { success: false, errors: [wrapError(e, GetMapError.UNKNOWN_DB_ERROR)] };
  }
}

export const enum DeleteMapError {
  MISSING_MAP = 'missing_map',
  UNKNOWN_DB_ERROR = 'unknown_db_error',
}
export async function deleteMap(id: string): PromisedResult<undefined, DeleteMapError> {
  try {
    await db.serializable(
      pool,
      client =>
        Promise.all([
          db.deletes('difficulties', { map_id: id }).run(client),
          db.deletes('maps', { id }).run(client),
        ]),
    );
    return { success: true, value: undefined };
  } catch (e) {
    return { success: false, errors: [wrapError(e, DeleteMapError.UNKNOWN_DB_ERROR)] };
  }
}

type CreateMapOpts = {
  uploader: string,
  // zip file of the map
  mapFile: ArrayBuffer,
};
export const enum CreateMapError {
  TOO_MANY_ID_GEN_ATTEMPTS = 'too_many_id_gen_attempts',
  UNKNOWN_DB_ERROR = 'unknown_db_error',
}
export async function createMap(
  mapsDir: string,
  opts: CreateMapOpts,
): PromisedResult<PDMap, CreateMapError | ValidateMapError | ValidateMapDifficultyError> {
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
          complexity: map.complexity,
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
            difficultyName: d.difficultyName || null,
          })
        ),
      )
      .run(pool);
    return {
      success: true,
      value: camelCaseKeys({ ...insertedMap, difficulties: insertedDifficulties }),
    };
  } catch (e) {
    return { success: false, errors: [wrapError(e, CreateMapError.UNKNOWN_DB_ERROR)] };
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
  RawMap & { path: string } & Pick<PDMap, 'albumArt'>,
  ValidateMapError | ValidateMapDifficultyError
> {
  const buffer = Buffer.from(opts.mapFile);
  const map = await unzipper.Open.buffer(buffer);
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
  const validatedResult = await validateMapFiles({ mapFiles: files });
  if (!validatedResult.success) {
    return validatedResult;
  }
  // The map directory needs to be the same as the song title.
  // TODO: remove this check once Paradiddle supports arbitrary folder names
  if (validatedResult.value.title !== mapName) {
    return { success: false, errors: [{ type: ValidateMapError.INCORRECT_FOLDER_NAME }] };
  }
  const { title, artist, author, description, complexity, difficulties, albumArtFiles } =
    validatedResult.value;
  const { mapFilePath, albumArt } = await writeMapFiles({
    id: opts.id,
    mapsDir: opts.mapsDir,
    buffer,
    albumArtFiles,
  });
  return {
    success: true,
    value: {
      title,
      artist,
      author,
      description,
      complexity,
      difficulties,
      path: mapFilePath,
      albumArt,
    },
  };
}

function allExists<T>(a: (T | undefined)[]): a is T[] {
  return a.every(t => t != null);
}
export async function validateMapFiles(
  opts: { mapFiles: unzipper.File[] },
): PromisedResult<
  RawMap & { albumArtFiles: unzipper.File[] },
  ValidateMapError | ValidateMapDifficultyError
> {
  const difficultyResults = await Promise.all(
    opts
      .mapFiles
      .filter(f => f.path.endsWith('.rlrr'))
      .map(f => f.buffer().then(b => validateMapMetadata(path.basename(f.path), b))),
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
      difficulties: validDifficultyResults
        .map(d => ({
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

async function writeMapFiles(
  opts: { id: string, mapsDir: string, buffer: Buffer, albumArtFiles: unzipper.File[] },
) {
  // Write it to the maps directory
  const mapFilename = opts.id + '.zip';
  const filepath = path.resolve(opts.mapsDir, mapFilename);
  await fs.writeFile(filepath, opts.buffer);

  // For now, write all of the album art files to the album art directory.
  // TODO: display all of the album arts in the FE, e.g. in a carousel, or when selecting a difficulty
  const albumArtFolderPath = path.resolve(opts.mapsDir, opts.id);
  await fs.mkdir(albumArtFolderPath);
  await Promise.all(opts.albumArtFiles.map(a => {
    const albumArt = checkExists(a, 'albumArt');
    const albumArtPath = path.resolve(albumArtFolderPath, path.basename(albumArt.path));
    return albumArt.buffer().then(b => fs.writeFile(albumArtPath, b));
  }));

  return {
    // All file paths persisted in the DB are relative to mapsDir
    mapFilePath: mapFilename,
    albumArt: opts.albumArtFiles.length > 0
      ? path.basename(opts.albumArtFiles[0]!.path)
      : undefined,
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
