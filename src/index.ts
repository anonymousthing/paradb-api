require('dotenv').config();

import cookieParser from 'cookie-parser';
import session from 'cookie-session';
import express from 'express';
import passport from 'passport';
import path from 'path';
import { installSession } from 'session/session';
import apiRouter from './api/api';

if (process.env.PGUSER == '' && process.env.PGPASSWORD == '') {
  console.error('PGUSER and PGPASSWORD have been left blank in .env -- intentional?');
}

const port = 8080;
const app = express();

installSession();

app.use(cookieParser());
app.use(express.json());
app.use(session({
  secret: 'catsaregreat',
}))
app.use(passport.initialize());
app.use(passport.session());

app.get('/favicon.ico', (req, res) => {
  res.status(404).end();
});

app.use('/api', apiRouter);

// Serve static assets
app.use('/static', express.static(path.join(__dirname, '../fe/')));
// Always serve the React SPA for all non-static and non-api routes.
app.get([
  '/',
  '/login',
  '/signup',
  '/map/*',
], (req, res) => {
  res.sendFile(path.join(__dirname, '../fe/index.html'));
});
app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

app.listen(port, () => {
  console.log(`Listening on ${port}`);
});
