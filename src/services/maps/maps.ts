import { error, guardAuth, handleAsyncErrors } from 'api/helpers';
import { DbError } from 'db/helpers';
import { Request, Response, Router } from 'express';
import {
  deserializeSubmitMapRequest,
  serializeApiError,
  serializeDeleteMapResponse,
  serializeFindMapsResponse,
  serializeGetMapResponse,
  serializeSubmitMapError,
  serializeSubmitMapResponse,
} from 'paradb-api-schema';
import { getUserSession } from 'session/session';
import {
  createMap,
  CreateMapError,
  deleteMap,
  findMaps,
  getMap,
  GetMapError,
  ValidateMapDifficultyError,
  ValidateMapError,
} from './maps_repo';

export function createMapsRouter(mapsDir: string) {
  const mapsRouter = Router({ strict: true });

  mapsRouter.get('/', async (req, res: Response<Buffer, {}>) => {
    const result = await findMaps();
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
    const id = req.params.mapId;
    const result = await getMap(id);
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

    const deleteResult = await deleteMap(id);
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
      const result = await createMap(mapsDir, { uploader: user.id, mapFile: submitMapReq.mapData });
      if (!result.success) {
        // TODO: report all errors back to the client and not just the first one
        const [statusCode, message] = submitErrorMap[result.errors[0].type];
        return error({
          res,
          statusCode,
          errorSerializer: serializeSubmitMapError,
          errorBody: {},
          message,
          resultError: result,
        });
      }
      return res.send(
        Buffer.from(serializeSubmitMapResponse({ success: true, id: result.value.id })),
      );
    });
  });

  return mapsRouter;
}

const internalError: [number, string] = [500, 'Could not submit map'];
// dprint-ignore
const submitErrorMap: Record<
  DbError | CreateMapError | ValidateMapError | ValidateMapDifficultyError,
  [number, string]
> = {
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
