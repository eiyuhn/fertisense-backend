// routes/readings.js
const router = require('express').Router();
const ctrl = require('../controllers/readingController');
const { auth } = require('../utils/auth');

router.post('/', auth, ctrl.createReading);
router.get('/', auth, ctrl.listReadings);
router.get('/:id', auth, ctrl.getReading);
router.delete('/:id', auth, ctrl.deleteReading);

// NEW: batch upload of 10 readings tied to a farmer
router.post('/farmers/:farmerId/batch', auth, ctrl.addReadingBatch);

module.exports = router;
