// fertisense-backend/routes/prices.js
const express = require('express');
const router = express.Router();
const { auth, requireRole } = require('../utils/auth'); // ✅ fixed path
const priceCtrl = require('../controllers/priceController');

// Public for stakeholders/app to read current prices
router.get('/prices', priceCtrl.getPublicPrices);

// Admin: read and update
router.get('/admin/prices', auth, requireRole('admin'), priceCtrl.getAdminPrices);
router.put('/admin/prices', auth, requireRole('admin'), priceCtrl.updateAdminPrices);

module.exports = router;
