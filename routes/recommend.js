const express = require('express');
const router = express.Router();
const { auth } = require('../utils/auth'); // optional
const ctrl = require('../controllers/recommendController');

// You can remove `auth` if you want it to work without login
router.post('/', auth, ctrl.recommend);

module.exports = router;
