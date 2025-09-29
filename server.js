// fertisense-backend/fertisense-backend/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const readingRoutes = require('./routes/readings');
const adminRoutes = require('./routes/admin');

// (optional) fail fast if env missing
['MONGODB_URI', 'JWT_SECRET'].forEach(k => {
  if (!process.env[k]) {
    console.error(`Missing env: ${k}`);
    process.exit(1);
  }
});

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => {
    console.error('❌ DB error:', err.message);
    process.exit(1);
  });

app.get('/', (_, res) => res.send('Fertisense API up'));
app.use('/api/auth', authRoutes);      // public login/register, protected /me
app.use('/api/readings', readingRoutes);
app.use('/api/admin', adminRoutes);    // protected by auth+admin inside routes/admin.js

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Fertisense API is running' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`🚀 API listening on :${port}`));

// ...existing requires

// Basic request log (method + path)
app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.path}`);
  next();
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected:', (process.env.MONGODB_URI || '').split('@').pop()))
  .catch(err => {
    console.error('❌ DB error on connect:', err);
    process.exit(1);
  });

// Optional: check mongoose connection state endpoint
app.get('/debug/dbstate', (_req, res) => {
  // 0=disconnected 1=connected 2=connecting 3=disconnecting
  res.json({ state: mongoose.connection.readyState });
});
