// fertisense-backend/fertisense-backend/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const readingRoutes = require('./routes/readings');
const adminRoutes = require('./routes/admin'); // <-- make sure this file exists

// fail fast if env is missing (optional but helpful)
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
app.use('/api/auth', authRoutes);
app.use('/api/readings', readingRoutes);
app.use('/api/admin', adminRoutes); // <-- mounts /api/admin/*

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Fertisense API is running' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`🚀 API listening on :${port}`));
