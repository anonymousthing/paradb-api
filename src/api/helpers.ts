import { Request, Response } from 'express';
import { ApiError } from 'paradb-api-schema';

export const guardAuth = (req: Request, res: Response, next: () => void) => {
  if (!req.isAuthenticated()) {
    return res.json({ success: false, message: 'Unauthorized' });
  }
  next();
};

const XSSI_PREFIX = '\'"])}while(1);</x>//';
export const xssi = (req: Request, res: Response, next: () => void) => {
  const originalSend = res.send;
  res.json = function (data) {
    const strData = typeof data === 'object'
        ? XSSI_PREFIX + JSON.stringify(data)
        : typeof data === 'string'
            ? XSSI_PREFIX + data
            : data;
    return originalSend.call(res, strData);
  }
  res.send = function (data) {
    const strData = typeof data === 'object' ? XSSI_PREFIX + JSON.stringify(data) : data;
    return originalSend.call(res, strData);
  };
  next();
};

export function error<P, T extends ApiError & P>(res: Response<T, any>, statusCode: number, message: string, additionalProps: P): Response<T, any> {
  const err = { success: false, statusCode, errorMessage: message, ...additionalProps } as T;
  return res.status(statusCode).json(err);
}
