// routes/prices.js
const express = require('express');
const router = express.Router();
const { auth, requireRole } = require('../utils/auth');
const priceCtrl = require('../controllers/priceController');

// Public: GET /api/prices
router.get('/', priceCtrl.getPublicPrices);

// Admin: GET /api/prices/admin, PUT /api/prices/admin
router.get('/admin', auth, requireRole('admin'), priceCtrl.getAdminPrices);
router.put('/admin', auth, requireRole('admin'), priceCtrl.updateAdminPrices);

module.exports = router;
