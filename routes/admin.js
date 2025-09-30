const router = require('express').Router();
const { auth, requireRole } = require('../utils/auth');
const ctrl = require('../controllers/adminController');

// TEMP protected echo (requires token)
router.post('/__echo', (req, res) => {
  res.json({ headers: req.headers, body: req.body });
});

// Admin-only routes
router.use(auth, requireRole('admin'));

// Farmers
router.post('/farmers', ctrl.createFarmer);
router.get('/farmers', ctrl.listFarmers);
router.get('/farmers/:id', ctrl.getFarmer);
router.patch('/farmers/:id', ctrl.updateFarmer);
router.delete('/farmers/:id', ctrl.deleteFarmer);

// Users (stubs)
router.get('/users', ctrl.listUsers);
router.get('/users/:id', ctrl.getUser);
router.patch('/users/:id', ctrl.updateUser);
router.patch('/users/:id/role', ctrl.setRole);
router.post('/users/:id/reset-password', ctrl.resetPassword);
router.delete('/users/:id', ctrl.deleteUser);

// Readings & stats (stubs)
router.get('/readings', ctrl.listReadings);
router.get('/stats', ctrl.getStats);

module.exports = router;
