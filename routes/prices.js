// routes/prices.js
const express = require('express');
const router = express.Router();
const { auth, requireRole } = require('../utils/auth');
const priceCtrl = require('../controllers/priceController');

// Public: GET /api/prices
router.get('/', priceCtrl.getPublicPrices);

/**
 * ✅ AUTHENTICATED READ:
 * Allow ANY logged-in user (admin / stakeholder / guest) to read the canonical admin price doc
 * so Recommendation screen can use the exact same data as Admin page.
 *
 * (We keep PUT as admin-only.)
 */
router.get('/admin', auth, priceCtrl.getAdminPrices);

// Admin-only write: PUT /api/prices/admin
router.put('/admin', auth, requireRole('admin'), priceCtrl.updateAdminPrices);

module.exports = router;
