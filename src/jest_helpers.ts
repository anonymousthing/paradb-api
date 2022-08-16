import {
  deserializeGetUserResponse,
  deserializeSignupResponse,
  serializeSignupRequest,
} from 'paradb-api-schema';
import supertest from 'supertest';

// It's a function in order to defer execution until after the beforeAll() step has run
export const testServer = () => supertest((global as any).server);

export const testPost = async <Req, Res>(
  url: string,
  serializer: (t: Req) => Uint8Array,
  deserializer: (b: Uint8Array) => Res,
  body: Req,
  cookie?: string,
) => {
  const builder = testServer().post(url);
  if (cookie != null) {
    builder.set('Cookie', cookie);
  }
  const resp = await builder
    .type('application/octet-stream')
    .send(serializer(body));

  return deserializer(resp.body);
};

/**
 * Signs up as a test user and returns the Cookie header
 */
export const testAuthenticate = async () => {
  const resp = await testServer()
    .post('/api/users/signup')
    .type('application/octet-stream')
    .send(
      serializeSignupRequest({
        email: 'test@test.com',
        password: 'Alive-Parabola7-Stump',
        username: 'test',
      }),
    );

  expect(deserializeSignupResponse(resp.body)).toEqual({ success: true });

  return resp.headers['set-cookie'];
};
