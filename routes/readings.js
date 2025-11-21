// routes/readings.js
const router = require('express').Router();
const ctrl = require('../controllers/readingController');
const { auth } = require('../utils/auth');

// Create / list all readings (user-wide)
router.post('/', auth, ctrl.createReading);
router.get('/', auth, ctrl.listReadings);

// 🔹 Farmer-specific routes MUST come before "/:id"
router.get('/farmers/:farmerId', auth, ctrl.listReadingsByFarmer);
router.post('/farmers/:farmerId/batch', auth, ctrl.addReadingBatch);

// Single reading by id
router.get('/:id', auth, ctrl.getReading);
router.delete('/:id', auth, ctrl.deleteReading);

module.exports = router;
