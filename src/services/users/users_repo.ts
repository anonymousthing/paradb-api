import { PromisedResult, ResultError, wrapError } from 'base/result';
import { createPassword } from 'crypto/crypto';
import { CamelCase, camelCaseKeys, fromBytea, snakeCaseKeys, toBytea } from 'db/helpers';
import { generateId, IdDomain } from 'db/id_gen';
import { getPool } from 'db/pool';
import * as db from 'zapatos/db';
import { users } from 'zapatos/schema';
import zxcvbn from 'zxcvbn';

export type User = Omit<CamelCase<users.JSONSelectable>, 'password'> & { password: string };
export const enum AccountStatus {
  ACTIVE = 'A',
}
export const enum EmailStatus {
  UNVERIFIED = 'U',
  VERIFIED = 'V',
}

type GetUserOpts = GetUserByUsernameOpts | GetUserByIdOpts | GetUserByEmailOpts;
type GetUserByUsernameOpts = { by: 'username', username: string };
type GetUserByIdOpts = { by: 'id', id: string };
type GetUserByEmailOpts = { by: 'email', email: string };
export const enum GetUserError {
  NO_USER = 'no_user',
  UNKNOWN_DB_ERROR = 'unknown_db_error',
}
export async function getUser(opts: GetUserOpts): PromisedResult<User, GetUserError> {
  const pool = getPool();
  let user: users.JSONSelectable | undefined;
  try {
    if (opts.by === 'username') {
      user = await db
        .selectOne('users', {
          username: db.sql`lower(${db.self}) = ${db.param(opts.username.toLowerCase())}`,
        })
        .run(pool);
    } else if (opts.by === 'id') {
      user = await db.selectOne('users', { id: opts.id }).run(pool);
    } else {
      user = await db
        .selectOne('users', {
          email: db.sql`lower(${db.self}) = ${db.param(opts.email.toLowerCase())}`,
        })
        .run(pool);
    }
  } catch (e) {
    return { success: false, errors: [wrapError(e, GetUserError.UNKNOWN_DB_ERROR)] };
  }

  if (user != null) {
    return { success: true, value: { ...camelCaseKeys(user), password: fromBytea(user.password) } };
  }
  return { success: false, errors: [{ type: GetUserError.NO_USER }] };
}

function isPasswordWeak(password: string, email: string, username: string) {
  // Validate password requirements
  const passwordStrengthResult = zxcvbn(password, [email, username]);
  if (passwordStrengthResult.feedback.warning || passwordStrengthResult.score < 2) {
    return passwordStrengthResult.feedback.warning;
  }
}

type CreateUserOpts = { username: string, email: string, password: string };
export const enum CreateUserError {
  TOO_MANY_ID_GEN_ATTEMPTS = 'too_many_id_gen_attempts',
  UNKNOWN_DB_ERROR = 'unknown_db_error',
  INSECURE_PASSWORD = 'insecure_password',
  USERNAME_TAKEN = 'username_taken',
  EMAIL_TAKEN = 'email_taken',
}
export async function createUser(opts: CreateUserOpts): PromisedResult<User, CreateUserError> {
  const pool = getPool();
  const errorResult: ResultError<CreateUserError> = { success: false, errors: [] };
  // Validate password requirements
  const feedback = isPasswordWeak(opts.password, opts.email, opts.username);
  // Note that we don't early exit here with the weak password error, as we want to show all possible
  // errors to the user at once (e.g. errors with their username or email as well).
  if (feedback) {
    errorResult.errors.push({ type: CreateUserError.INSECURE_PASSWORD, userMessage: feedback });
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
    errorResult.errors.push(wrapError(e, CreateUserError.UNKNOWN_DB_ERROR));
  }

  if (errorResult.errors.length) {
    return errorResult;
  }

  const id = await generateId(
    IdDomain.USERS,
    async id => (await getUser({ by: 'id', id })).success,
  );
  if (id == null) {
    return { success: false, errors: [{ type: CreateUserError.TOO_MANY_ID_GEN_ATTEMPTS }] };
  }

  const password = await createPassword(opts.password);
  const passwordBuffer = toBytea(password);

  const now = new Date();
  try {
    const inserted = await db
      .insert(
        'users',
        snakeCaseKeys({
          id,
          creationDate: now,
          accountStatus: AccountStatus.ACTIVE,
          username: opts.username,
          email: opts.email,
          emailStatus: EmailStatus.UNVERIFIED,
          password: passwordBuffer,
          passwordUpdated: now,
        }),
      )
      .run(pool);
    return { success: true, value: camelCaseKeys(inserted) };
  } catch (e) {
    return { success: false, errors: [wrapError(e, CreateUserError.UNKNOWN_DB_ERROR)] };
  }
}

type ChangePasswordOpts = { user: User, newPassword: string };
export const enum ChangePasswordError {
  UNKNOWN_DB_ERROR = 'unknown_db_error',
  INSECURE_PASSWORD = 'insecure_password',
}
export async function changePassword(
  opts: ChangePasswordOpts,
): PromisedResult<undefined, ChangePasswordError> {
  const pool = getPool();
  const errorResult: ResultError<ChangePasswordError> = { success: false, errors: [] };

  // Validate password requirements
  const feedback = isPasswordWeak(opts.newPassword, opts.user.email, opts.user.username);
  if (feedback) {
    return {
      success: false,
      errors: [{ type: ChangePasswordError.INSECURE_PASSWORD, userMessage: feedback }],
    };
  }

  if (errorResult.errors.length) {
    return errorResult;
  }

  const password = await createPassword(opts.newPassword);
  const passwordBuffer = toBytea(password);

  const now = new Date();
  try {
    await db
      .update('users', snakeCaseKeys({ password: passwordBuffer, passwordUpdated: now }), {
        id: opts.user.id,
      })
      .run(pool);

    return { success: true, value: undefined };
  } catch (e) {
    return { success: false, errors: [wrapError(e, ChangePasswordError.UNKNOWN_DB_ERROR)] };
  }
}
