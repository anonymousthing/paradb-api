
import { PromisedResult, ResultError } from 'base/result';
import { createPassword } from 'crypto/crypto';
import { CamelCase, camelCaseKeys, fromBytea, snakeCaseKeys, toBytea } from 'db/helpers';
import { IdDomain, idGen } from 'db/id_gen';
import pool from 'db/pool';
import * as db from 'zapatos/db';
import { users } from 'zapatos/schema';
import zxcvbn from 'zxcvbn';

export type User = Omit<CamelCase<users.JSONSelectable>, 'password'> & { password: string };
export const enum AccountStatus {
  ACTIVE = 'A',
};
export const enum EmailStatus {
  UNVERIFIED = 'U',
  VERIFIED = 'V',
};

type GetUserOpts = GetUserByUsernameOpts | GetUserByIdOpts | GetUserByEmailOpts;
type GetUserByUsernameOpts = {
  by: 'username',
  username: string,
};
type GetUserByIdOpts = {
  by: 'id',
  id: string,
};
type GetUserByEmailOpts = {
  by: 'email',
  email: string,
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
    } else if (opts.by === 'id') {
      user = await db.selectOne('users', {
        id: opts.id,
      }).run(pool);
    } else {
      user = await db.selectOne('users', {
        email: opts.email,
      }).run(pool);
    }
  } catch (e) {
    return {
      success: false,
      errors: [{ type: GetUserError.UNKNOWN_DB_ERROR }],
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
    errors: [{ type: GetUserError.NO_USER }],
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
  INSECURE_PASSWORD = 'insecure_password',
  USERNAME_TAKEN = 'username_taken',
  EMAIL_TAKEN = 'email_taken',
};
export const MAX_ID_GEN_ATTEMPTS = 10;
export async function createUser(opts: CreateUserOpts): PromisedResult<User, CreateUserError> {
  const errorResult: ResultError<CreateUserError> = { success: false, errors: [] };
  // Validate password requirements
  const passwordStrengthResult = zxcvbn(opts.password, [opts.email, opts.username]);
  if (passwordStrengthResult.feedback.warning || passwordStrengthResult.score < 2) {
    errorResult.errors.push({
      type: CreateUserError.INSECURE_PASSWORD,
      message: passwordStrengthResult.feedback.warning,
    });
  }

  // Test username and email existence
  try {
    const existingUsernameResult = await getUser({ by: 'username', username: opts.username });
    if (existingUsernameResult.success) {
      errorResult.errors.push({ type: CreateUserError.USERNAME_TAKEN });
    }
    const existingEmailResult = await getUser({ by: 'email', email: opts.email });
    if (existingEmailResult.success) {
      errorResult.errors.push({ type: CreateUserError.EMAIL_TAKEN });
    }
  } catch (e) {
    errorResult.errors.push({ type: CreateUserError.UNKNOWN_DB_ERROR });
  }

  if (errorResult.errors.length) {
    return errorResult;
  }

  // Create user ID
  let id = idGen(IdDomain.USERS);
  for (let i = 0; i < MAX_ID_GEN_ATTEMPTS; i++) {
    // Regenerate ID if it matched a user
    if ((await getUser({ by: 'id', id })).success) {
      id = idGen(IdDomain.USERS);
    } else if (i === MAX_ID_GEN_ATTEMPTS - 1) {
      return {
        success: false,
        errors: [{ type: CreateUserError.TOO_MANY_ID_GEN_ATTEMPTS }],
      };
    } else {
      break;
    }
  }

  const password = await createPassword(opts.password);
  const passwordBuffer = toBytea(password);

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
      errors: [{ type: CreateUserError.UNKNOWN_DB_ERROR }],
    };
  }
}
