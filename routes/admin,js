// fertisense-backend/fertisense-backend/routes/admin.js
const router = require('express').Router();
const { auth, requireRole } = require('../utils/auth');
const ctrl = require('../controllers/adminController');

// everything here requires admin
router.use(auth, requireRole('admin'));

// Users
router.get('/users', ctrl.listUsers);
router.get('/users/:id', ctrl.getUser);
router.patch('/users/:id/role', ctrl.setRole);
router.post('/users/:id/reset-password', ctrl.resetPassword);
router.delete('/users/:id', ctrl.deleteUser);

// Readings overview
router.get('/readings', ctrl.listReadings);

// Stats
router.get('/stats', ctrl.getStats);

module.exports = router;
