export function checkExists<T>(t: T, propName: string): NonNullable<T> {
  if (t == null) {
    throw new Error(`expected ${propName} to exist but found ${t}`);
  }
  return t as NonNullable<T>;
}

export function checkIsString(t: any, propName: string): string {
  if (typeof t !== 'string') {
    throw new Error(`Expected ${propName} to be a string but found ${typeof t}`);
  }
  return t;
}

export class UnreachableError extends Error {
  constructor(x: never) {
    super(`Expected ${x} to be of type "never" but had value ${JSON.stringify(x)}`);
  }
}
