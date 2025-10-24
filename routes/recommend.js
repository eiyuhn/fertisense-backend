// routes/recommend.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/recommendController');

// If you want it public for guests, do NOT require auth here:
router.post('/', ctrl.recommend);

module.exports = router;
