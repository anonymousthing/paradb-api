declare module 'bson-ext' {
  const serialize: (obj: any) => Buffer;
  const deserialize: (buf: Buffer) => any;
}
