import { error, guardAuth, xssi } from 'api/helpers';
import { UnreachableError } from 'base/conditions';
import { createUser, CreateUserError, User } from 'db/users/users_repo';
import { Request, Response, Router } from 'express';
import { ApiError, deserializeSignupRequest, SignupError, SignupResponse } from 'paradb-api-schema';
import passport from 'passport';
import { createSessionFromUser } from 'session/session';

const usersRouter = Router({ strict: true });

usersRouter.get('/me', xssi, guardAuth, (req, res) => {
  res.json({ success: true, user: req.user });
});

usersRouter.post('/login', xssi, passport.authenticate('local'), (req, res) => {
  res.json({ success: true });
});

usersRouter.post('/signup', xssi, async (req, res): Promise<Response<any, SignupResponse>> => {
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
    return error(res, statusCode, errorMessage, signupError);
  }
  try {
    await login(req, result.value);
  } catch (e) {
    return error(res, 500, 'Could not login as newly created user.', { username: undefined, email: undefined, password: undefined });
  }
  return (res as Response<any, SignupResponse>).json({ success: true });
});

async function login(req: Request, user: User): Promise<void> {
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
