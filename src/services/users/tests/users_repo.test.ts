import { _unwrap } from 'base/result';
import { getPool } from 'db/pool';
import { testUser } from 'jest_helpers';
import { changePassword, createUser, getUser } from 'services/users/users_repo';
import * as db from 'zapatos/db';

describe('user repository', () => {
  it('can create a user', async () => {
    const pool = getPool();
    expect((await db.select('users', {}).run(pool)).length).toEqual(0);

    const createdUser = await _unwrap(
      createUser({
        email: testUser.email,
        username: testUser.username,
        password: testUser.password,
      }),
    );
    const actualUsers = await db.select('users', {}).run(pool);

    expect(actualUsers.length).toEqual(1);
    const user = actualUsers[0];

    // Should be hashed
    expect(user.password).not.toEqual(testUser.password);
    expect(user).toEqual(
      expect.objectContaining({ email: testUser.email, username: testUser.username }),
    );
    expect(createdUser).toEqual(
      expect.objectContaining({ email: testUser.email, username: testUser.username }),
    );
    expect(/U[A-Z0-9]{6}/.test(createdUser.id)).toEqual(true);
    expect(/U[A-Z0-9]{6}/.test(user.id)).toEqual(true);
    expect(createdUser.id).toEqual(user.id);
  });

  it('can get a user', async () => {
    await createUser({
      email: testUser.email,
      username: testUser.username,
      password: testUser.password,
    });

    const user = await _unwrap(getUser({ by: 'email', email: testUser.email }));
    expect(user).toEqual(
      expect.objectContaining({ email: testUser.email, username: testUser.username }),
    );
  });

  it('can change a password', async () => {
    await createUser({
      email: testUser.email,
      username: testUser.username,
      password: testUser.password,
    });
    const originalUser = await _unwrap(getUser({ by: 'email', email: testUser.email }));
    const oldPassword = originalUser.password;

    const result = await changePassword({
      user: originalUser,
      newPassword: 'ThisIsANewPassword457',
    });
    expect(result.success).toEqual(true);

    const updatedUser = await _unwrap(getUser({ by: 'email', email: testUser.email }));
    const updatedPassword = updatedUser.password;

    expect(oldPassword).not.toEqual(updatedPassword);
    // Should be hashed
    expect(updatedPassword).not.toEqual('ThisIsANewPassword457');
  });
});
