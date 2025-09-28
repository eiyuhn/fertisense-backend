// fertisense-backend/fertisense-backend/routes/admin.js
const router = require('express').Router();
const { auth, requireRole } = require('../utils/auth');
const ctrl = require('../controllers/adminController');

// everything here requires admin
router.use(auth, requireRole('admin'));

/* -------- FARMERS -------- */
router.post('/farmers', ctrl.createFarmer);
router.get('/farmers', ctrl.listFarmers);
router.get('/farmers/:id', ctrl.getFarmer);
router.patch('/farmers/:id', ctrl.updateFarmer);
router.delete('/farmers/:id', ctrl.deleteFarmer);

/* -------- USERS -------- */
router.get('/users', ctrl.listUsers);
router.get('/users/:id', ctrl.getUser);
router.patch('/users/:id', ctrl.updateUser);
router.patch('/users/:id/role', ctrl.setRole);
router.post('/users/:id/reset-password', ctrl.resetPassword);
router.delete('/users/:id', ctrl.deleteUser);

/* -------- READINGS & STATS -------- */
router.get('/readings', ctrl.listReadings);
router.get('/stats', ctrl.getStats);

module.exports = router;
