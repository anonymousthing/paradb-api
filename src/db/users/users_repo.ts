
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

export const MAX_ID_GEN_ATTEMPTS = 10;

type GetUserOpts = GetUserByUsernameOpts | GetUserByIdOpts;
type GetUserByUsernameOpts = {
  by: 'username',
  username: string,
};
type GetUserByIdOpts = {
  by: 'id',
  id: string,
};

export async function getUser(opts: GetUserOpts): Promise<User | undefined> {
  let user: users.JSONSelectable | undefined;
  if (opts.by === 'username') {
    user = await db.selectOne('users', {
      username: opts.username,
    }).run(pool);
  } else {
    user = await db.selectOne('users', {
      id: opts.id,
    }).run(pool);
  }
  return user
    ? {
      ...camelCaseKeys(user),
      password: fromBytea(user.password),
    }
    : undefined;
}

type CreateUserOpts = {
  username: string,
  email: string,
  password: string,
};
export async function createUser(opts: CreateUserOpts): Promise<User> {
  const password = await createPassword(opts.password);
  const passwordBuffer = toBytea(password);
  let id = idGen(IdDomain.USERS);
  for (let i = 0; i < MAX_ID_GEN_ATTEMPTS; i++) {
    if (getUser({ by: 'id', id }) != null) {
      id = idGen(IdDomain.USERS);
    } else {
      break;
    }
  }
  const now = new Date();
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
  return camelCaseKeys(inserted);
}
