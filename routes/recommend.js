// routes/recommend.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/recommendController');

// public
router.post('/', ctrl.recommend);

module.exports = router;
