// routes/auth.js
const router = require('express').Router();
const { auth } = require('../utils/auth');
const ctrl = require('../controllers/authController');

/* sanity ping (prove this router is mounted) */
router.get('/ping', (_req, res) => res.json({ ok: true, route: '/api/auth' }));

/* public */
router.post('/register', ctrl.register);
router.post('/login', ctrl.login);

/* protected */
router.get('/me', auth, ctrl.me);

module.exports = router;
