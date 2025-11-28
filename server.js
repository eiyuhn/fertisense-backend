require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path'); // ✅ added

const pricesRoutes = require('./routes/prices');
const recommendRoutes = require('./routes/recommend');
const readingsRoutes = require('./routes/readings');

const app = express();

/* --- middleware --- */
// ✅ FIXED: Explicitly configure CORS to handle preflight (OPTIONS)
// requests and allow file uploads from all origins.
app.use(cors({
  origin: '*', // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], // Allow all methods
  allowedHeaders: ['Content-Type', 'Authorization'] // Allow necessary headers
}));

app.use(express.json({ limit: '1mb' })); // ensure JSON body is parsed

// ✅ serve uploaded profile photos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
app.use('/api/users', require('./routes/users'));     // ✅ new user route
app.use('/api/admin', require('./routes/admin'));

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