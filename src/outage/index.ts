import express from 'express';
import * as fs from 'fs';
import * as path from 'path';

const app = express();

app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'index.html'));
});
app.get('/favicon.png', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../../static/favicon.png'));
});
app.listen(8080, () => {
  console.log('Listening on 8080');
});
