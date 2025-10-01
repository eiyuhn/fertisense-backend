// routes/farmers.js
const router = require('express').Router();
const { auth } = require('../utils/auth');  // ⬅ use this
const ctrl = require('../controllers/farmerController');

// Protect all farmer endpoints
router.use(auth);

router.get('/', ctrl.listFarmers);
router.post('/', ctrl.createFarmer);
router.get('/:id', ctrl.getFarmer);
router.put('/:id', ctrl.updateFarmer);
router.delete('/:id', ctrl.deleteFarmer);

// Add a sensor reading
router.post('/:id/readings', ctrl.addReading);

module.exports = router;
