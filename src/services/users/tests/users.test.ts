import { testPost } from 'jest_helpers';
import {
  deserializeSignupResponse,
  serializeSignupRequest,
  SignupRequest,
} from 'paradb-api-schema';

describe('signup handler', () => {
  const signup = (body: SignupRequest) =>
    testPost('/api/users/signup', serializeSignupRequest, deserializeSignupResponse, body);

  it('allows users to sign up', async () => {
    const resp1 = await signup({
      email: 'test@test.com',
      password: 'Alive-Parabola7-Stump',
      username: 'test',
    });
    const resp2 = await signup({
      email: 'test2@test.com',
      password: 'Alive-Parabola7-Stump',
      username: 'test2',
    });
    expect(resp1).toEqual({ success: true });
    expect(resp2).toEqual({ success: true });
  });

  it('does not allow users to sign up with the same username', async () => {
    const resp1 = await signup({
      email: 'test@test.com',
      password: 'Alive-Parabola7-Stump',
      username: 'test',
    });
    const resp2 = await signup({
      email: 'test2@test.com',
      password: 'Alive-Parabola7-Stump',
      username: 'test',
    });

    expect(resp1).toEqual({ success: true });
    expect(resp2).toEqual({
      success: false,
      statusCode: 400,
      username: 'This username has already been taken',
      errorMessage: '',
    });
  });

  it('does not allow users to sign up with the same email address', async () => {
    const resp1 = await signup({
      email: 'test@test.com',
      password: 'Alive-Parabola7-Stump',
      username: 'test',
    });
    const resp2 = await signup({
      email: 'test@test.com',
      password: 'Alive-Parabola7-Stump',
      username: 'test2',
    });

    expect(resp1).toEqual({ success: true });
    expect(resp2).toEqual({
      success: false,
      statusCode: 400,
      email: 'This email has already been registered',
      errorMessage: '',
    });
  });

  it('does not allow weak passwords', async () => {
    const responses = await Promise.all([
      signup({ email: 'test@test.com', password: 'v1n98', username: 'test' }),
      signup({ email: 'test@test.com', password: 'password', username: 'test' }),
      signup({ email: 'test@test.com', password: '12345678', username: 'test' }),
      signup({ email: 'test@test.com', password: 'testtest', username: 'test' }),
    ]);
    const weakPasswordError = { success: false, statusCode: 400, errorMessage: '' };
    expect(responses).toEqual([
      { ...weakPasswordError, password: 'Your password is too short' },
      { ...weakPasswordError, password: 'This is a top-10 common password' },
      { ...weakPasswordError, password: 'This is a top-10 common password' },
      {
        ...weakPasswordError,
        password: 'Repeats like "abcabcabc" are only slightly harder to guess than "abc"',
      },
    ]);
  });
});
