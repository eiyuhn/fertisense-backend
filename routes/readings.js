const router = require('express').Router();
const ctrl = require('../controllers/readingController');
const { auth } = require('../utils/auth');

router.post('/', auth, ctrl.createReading);
router.get('/', auth, ctrl.listReadings);
router.get('/:id', auth, ctrl.getReading);
router.delete('/:id', auth, ctrl.deleteReading);

module.exports = router;
