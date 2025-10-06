// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

/* --- middleware --- */
app.use(cors());
app.use(express.json({ limit: '1mb' })); // ensure JSON body is parsed

/* --- request logger (dev) --- */
app.use((req, _res, next) => {
  console.log('[REQ]', req.method, req.originalUrl);
  next();
});

/* --- quick pings --- */
app.get('/ping', (_req, res) => res.json({ ok: true, where: '/' }));
app.get('/api/ping', (_req, res) => res.json({ ok: true, where: '/api' }));
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    version: process.env.RENDER_GIT_COMMIT || 'dev',
    time: new Date().toISOString(),
  });
});

/* --- routes --- */
app.use('/api/auth', require('./routes/auth'));       // POST /api/auth/login etc.
app.use('/api/prices', require('./routes/prices'));   // if you have prices
app.use('/api/farmers', require('./routes/farmers')); // farmer + readings CRUD
app.use('/api/recommend', require('./routes/recommend'));
app.use('/api/readings', require('./routes/readings'));


/* --- 404 --- */
app.use((req, res) => {
  console.log('[404]', req.method, req.originalUrl);
  res.status(404).json({ error: 'Not Found' });
});

/* --- error handler (shows details in dev) --- */
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  const msg =
    process.env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : err?.stack || err?.message || String(err);
  res.status(500).json({ error: msg });
});

/* --- start --- */
const PORT = process.env.PORT || 3000;
mongoose
  .connect(process.env.MONGODB_URI, { autoIndex: true })
  .then(() => {
    console.log('Mongo connected');
    app.listen(PORT, () => console.log(`Listening on :${PORT}`));
  })
  .catch((e) => {
    console.error('Mongo connect error:', e);
    process.exit(1);
  });
