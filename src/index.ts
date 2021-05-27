require('dotenv').config();

import express from 'express';
import path from 'path';
import apiRouter from './api';

const port = 8080;
const app = express();

app.use('/api', apiRouter);

app.get('/favicon.ico', (req, res) => {
  res.status(404).end();
});
// Serve static assets
app.use('/static', express.static(path.join(__dirname, '../fe/static')));
// Always serve the React SPA for all non-static and non-api routes.
app.use('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../fe/index.html'));
});

app.listen(port, () => {
  console.log(`Listening on ${port}`);
});
