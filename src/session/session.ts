import { validatePassword } from 'crypto/crypto';
import { getUser, User } from 'db/users/users_repo';
import { deserializeUserSession, serializeUserSession, UserSession } from 'paradb-api-schema';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';

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
  passport.serializeUser((user, done) => done(null, serializeUserSession(user as any)));
  passport.deserializeUser((user, done) => done(null, deserializeUserSession(user)));
}

export function createSessionFromUser(user: User): UserSession {
  const { id, username, accountStatus, email } = user;
  return { id, username, accountStatus, email };
}
