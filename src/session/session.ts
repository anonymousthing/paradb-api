import { serializationDeps } from 'base/serialization_deps';
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
    // Session object is persisted into req.user
    return done(null, createSessionFromUser(user));
  }));

  // Passport session persistence
  passport.serializeUser((user, done) => {
    const serialized = serializeUserSession(serializationDeps, user as UserSession);
    done(null, { _paradbSession: serialized });
  });
  passport.deserializeUser((session, done) => {
    const { _paradbSession: data } = session as any;
    let deserialized: UserSession;
    if (Buffer.isBuffer(data)) {
      deserialized = deserializeUserSession(serializationDeps, data);
    } else if (data.data != null) {
      deserialized = deserializeUserSession(serializationDeps, new Uint8Array(data.data));
    } else {
      throw new Error();
    }
    done(null, deserialized);
  });
}

export function createSessionFromUser(user: User): UserSession {
  const { id, username, accountStatus, email } = user;
  return { id, username, accountStatus, email };
}
