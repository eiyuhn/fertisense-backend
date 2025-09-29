const router = require('express').Router();
const ctrl = require('../controllers/farmerController');
const { auth } = require('../utils/auth');

// all farmer routes require a logged-in user
router.post('/', auth, ctrl.create);
router.get('/', auth, ctrl.list);
router.get('/:id', auth, ctrl.get);
router.put('/:id', auth, ctrl.update);
router.delete('/:id', auth, ctrl.remove);

module.exports = router;
