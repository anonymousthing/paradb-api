import supertest from 'supertest';

// It's a function in order to defer execution until after the beforeAll() step has run
export const testServer = () => supertest((global as any).server);

export const testPost = async <Req, Res>(
  url: string,
  serializer: (t: Req) => Uint8Array,
  deserializer: (b: Uint8Array) => Res,
  body: Req,
) => {
  const resp = await testServer()
    .post(url)
    .type('application/octet-stream')
    .send(serializer(body));

  return deserializer(resp.body);
};
