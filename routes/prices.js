// routes/prices.js
const express = require('express');
const router = express.Router();
const { auth, requireRole } = require('../utils/auth');
const priceCtrl = require('../controllers/priceController');

// ✅ Public
router.get('/', priceCtrl.getPublicPrices);
// legacy support (just in case some code uses /api/prices/public)
router.get('/public', priceCtrl.getPublicPrices);

// ✅ Authenticated read (any logged-in user)
router.get('/admin', auth, priceCtrl.getAdminPrices);

// ✅ Admin-only write
router.put('/admin', auth, requireRole('admin'), priceCtrl.updateAdminPrices);

module.exports = router;
