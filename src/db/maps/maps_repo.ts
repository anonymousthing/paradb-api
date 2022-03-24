import { checkExists } from 'base/conditions';
import { PromisedResult, Result, ResultSuccess } from 'base/result';
import { camelCaseKeys, snakeCaseKeys } from 'db/helpers';
import { generateId, IdDomain } from 'db/id_gen';
import pool from 'db/pool';
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
          complexities: db.select('complexities', { map_id: db.parent('id') }, {
            columns: ['complexity', 'complexity_name'],
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
    return { success: false, errors: [{ type: ListMapError.UNKNOWN_DB_ERROR }] };
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
          complexities: db.select('complexities', { map_id: db.parent('id') }, {
            columns: ['complexity', 'complexity_name'],
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
    return { success: false, errors: [{ type: GetMapError.UNKNOWN_DB_ERROR }] };
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
          db.deletes('complexities', { map_id: id }).run(client),
          db.deletes('maps', { id }).run(client),
        ]),
    );
    return { success: true, value: undefined };
  } catch (e) {
    return { success: false, errors: [{ type: DeleteMapError.UNKNOWN_DB_ERROR }] };
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
): PromisedResult<PDMap, CreateMapError | ValidateMapError | ValidateMapComplexityError> {
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
        }),
      )
      .run(pool);
    const insertedComplexities = await db
      .insert(
        'complexities',
        map.complexities.map(c =>
          snakeCaseKeys({
            mapId: id,
            complexity: c.complexity,
            complexityName: c.complexityName || null,
          })
        ),
      )
      .run(pool);
    return {
      success: true,
      value: camelCaseKeys({ ...insertedMap, complexities: insertedComplexities }),
    };
  } catch (e) {
    return { success: false, errors: [{ type: CreateMapError.UNKNOWN_DB_ERROR }] };
  }
}

type RawMap = Pick<PDMap, 'title' | 'artist' | 'author' | 'description' | 'complexities'>;
export const enum ValidateMapError {
  MISMATCHED_COMPLEXITY_METADATA = 'mismatched_complexity_metadata',
  MISSING_SUBFOLDER = 'missing_subfolder',
  INCORRECT_FOLDER_NAME = 'incorrect_folder_name',
  NO_DATA = 'no_data',
  MISSING_ALBUM_ART = 'missing_album_art',
}
async function storeFile(
  opts: { id: string, mapsDir: string, mapFile: ArrayBuffer },
): PromisedResult<
  RawMap & { path: string } & Pick<PDMap, 'albumArt'>,
  ValidateMapError | ValidateMapComplexityError
> {
  const buffer = Buffer.from(opts.mapFile);
  const map = await unzipper.Open.buffer(buffer);
  // A submitted map must have exactly one directory in it, and all of the files must be under
  // that directory.
  const files = map.files.filter(f => f.type === 'File');
  const mapNameMatch = files[0].path.match(/(.+?)\//);
  let mapName = mapNameMatch ? mapNameMatch[1] : null;
  if (mapName?.startsWith('/')) {
    mapName = mapName.substring(1);
  }
  if (mapName == null || !files.every(f => f.path.startsWith(mapName + '/'))) {
    return { success: false, errors: [{ type: ValidateMapError.MISSING_SUBFOLDER }] };
  }
  const validatedResult = await validateMapFiles({ ...opts, mapFiles: files });
  if (!validatedResult.success) {
    return validatedResult;
  }
  // The map directory needs to be the same as the song title.
  // TODO: remove this check once Paradiddle supports arbitrary folder names
  if (validatedResult.value.title !== mapName) {
    return { success: false, errors: [{ type: ValidateMapError.INCORRECT_FOLDER_NAME }] };
  }
  const { title, artist, author, description, complexities, albumArtFiles } = validatedResult.value;
  const { mapFilePath, albumArt } = await writeMapFiles({
    id: opts.id,
    mapsDir: opts.mapsDir,
    buffer,
    albumArtFiles,
  });
  return {
    success: true,
    value: { title, artist, author, description, complexities, path: mapFilePath, albumArt },
  };
}

function allExists<T>(a: (T | undefined)[]): a is T[] {
  return a.every(t => t != null);
}
async function validateMapFiles(
  opts: { mapFiles: unzipper.File[], id: string, mapsDir: string },
): PromisedResult<
  RawMap & { albumArtFiles: unzipper.File[] },
  ValidateMapError | ValidateMapComplexityError
> {
  const complexityResults = await Promise.all(
    opts
      .mapFiles
      .filter(f => f.path.endsWith('.rlrr'))
      .map(f => f.buffer().then(b => validateComplexity(path.basename(f.path), b))),
  );
  if (complexityResults.length === 0) {
    return { success: false, errors: [{ type: ValidateMapError.NO_DATA }] };
  }
  const firstError = complexityResults.find(m => m.success === false);
  if (firstError && firstError.success === false) {
    return { success: false, errors: firstError.errors };
  }
  const validComplexityResults = complexityResults as ResultSuccess<RawMapComplexity>[];

  // Check that all maps have the same metadata.
  for (let i = 1; i < validComplexityResults.length; i++) {
    const map = validComplexityResults[i].value;
    // All fields except 'complexity' should match
    for (const [key, value] of Object.entries(map)) {
      if (key === 'complexity') {
        continue;
      }
      if (value !== validComplexityResults[0].value[key as keyof RawMapComplexity]) {
        return {
          success: false,
          errors: [{ type: ValidateMapError.MISMATCHED_COMPLEXITY_METADATA }],
        };
      }
    }
  }

  const albumArtFiles = validComplexityResults
    .map(v => v.value.albumArt)
    .filter((s): s is string => s != null)
    .map(fn => opts.mapFiles.find(f => path.basename(f.path) === fn));

  if (!allExists(albumArtFiles)) {
    return { success: false, errors: [{ type: ValidateMapError.MISSING_ALBUM_ART }] };
  }

  return {
    success: true,
    value: {
      title: validComplexityResults[0].value.title,
      artist: validComplexityResults[0].value.artist,
      author: validComplexityResults[0].value.author,
      description: validComplexityResults[0].value.description,
      complexities: validComplexityResults
        .map(c => ({
          complexity: c.value.complexity,
          // Currently, custom complexity names are not supported in the rlrr format. Persist them as
          // undefined for now, and use the FE fallback for Easy/Normal/Hard/Expert on render.
          complexityName: undefined,
        }))
        .sort((a, b) => a.complexity - b.complexity),
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
  // TODO: display all of the album arts in the FE, e.g. in a carousel, or when selecting a complexity
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

type RawMapComplexity = Pick<PDMap, 'title' | 'artist' | 'author' | 'albumArt' | 'description'> & {
  complexity: number,
};
export const enum ValidateMapComplexityError {
  INVALID_FORMAT = 'invalid_format',
  MISSING_VALUES = 'missing_values',
}
function validateComplexity(
  filename: string,
  mapBuffer: Buffer,
): Result<RawMapComplexity, ValidateMapComplexityError> {
  const map = JSON.parse(mapBuffer.toString());
  const metadata = map.recordingMetadata;
  if (!metadata) {
    return { success: false, errors: [{ type: ValidateMapComplexityError.INVALID_FORMAT }] };
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
          type: ValidateMapComplexityError.MISSING_VALUES,
          message: `Property ${key} was missing a value`,
        }],
      };
    }
  }
  if (requiredFields.complexity === 1) {
    if (filename.endsWith('_Medium.rlrr')) {
      requiredFields.complexity = 2;
    } else if (filename.endsWith('_Hard.rlrr')) {
      requiredFields.complexity = 3;
    } else if (filename.endsWith('_Expert.rlrr')) {
      requiredFields.complexity = 4;
    }
  }
  const optionalFields = {
    description: metadata.description,
    author: metadata.creator,
    albumArt: metadata.coverImagePath,
  };
  return { success: true, value: { ...requiredFields, ...optionalFields } };
}
