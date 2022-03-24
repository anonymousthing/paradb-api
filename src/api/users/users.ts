import { error, guardAuth } from 'api/helpers';
import { UnreachableError } from 'base/conditions';
import { validatePassword } from 'crypto/crypto';
import { changePassword, ChangePasswordError, createUser, CreateUserError, getUser, User } from 'db/users/users_repo';
import { Request, Response, Router } from 'express';
import {
  ApiError,
  deserializeChangePasswordRequest,
  deserializeSignupRequest,
  serializeApiError,
  serializeApiSuccess,
  serializeChangePasswordResponse,
  serializeGetUserResponse,
  serializeSignupResponse,
  SignupError,
} from 'paradb-api-schema';
import passport from 'passport';
import { createSessionFromUser, getUserSession } from 'session/session';

const usersRouter = Router({ strict: true });

usersRouter.get('/me', guardAuth, (req, res) => {
  const user = getUserSession(req, res);
  if (!user) {
    return;
  }
  res.send(serializeGetUserResponse({ success: true, user }));
});

usersRouter.post('/login', async (req, res: Response<Buffer, {}>) => {
  try {
    await authenticate(req, res);
    return res.send(Buffer.from(serializeApiSuccess({ success: true })));
  } catch (e) {
    return error({
      res,
      statusCode: 401,
      errorSerializer: serializeApiError,
      errorBody: {},
      message: 'Invalid credentials',
    });
  }
});

usersRouter.post('/signup', async (req, res: Response<Buffer, {}>) => {
  const signupRequest = deserializeSignupRequest(req.body);
  const { username, email, password } = signupRequest;
  const result = await createUser({ username, email, password });
  if (!result.success) {
    // Error defaults
    let statusCode = 500;
    let errorMessage = '';
    const signupError: Omit<SignupError, keyof ApiError> = {
      email: undefined,
      password: undefined,
      username: undefined,
    };
    for (const error of result.errors) {
      switch (error.type) {
        case CreateUserError.USERNAME_TAKEN:
          statusCode = 400;
          signupError.username = 'This username has already been taken';
          break;
        case CreateUserError.EMAIL_TAKEN:
          statusCode = 400;
          signupError.email = 'This email has already been registered';
          break;
        case CreateUserError.INSECURE_PASSWORD:
          statusCode = 400;
          signupError.password = error.message || 'Your password is not strong enough';
          break;
        case CreateUserError.TOO_MANY_ID_GEN_ATTEMPTS:
          statusCode = 500;
          errorMessage = 'Could not create user, please try again later';
          break;
        case CreateUserError.UNKNOWN_DB_ERROR:
          statusCode = 500;
          errorMessage = 'Unknown error, please try again later';
          break;
        default:
          throw new UnreachableError(error.type);
      }
    }
    return error({
      res,
      statusCode,
      errorSerializer: serializeSignupResponse,
      errorBody: signupError,
      message: errorMessage,
      internalTags: { message: result.errors[0].type },
    });
  }
  try {
    await establishSession(req, result.value);
  } catch (e) {
    return error({
      res,
      statusCode: 500,
      errorSerializer: serializeSignupResponse,
      errorBody: {
        username: undefined,
        email: undefined,
        password: undefined,
      },
      message: 'Could not login as newly created user.',
    });
  }
  return res.send(Buffer.from(serializeApiSuccess({ success: true })));
});

usersRouter.post('/changePassword', async (req, res: Response<Buffer, {}>) => {
  const changeReq = deserializeChangePasswordRequest(req.body);
  const { id, oldPassword, newPassword } = changeReq;

  const userResult = await getUser({ by: 'id', id });
  if (!userResult.success) {
    return error({
      res,
      statusCode: 403,
      errorSerializer: serializeChangePasswordResponse,
      errorBody: { oldPassword: undefined, newPassword: undefined },
      message: 'Invalid user ID',
    });
  }
  const user = userResult.value;

  if (!(await validatePassword(oldPassword, user.password))) {
    return error({
      res,
      statusCode: 403,
      errorSerializer: serializeChangePasswordResponse,
      errorBody: { oldPassword: 'Incorrect current password.', newPassword: undefined },
      message: '',
    });
  }

  const changePasswordResult = await changePassword({ newPassword, user });
  if (!changePasswordResult.success) {
    const insecurePasswordError = changePasswordResult.errors.find(e => e.type === ChangePasswordError.INSECURE_PASSWORD);
    if (insecurePasswordError) {
      return error({
        res,
        statusCode: 400,
        errorSerializer: serializeChangePasswordResponse,
        errorBody: {
          oldPassword: undefined,
          newPassword: insecurePasswordError.message || 'New password is too insecure.',
        },
        message: '',
      });
    } else {
      return error({
        res,
        statusCode: 500,
        errorSerializer: serializeChangePasswordResponse,
        errorBody: { oldPassword: undefined, newPassword: undefined },
        message: 'Unknown DB error',
      });
    }
  }
  return res.send(Buffer.from(serializeApiSuccess({ success: true })));
});

async function authenticate(req: Request, resp: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    passport.authenticate('local_binary', (err, user, info) => {
      // TODO: differentiate between 500 and invalid credentials
      if (err || !user) {
        return reject(err);
      }
      req.login(user, err => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    })(req, resp);
  });
}

async function establishSession(req: Request, user: User): Promise<void> {
  return new Promise((res, rej) => {
    req.login(createSessionFromUser(user), err => {
      if (err) {
        rej(err);
      }
      res();
    });
  });
}

export default usersRouter;
