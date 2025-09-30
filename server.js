require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// Fail fast for critical envs (keep your version)
['MONGODB_URI', 'JWT_SECRET'].forEach((k) => {
  if (!process.env[k]) {
    console.error(`Missing env: ${k}`);
    process.exit(1);
  }
});

const app = express();

/* ===== Middlewares (order matters) ===== */
app.use(cors());
app.use(express.json()); // must be before routes

/* ===== Public diagnostics (no auth) ===== */
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    version: process.env.RENDER_GIT_COMMIT || 'dev',
    time: new Date().toISOString(),
  });
});

// Unprotected echo to verify JSON parsing works in prod
app.post('/debug/echo', (req, res) => {
  res.json({ headers: req.headers, body: req.body });
});

/* ===== Mount your routers ===== */
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);

/* ===== Start ===== */
const PORT = process.env.PORT || 3000;
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Mongo connected');
    app.listen(PORT, () => console.log(`Listening on :${PORT}`));
  })
  .catch((e) => {
    console.error('Mongo connect error:', e);
    process.exit(1);
  });
