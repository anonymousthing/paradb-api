import { validatePassword } from 'crypto/crypto';
import { getUser, User } from 'db/users/users_repo';
import { Request, Response } from 'express';
import {
  deserializeLoginRequest,
  deserializeUserSession,
  serializeApiError,
  serializeUserSession,
  UserSession,
} from 'paradb-api-schema';
import passport from 'passport';

type VerifiedFn = (err: Error | null, user: any, info?: any) => void;
type VerifyFn =
    | ((req: Request, username: string, password: string, verified: VerifiedFn) => void)
    | ((username: string, password: string, verified: VerifiedFn) => void);

class LocalBinarySerializedStrategy extends passport.Strategy {
  readonly name = 'local_binary';

  constructor(
      private readonly options: { passReqToCallback?: boolean } = {},
      private readonly verify?: VerifyFn,
  ) {
    super();
    if (!verify) {
      throw new Error('LocalBinary strategy requires a verify callback');
    }
  }

  authenticate(req: Request, options?: { badRequestMessage?: string }) {
    const { username, password } = deserializeLoginRequest(req.body);
    if (!username || !password) {
      return this.fail(
          { message: options?.badRequestMessage || 'Missing credentials' } as any,
          400,
      );
    }
    const verified: VerifiedFn = (err, user, info) => {
      if (err) {
        return this.error(err);
      }
      if (!user) {
        return this.fail(info);
      }
      this.success(user, info);
    };

    try {
      if (this.options.passReqToCallback) {
        (this.verify as any)(req, username, password, verified);
      } else {
        (this.verify as any)(username, password, verified);
      }
    } catch (e) {
      return this.error(e);
    }
  }
}

export function installSession() {
  passport.use(new LocalBinarySerializedStrategy(
      {},
      async (username: string, password: string, done: VerifiedFn) => {
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
      },
  ));

  // Passport session persistence
  passport.serializeUser((user, done) => {
    const serialized = serializeUserSession(user as UserSession);
    done(null, { _paradbSession: serialized });
  });
  passport.deserializeUser((session, done) => {
    try {
      const { _paradbSession: data } = session as any;
      let deserialized: UserSession;
      if (Buffer.isBuffer(data)) {
        deserialized = deserializeUserSession(data);
      } else if (data.data != null) {
        deserialized = deserializeUserSession(new Uint8Array(data.data));
      } else {
        throw new Error();
      }
      done(null, deserialized);
    } catch (e) {
      // Couldn't deserialize session from the cookie -- might be an older format.
      // Default to logging them out.
      done(null, null);
    }
  });
}

export function createSessionFromUser(user: User): UserSession {
  const { id, username, accountStatus, email } = user;
  return { id, username, accountStatus, email };
}

export function getUserSession(req: Request, res: Response): UserSession | undefined {
  const send403 = () => {
    res.send(serializeApiError({
      success: false,
      statusCode: 403,
      errorMessage: 'Unauthorized',
    }));
  };
  if (!req.isAuthenticated()) {
    send403();
    return;
  }
  const user = req.user;
  if (!user) {
    send403();
    return;
  }
  // TODO: validate against schema
  return user as UserSession;
}
