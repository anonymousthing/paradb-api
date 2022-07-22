import { ResultError } from 'base/result';
import { Request, Response } from 'express';
import { ApiError } from 'paradb-api-schema';
import { getUserSession } from 'session/session';

export const guardAuth = (req: Request, res: Response, next: () => void) => {
  const user = getUserSession(req, res);
  if (!user) {
    return;
  }
  next();
};

export function error<P, T extends ApiError & P, E extends string>(
  opts: {
    res: Response<Buffer, any>,
    statusCode: number,
    errorSerializer(o: T): Uint8Array,
    errorBody: P,
    message: string,
    resultError?: ResultError<E>,
  },
): Response<Buffer, any> {
  const { res, errorSerializer, errorBody, statusCode, message, resultError } = opts;

  const errorResponse = { success: false, statusCode, errorMessage: message, ...errorBody } as T;

  // Attach error message and tags for Sentry. Just pick the details out of the first error for now.
  const internalMessage = resultError?.errors[0].internalMessage;
  const stack = resultError?.errors[0].stack;
  const internalTags = resultError ? { type: resultError.errors[0].type } : undefined;

  const error = new Error(internalMessage || message);
  if (stack) {
    error.stack = stack;
  }
  (res as any).paradbError = error;
  (res as any).paradbErrorTags = internalTags;

  return res.status(statusCode).send(Buffer.from(errorSerializer(errorResponse)));
}

export const handleAsyncErrors = async (next: (e?: Error) => void, f: () => Promise<any>) => {
  try {
    await f();
  } catch (e) {
    next(e as Error);
  }
};
