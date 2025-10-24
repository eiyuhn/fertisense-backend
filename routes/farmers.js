// routes/farmers.js
const router = require('express').Router();
const { auth } = require('../utils/auth');
const ctrl = require('../controllers/farmerController');

// Protect all farmer endpoints
router.use(auth);

// Farmers
router.get('/', ctrl.listFarmers);
router.post('/', ctrl.createFarmer);
router.get('/:id', ctrl.getFarmer);
router.put('/:id', ctrl.updateFarmer);
router.delete('/:id', ctrl.deleteFarmer);

// Readings under a farmer
router.get('/:id/readings', ctrl.listReadingsByFarmer);
router.get('/:id/readings/latest', ctrl.latestReading);   // <- NEW
router.post('/:id/readings', ctrl.addReading);
router.patch('/:id/readings/:readingId', ctrl.updateReading);
router.delete('/:id/readings/:readingId', ctrl.deleteReading);

module.exports = router;
