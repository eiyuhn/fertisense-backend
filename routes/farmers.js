// routes/farmers.js
const router = require('express').Router();
const { auth } = require('../utils/auth');
const ctrl = require('../controllers/farmerController');

router.use(auth);

router.get('/', ctrl.listFarmers);
router.post('/', ctrl.createFarmer);
router.get('/:id', ctrl.getFarmer);
router.put('/:id', ctrl.updateFarmer);
router.delete('/:id', ctrl.deleteFarmer);

// readings
router.post('/:id/readings', ctrl.addReading);
// ⬇️ add this
router.get('/:id/readings', ctrl.listReadingsByFarmer);

module.exports = router;
