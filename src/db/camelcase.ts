// @ts-ignore
import _camelcaseKeys from 'camelcase-keys-recursive';

type CamelCaseKey<T extends PropertyKey> =
  T extends string
    ? string extends T
      ? string
      : T extends `${infer F}_${infer R}`
          ? `${F}${Capitalize<CamelCaseKey<R>>}`
          : T
    : T;

interface NonArrayObject {
  [key: string]: string | number | boolean | NonArrayObject | NonArrayObject[]
}
type CamelCase<T> = {
  [K in keyof T as CamelCaseKey<K>]: T[K] extends NonArrayObject
    ? CamelCase<T[K]>
    : T[K] extends (infer V)[]
        ? CamelCase<V>[]
        : T[K]
};

export function camelCaseKeys<T>(data: T): CamelCase<T> {
  return (_camelcaseKeys(data) as unknown) as CamelCase<T>;
}
