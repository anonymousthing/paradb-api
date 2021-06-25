import { checkExists, checkIsString } from 'base/conditions';
import { validatePassword } from 'crypto/crypto';
import { getUser, User } from 'db/users/users_repo';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';

type ParaDbSession = {
  id: string,
  username: string,
}
function serializeParaDbSession(user: any) {
  return JSON.stringify({
    id: checkExists(user.id, 'user.id'),
    username: checkExists(user.username, 'user.username'),
  });
}
function deserializeParaDbSession(user: unknown): ParaDbSession {
  try {
    const obj = JSON.parse(user as any);
    return {
      id: checkIsString(obj.id, 'user.id'),
      username: checkIsString(obj.username, 'user.username'),
    }
  } catch (e) {
    throw new Error(`Could not parse user session: ${user}`);
  }
}

export function installSession() {
  passport.use(new LocalStrategy(async (username, password, done) => {
    const result = await getUser({ by: 'username', username });
    if (!result.success) {
      return done(null, false, { message: 'invalid-credentials' });
    }
    const user = result.value;
    const isValid = await validatePassword(password, user.password);
    if (!isValid) {
      return done(null, false, { message: 'invalid-credentials' });
    }
    return done(null, createSessionFromUser(user));
  }));
  passport.serializeUser((user, done) => done(null, serializeParaDbSession(user)));
  passport.deserializeUser((user, done) => done(null, deserializeParaDbSession(user)));
}

export function createSessionFromUser(user: User) {
  const { id, username, accountStatus, email } = user;
  return { id, username, accountStatus, email };
}
