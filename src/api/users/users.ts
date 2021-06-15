import { guardAuth, xssi } from 'api/middleware_helpers';
import { rec, Reify, str } from 'base/serialization';
import { createUser } from 'db/users/users_repo';
import express from 'express';
import passport from 'passport';
import { createSessionFromUser } from 'session/session';

const usersRouter = express.Router({ strict: true });

usersRouter.get('/me', guardAuth, xssi, (req, res) => {
  res.json((req.session as any).passport.user);
});

usersRouter.post('/login', passport.authenticate('local'), (req, res) => {
  res.end();
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
  const user = await createUser({ username, email, password });
  req.login(createSessionFromUser(user), err => {
    if (err) {
      throw new Error(err);
    }
    res.end();
  });
});

usersRouter.post('/logout', xssi, (req, res) => {
  req.logout();
  res.end();
});

export default usersRouter;
