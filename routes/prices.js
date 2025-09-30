const express = require('express');
const router = express.Router();
const { auth, requireRole } = require('../utils/auth');
const priceCtrl = require('../controllers/priceController');

// Public
router.get('/prices', priceCtrl.getPublicPrices);

// Admin
router.get('/admin/prices', auth, requireRole('admin'), priceCtrl.getAdminPrices);
router.put('/admin/prices', auth, requireRole('admin'), priceCtrl.updateAdminPrices);

module.exports = router;
