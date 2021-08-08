export type ResultSuccess<T> = { success: true, value: T };
export type ResultError<E extends string> = {
  success: false,
  errors: {
    type: E,
    /**
     * An error message to be displayed to the user.
     */
    message?: string,
  }[]
};
export type Result<T, E extends string> = ResultSuccess<T> | ResultError<E>;

export type PromisedResult<T, E extends string> = Promise<Result<T, E>>;
