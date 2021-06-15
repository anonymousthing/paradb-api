type Serializer<T> = (t: T) => string;
type Deserializer<T> = (s: unknown) => T;
type ValidatorFactory<T> = (...args: any[]) => readonly [Serializer: Serializer<T>, Deserializer: Deserializer<T>];
type Validator<T> = ReturnType<ValidatorFactory<T>>;

type StringValidatorOpts = {
  maxLength?: number,
};

class InvalidTypeError extends Error {
  constructor(name: string, expectedType: string, value: any) {
    super(`Expected ${name} to be ${expectedType} but found type ${typeof value} instead, with value ${JSON.stringify(value)}`)
  }
}

export const str = (name: string, o?: StringValidatorOpts) => [
  (s: string) => s,
  (raw: unknown) => {
    if (typeof raw !== 'string') {
      throw new InvalidTypeError(name, 'string', raw);
    }
    if (o?.maxLength != null && raw.length > o.maxLength) {
      throw new Error(`Expected ${name} to be less than ${o.maxLength} characters, but was ${raw.length} instead`);
    }
    return raw;
  },
] as const;

export const num = (name: string) => [
  (n: number) => n.toString(),
  (raw: unknown) => {
    if (typeof raw !== 'number') {
      throw new InvalidTypeError(name, 'number', raw);
    }
    return raw;
  },
] as const;

export type Reify<Schema> = Schema extends Record<string, Validator<any>>
  ? { [K in keyof Schema]: ReturnType<Schema[K][1]> }
  : Schema extends Validator<infer T>
    ? T
    : Schema extends Serializer<infer T>
      ? T
      : Schema extends Deserializer<infer T>
        ? T
        :never;

export function rec<S extends Record<string, Validator<any>>, T = Reify<S>>(name: string, schema: S): Validator<T> {
  return [
    t => {
      const output: Partial<Record<keyof T, string>> = {};
      for (const [_key, validator] of Object.entries(schema)) {
        const key = _key as keyof T;
        output[key] = (validator as Validator<any>)[0](t[key]);
      }
      return JSON.stringify(output);
    },
    o => {
      if (typeof o !== 'object' || o == null) {
        throw new InvalidTypeError(name, 'object', o);
      }
      const output: Partial<T> = {};
      for (const [_key, validator] of Object.entries(schema)) {
        const key = _key as keyof T;
        const realValue = (o as any)[key];
        output[key] = (validator as Validator<any>)[1](realValue);
      }
      return output as T;
    },
  ];
}

const SignupRequest = rec('signupRequest', {
  username: str('username'),
  email: str('email'),
  password: str('password'),
  test: num('test'),
});
