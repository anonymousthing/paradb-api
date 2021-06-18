import { guardAuth, xssi } from 'api/middleware_helpers';
import { rec, Reify, str } from 'base/serialization';
import { createUser } from 'db/users/users_repo';
import express from 'express';
import passport from 'passport';
import { createSessionFromUser } from 'session/session';

const usersRouter = express.Router({ strict: true });

usersRouter.get('/me', xssi, guardAuth, (req, res) => {
  res.json({ success: true, user: req.user });
});

usersRouter.post('/login', xssi, passport.authenticate('local'), (req, res) => {
  res.json({ success: true });
});

const [serializeSignupRequest, deserializeSignupRequest] = rec('signupRequest', {
  username: str('username'),
  email: str('email'),
  password: str('password'),
});
type SignupRequest = Reify<typeof serializeSignupRequest>;

usersRouter.post('/signup', xssi, async (req, res) => {
  const signupRequest = deserializeSignupRequest(req.body);
  const { username, email, password } = signupRequest;
  const result = await createUser({ username, email, password });
  // TODO: API -> FE error handling
  if (result.success === false) {
    throw new Error(result.error);
  }
  req.login(createSessionFromUser(result.value), err => {
    if (err) {
      throw new Error(err);
    }
    res.json({ success: true });
  });
});

export default usersRouter;
