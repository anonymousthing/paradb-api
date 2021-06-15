export type Result<T, Error extends string> =
  | { success: true, value: T }
  | { success: false, error: Error };

export type PromisedResult<T, Error extends string> = Promise<Result<T, Error>>;
