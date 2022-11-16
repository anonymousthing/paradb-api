import { badRequest, error, getOffsetLimit, guardAuth, handleAsyncErrors } from 'api/helpers';
import { DbError } from 'db/helpers';
import { getEnvVars } from 'env';
import { Request, Response, Router } from 'express';
import { MeiliSearch } from 'meilisearch';
import {
  deserializeSubmitMapRequest,
  MapSortableAttributes,
  mapSortableAttributes,
  serializeApiError,
  serializeDeleteMapResponse,
  serializeFindMapsResponse,
  serializeGetMapResponse,
  serializeSubmitMapError,
  serializeSubmitMapResponse,
} from 'paradb-api-schema';
import { S3Error } from 'services/maps/s3_handler';
import { getUserSession } from 'session/session';
import {
  convertToMeilisearchMap,
  CreateMapError,
  deleteMap,
  getMap,
  GetMapError,
  MeilisearchMap,
  searchMaps,
  upsertMap,
  ValidateMapDifficultyError,
  ValidateMapError,
} from './maps_repo';

export async function createMapsRouter(mapsDir: string) {
  const mapsRouter = Router({ strict: true });
  const envVars = getEnvVars();

  const meilisearch = new MeiliSearch({
    host: envVars.meilisearchHost,
    apiKey: envVars.meilisearchKey,
  });
  const mapsIndex = await meilisearch.getIndex<MeilisearchMap>('maps');

  mapsRouter.get('/', async (req, res: Response<Buffer, {}>) => {
    const { query, sort: _sort, sortDirection: _sortDirection } = req.query;
    if (_sort && !mapSortableAttributes.includes(_sort as MapSortableAttributes)) {
      return badRequest(res, `Invalid sort column: ${_sort}`);
    }
    if (_sortDirection && !['asc', 'desc'].includes(_sortDirection as string)) {
      return badRequest(res, `Invalid sort direction: ${_sortDirection}`);
    }
    const sort = _sort as MapSortableAttributes | undefined;
    const sortDirection = _sortDirection as 'asc' | 'desc' | undefined;

    const { offset, limit } = getOffsetLimit(req);
    const user = getUserSession(req, res, true);
    const userId = user?.id;

    const result = await searchMaps(mapsIndex, {
      user: userId,
      query: typeof query === 'string' ? query : '',
      offset,
      limit,
      sort,
      sortDirection,
    });

    if (!result.success) {
      return error({
        res,
        statusCode: 500,
        errorSerializer: serializeApiError,
        errorBody: {},
        message: 'Could not retrieve map',
        resultError: result,
      });
    }
    return res.send(Buffer.from(serializeFindMapsResponse({ success: true, maps: result.value })));
  });

  mapsRouter.get('/:mapId', async (req, res: Response<Buffer, {}>) => {
    const user = getUserSession(req, res, true);
    const userId = user?.id;
    const id = req.params.mapId;
    const result = await getMap(id, userId);
    if (result.success === false) {
      const isMissing = result.errors.some(e => e.type === GetMapError.MISSING_MAP);
      return error({
        res,
        errorSerializer: serializeApiError,
        errorBody: {},
        statusCode: isMissing ? 404 : 500,
        message: isMissing ? 'Map not found' : 'Could not retrieve map',
        resultError: result,
      });
    }
    return res.send(Buffer.from(serializeGetMapResponse({ success: true, map: result.value })));
  });

  function sanitizeForDownload(filename: string) {
    return filename.replace(/[^a-z0-9\-\(\)\[\]]/gi, '_');
  }

  mapsRouter.get('/:mapId/download', async (req, res: Response) => {
    const id = req.params.mapId;
    const result = await getMap(id);
    if (result.success === false) {
      return res.status(404).send('Map not found');
    }
    const filename = sanitizeForDownload(result.value.title);
    return res.redirect(`${envVars.publicS3BaseUrl}/${result.value.id}.zip?title=${filename}.zip`);
  });

  mapsRouter.post('/:mapId/delete', guardAuth, async (req: Request, res: Response<Buffer, {}>) => {
    const id = req.params.mapId;
    const getResult = await getMap(id);
    if (getResult.success === false) {
      const isMissing = getResult.errors.some(e => e.type === GetMapError.MISSING_MAP);
      return error({
        res,
        errorSerializer: serializeApiError,
        errorBody: {},
        statusCode: isMissing ? 404 : 500,
        message: isMissing ? 'Map not found' : 'Could not delete map',
        resultError: getResult,
      });
    }
    const user = getUserSession(req, res);
    if (!user) {
      return;
    }
    if (user.id !== getResult.value.uploader) {
      return error({
        res,
        errorSerializer: serializeApiError,
        errorBody: {},
        statusCode: 403,
        message: 'Only the map uploader can delete their own maps',
      });
    }

    const deleteResult = await deleteMap({ id, mapsDir });
    try {
      await mapsIndex.deleteDocument(id);
    } catch (e) {
      return error({
        res,
        errorSerializer: serializeApiError,
        errorBody: {},
        statusCode: 500,
        message: 'Could not update search index',
        resultError: {
          success: false,
          errors: [{ type: 'search-index-error', internalMessage: JSON.stringify(e) }],
        },
      });
    }
    if (deleteResult.success === false) {
      return error({
        res,
        errorSerializer: serializeApiError,
        errorBody: {},
        statusCode: 500,
        message: 'Could not delete map',
        resultError: deleteResult,
      });
    }
    return res.send(Buffer.from(serializeDeleteMapResponse({ success: true })));
  });

  mapsRouter.post('/submit', guardAuth, async (req: Request, res: Response<Buffer, {}>, next) => {
    handleAsyncErrors(next, async () => {
      const user = getUserSession(req, res);
      if (!user) {
        return;
      }
      const submitMapReq = deserializeSubmitMapRequest(req.body);

      if (submitMapReq.id) {
        const mapResult = await getMap(submitMapReq.id);
        if (!mapResult.success) {
          return error({
            res,
            statusCode: 404,
            errorSerializer: serializeSubmitMapError,
            errorBody: {},
            message: `Could not find specified map to resubmit: ${submitMapReq.id}`,
            resultError: mapResult,
          });
        }
        if (mapResult.value.uploader !== user.id) {
          return error({
            res,
            statusCode: 403,
            errorSerializer: serializeSubmitMapError,
            errorBody: {},
            message: `Not authorized to modify the specified map: ${submitMapReq.id}`,
          });
        }
      }

      const submitMapResult = await upsertMap(mapsDir, {
        id: submitMapReq.id,
        uploader: user.id,
        mapFile: submitMapReq.mapData,
      });
      if (!submitMapResult.success) {
        // TODO: report all errors back to the client and not just the first one
        const [statusCode, message] = submitErrorMap[submitMapResult.errors[0].type];
        return error({
          res,
          statusCode,
          errorSerializer: serializeSubmitMapError,
          errorBody: {},
          message,
          resultError: submitMapResult,
        });
      }
      // Update search index
      try {
        await mapsIndex.addDocuments([convertToMeilisearchMap(submitMapResult.value)], {
          primaryKey: 'id',
        });
      } catch (e) {
        return error({
          res,
          errorSerializer: serializeApiError,
          errorBody: {},
          statusCode: 500,
          message: 'Could not update search index',
          resultError: {
            success: false,
            errors: [{ type: 'search-index-error', internalMessage: JSON.stringify(e) }],
          },
        });
      }
      return res.send(
        Buffer.from(serializeSubmitMapResponse({ success: true, id: submitMapResult.value.id })),
      );
    });
  });

  return mapsRouter;
}

const internalError: [number, string] = [500, 'Could not submit map'];
// dprint-ignore
const submitErrorMap: Record<
  S3Error | DbError | CreateMapError | ValidateMapError | ValidateMapDifficultyError,
  [number, string]
> = {
  [S3Error.S3_WRITE_ERROR]: internalError,
  [S3Error.S3_DELETE_ERROR]: internalError,
  [DbError.UNKNOWN_DB_ERROR]: internalError,
  [CreateMapError.TOO_MANY_ID_GEN_ATTEMPTS]: internalError,
  [ValidateMapError.INCORRECT_FOLDER_NAME]: [400, 'The top-level folder name needs to match the names of the rlrr files'],
  [ValidateMapError.INCORRECT_FOLDER_STRUCTURE]: [400, 'Incorrect folder structure. There needs to be exactly one top-level folder containing all of the files, and the folder needs to match the song title.'],
  [ValidateMapError.MISMATCHED_DIFFICULTY_METADATA]: [400, 'All difficulties need to have identical metadata (excluding complexity)'],
  [ValidateMapError.MISSING_ALBUM_ART]: [400, 'Missing album art'],
  [ValidateMapError.NO_DATA]: [400, 'Invalid map archive; could not find map data'],
  [ValidateMapDifficultyError.INVALID_FORMAT]: [400, 'Invalid map data; could not process the map .rlrr files'],
  [ValidateMapDifficultyError.MISSING_VALUES]: [400, 'Invalid map data; a map .rlrr is missing a required field (title, artist or complexity)'],
};
