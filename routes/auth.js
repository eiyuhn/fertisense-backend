// fertisense-backend/fertisense-backend/routes/auth.js
const router = require('express').Router();
const { auth } = require('../utils/auth');
const ctrl = require('../controllers/authController');

// PUBLIC
router.post('/register', ctrl.register);
router.post('/login', ctrl.login);

// AUTHENTICATED
router.get('/me', auth, ctrl.me);

module.exports = router;
