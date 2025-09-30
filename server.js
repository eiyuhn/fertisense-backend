// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

const app = express();

/* --- startup diagnostics --- */
console.log('[BOOT] CWD                =', process.cwd());
try {
  console.log('[BOOT] resolve routes/auth =', require.resolve('./routes/auth'));
} catch (e) {
  console.log('[BOOT] resolve routes/auth FAILED:', e.message);
}
try {
  console.log('[BOOT] resolve routes/admin =', require.resolve('./routes/admin'));
} catch (e) {
  console.log('[BOOT] resolve routes/admin FAILED:', e.message);
}

/* --- basic middleware --- */
app.use(cors());
app.use(express.json());

/* --- very loud request logger (TEMP) --- */
app.use((req, _res, next) => {
  console.log('[REQ]', req.method, req.url);
  next();
});

/* --- simple pings so we can verify the base path --- */
app.get('/ping', (_req, res) => res.json({ ok: true, where: '/' }));
app.get('/api/ping', (_req, res) => res.json({ ok: true, where: '/api' }));

/* --- routes --- */
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const priceRoutes = require('./routes/prices');

app.use('/api', priceRoutes);
app.use('/api/auth', authRoutes);   // e.g. GET /api/auth/ping
app.use('/api/admin', adminRoutes);

/* --- health --- */
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    version: process.env.RENDER_GIT_COMMIT || 'dev',
    time: new Date().toISOString(),
  });
});

/* --- 404 logger (TEMP) --- */
app.use((req, res) => {
  console.log('[404]', req.method, req.originalUrl);
  res.status(404).send('Not Found');
});

/* --- error handler --- */
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Internal Server Error' });
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
