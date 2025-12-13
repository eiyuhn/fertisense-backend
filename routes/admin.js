// routes/admin.js
const router = require('express').Router();
const { auth, requireRole } = require('../utils/auth');
const ctrl = require('../controllers/adminController');

// TEMP protected echo (requires token)
router.post('/__echo', (req, res) => {
  res.json({ headers: req.headers, body: req.body });
});

// Admin-only routes
router.use(auth, requireRole('admin'));

// Farmers
router.post('/farmers', ctrl.createFarmer);
router.get('/farmers', ctrl.listFarmers);
router.get('/farmers/:id', ctrl.getFarmer);
router.patch('/farmers/:id', ctrl.updateFarmer);
router.delete('/farmers/:id', ctrl.deleteFarmer);


router.get('/stakeholders', ctrl.listStakeholders);

// Readings & stats
router.get('/readings', ctrl.listReadings);
router.get('/stats', ctrl.getStats);

module.exports = router;
