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

export function error<P, T extends ApiError & P>(
  opts: {
    res: Response<Buffer, any>,
    statusCode: number,
    errorSerializer(o: T): Uint8Array,
    errorBody: P,
    message: string,
    internalTags?: Record<string, string> & { message: string },
  },
): Response<Buffer, any> {
  const { res, errorSerializer, errorBody, statusCode, message, internalTags } = opts;

  const err = { success: false, statusCode, errorMessage: message, ...errorBody } as T;

  // Attach error message and tags for Sentry
  (res as any).paradbError = new Error(internalTags?.message || message);
  if (internalTags) {
    const _internalTags: Omit<typeof internalTags, 'message'> & { message?: string } = internalTags;
    delete _internalTags.message;
    (res as any).paradbErrorTags = _internalTags;
  }

  return res.status(statusCode).send(Buffer.from(errorSerializer(err)));
}

export const handleAsyncErrors = async (next: (e?: Error) => void, f: () => Promise<any>) => {
  try {
    await f();
  } catch (e) {
    next(e);
  }
};
