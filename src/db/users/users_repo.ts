
import { PromisedResult } from 'base/result';
import { createPassword } from 'crypto/crypto';
import { CamelCase, camelCaseKeys, fromBytea, snakeCaseKeys, toBytea } from 'db/helpers';
import { IdDomain, idGen } from 'db/id_gen';
import pool from 'db/pool';
import * as db from 'zapatos/db';
import { users } from 'zapatos/schema';

export type User = Omit<CamelCase<users.JSONSelectable>, 'password'> & { password: string };
export const enum AccountStatus {
  ACTIVE = 'A',
};
export const enum EmailStatus {
  UNVERIFIED = 'U',
  VERIFIED = 'V',
};

type GetUserOpts = GetUserByUsernameOpts | GetUserByIdOpts;
type GetUserByUsernameOpts = {
  by: 'username',
  username: string,
};
type GetUserByIdOpts = {
  by: 'id',
  id: string,
};
export const enum GetUserError {
  NO_USER = 'no_user',
  UNKNOWN_DB_ERROR = 'unknown_db_error',
};
export async function getUser(opts: GetUserOpts): PromisedResult<User, GetUserError> {
  let user: users.JSONSelectable | undefined;
  try {
    if (opts.by === 'username') {
      user = await db.selectOne('users', {
        username: opts.username,
      }).run(pool);
    } else {
      user = await db.selectOne('users', {
        id: opts.id,
      }).run(pool);
    }
  } catch (e) {
    return {
      success: false,
      error: GetUserError.UNKNOWN_DB_ERROR,
    };
  }

  if (user != null) {
    return {
      success: true,
      value: {
        ...camelCaseKeys(user),
        password: fromBytea(user.password),
      },
    };
  }
  return {
    success: false,
    error: GetUserError.NO_USER,
  };
}

type CreateUserOpts = {
  username: string,
  email: string,
  password: string,
};
export const enum CreateUserError {
  TOO_MANY_ID_GEN_ATTEMPTS = 'too_many_id_gen_attempts',
  UNKNOWN_DB_ERROR = 'unknown_db_error',
};
export const MAX_ID_GEN_ATTEMPTS = 10;
export async function createUser(opts: CreateUserOpts): PromisedResult<User, CreateUserError> {
  const password = await createPassword(opts.password);
  const passwordBuffer = toBytea(password);
  let id = idGen(IdDomain.USERS);
  for (let i = 0; i < MAX_ID_GEN_ATTEMPTS; i++) {
    // Regenerate ID if it matched a user
    if ((await getUser({ by: 'id', id })).success === true) {
      id = idGen(IdDomain.USERS);
    } else if (i === MAX_ID_GEN_ATTEMPTS - 1) {
      return {
        success: false,
        error: CreateUserError.TOO_MANY_ID_GEN_ATTEMPTS,
      };
    }
  }
  const now = new Date();
  try {
    const inserted = await db.insert('users', snakeCaseKeys({
      id,
      creationDate: now,
      accountStatus: AccountStatus.ACTIVE,
      username: opts.username,
      email: opts.email,
      emailStatus: EmailStatus.UNVERIFIED,
      password: passwordBuffer,
      passwordUpdated: now,
    })).run(pool);
    return {
      success: true,
      value: camelCaseKeys(inserted),
    };
  } catch (e) {
    return {
      success: false,
      error: CreateUserError.UNKNOWN_DB_ERROR,
    };
  }
}
