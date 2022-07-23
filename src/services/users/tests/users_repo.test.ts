import { _unwrap } from 'base/result';
import { getPool } from 'db/pool';
import { changePassword, createUser, getUser } from 'services/users/users_repo';
import * as db from 'zapatos/db';

describe('user repository', () => {
  it('can create a user', async () => {
    const pool = getPool();
    expect((await db.select('users', {}).run(pool)).length).toEqual(0);

    const createdUser = await _unwrap(
      createUser({
        email: 'test_email@test.com',
        username: 'test_user',
        password: 'NotAWeakPassword917',
      }),
    );
    const actualUsers = await db.select('users', {}).run(pool);

    expect(actualUsers.length).toEqual(1);
    const user = actualUsers[0];

    expect(user.password).not.toEqual('NotAWeakPassword917');
    expect(user).toEqual(
      expect.objectContaining({ email: 'test_email@test.com', username: 'test_user' }),
    );
    expect(createdUser).toEqual(
      expect.objectContaining({ email: 'test_email@test.com', username: 'test_user' }),
    );
    expect(/U[A-Z0-9]{6}/.test(createdUser.id)).toEqual(true);
    expect(/U[A-Z0-9]{6}/.test(user.id)).toEqual(true);
  });

  it('can get a user', async () => {
    await createUser({
      email: 'test_email2@test.com',
      username: 'test_user2',
      password: 'NotAWeakPassword917',
    });

    const user = await _unwrap(getUser({ by: 'email', email: 'test_email2@test.com' }));
    expect(user).toEqual(
      expect.objectContaining({ email: 'test_email2@test.com', username: 'test_user2' }),
    );
  });

  it('can change a password', async () => {
    await createUser({
      email: 'test_email2@test.com',
      username: 'test_user2',
      password: 'NotAWeakPassword917',
    });
    const originalUser = await _unwrap(getUser({ by: 'email', email: 'test_email2@test.com' }));
    const oldPassword = originalUser.password;

    const result = await changePassword({
      user: originalUser,
      newPassword: 'ThisIsANewPassword457',
    });
    expect(result.success).toEqual(true);

    const updatedUser = await _unwrap(getUser({ by: 'email', email: 'test_email2@test.com' }));
    const updatedPassword = updatedUser.password;

    expect(oldPassword).not.toEqual(updatedPassword);
  });
});
