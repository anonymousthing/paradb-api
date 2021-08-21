import { serializationDeps } from 'base/serialization_deps';
import { Request, Response } from 'express';
import { ApiError, serializeApiError } from 'paradb-api-schema';

export const guardAuth = (req: Request, res: Response, next: () => void) => {
  if (!req.isAuthenticated()) {
    return res.send(serializeApiError(serializationDeps, {
      success: false,
      statusCode: 403,
      errorMessage: 'Unauthorized',
    }));
  }
  next();
};

export function error<P, T extends ApiError & P>(opts: {
  res: Response<Buffer, any>,
  statusCode: number,
  errorSerializer(b: typeof serializationDeps, o: T): Buffer,
  errorBody: P,
  message: string,
  internalTags?: Record<string, string> & { message: string },
}): Response<Buffer, any> {
  const {
    res,
    errorSerializer,
    errorBody,
    statusCode,
    message,
    internalTags,
  } = opts;

  const err = {
    success: false,
    statusCode,
    errorMessage: message,
    ...errorBody,
  } as T;

  // Attach error message and tags for Sentry
  (res as any).paradbError = new Error(internalTags?.message || message);
  if (internalTags) {
    const _internalTags: Omit<typeof internalTags, 'message'> & { message?: string } = internalTags;
    delete _internalTags.message;
    (res as any).paradbErrorTags = _internalTags;
  }

  return res.status(statusCode).send(errorSerializer(serializationDeps, err));
}
