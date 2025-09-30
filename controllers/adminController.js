// fertisense-backend/controllers/adminController.js
const Farmer = require('../models/Farmer');

// Keep the response shape consistent
function sanitize(f) {
  return {
    id: f._id,
    ownerId: f.ownerId,
    name: f.name,
    address: f.address,
    farmLocation: f.farmLocation,
    mobile: f.mobile,
    cropType: f.cropType,
    cropStyle: f.cropStyle,
    landAreaHa: f.landAreaHa,
    code: f.code,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

/* ===================== FARMERS (ADMIN) ===================== */
// POST /api/admin/farmers
exports.createFarmer = async (req, res) => {
  try {
    // Debug logs (helpful while testing from the mobile app)
    console.log('[CREATE_FARMER] content-type =', req.headers['content-type']);
    console.log('[CREATE_FARMER] body =', req.body);

    const {
      name,
      address = '',
      farmLocation = '',
      mobile = '',
      cropType = '',
      cropStyle = '',
      landAreaHa = 0,
      code = '',
    } = req.body || {};

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const f = await Farmer.create({
      ownerId: req.user.id, // admin creating
      name: name.trim(),
      address,
      farmLocation,
      mobile,
      cropType,
      cropStyle,
      landAreaHa,
      code,
    });

    return res.status(201).json(sanitize(f));
  } catch (err) {
    console.error('Admin createFarmer error:', err);
    return res.status(500).json({ error: 'Failed to create farmer: ' + err.message });
  }
};

// GET /api/admin/farmers
exports.listFarmers = async (req, res) => {
  const items = await Farmer.find({ ownerId: req.user.id }).sort({ createdAt: -1 });
  return res.json(items.map(sanitize));
};

// GET /api/admin/farmers/:id
exports.getFarmer = async (req, res) => {
  const f = await Farmer.findOne({ _id: req.params.id, ownerId: req.user.id });
  if (!f) return res.status(404).json({ error: 'Not found' });
  return res.json(sanitize(f));
};

// PATCH /api/admin/farmers/:id
exports.updateFarmer = async (req, res) => {
  const patch = {};
  ['name','address','farmLocation','mobile','cropType','cropStyle','landAreaHa','code'].forEach(k => {
    if (Object.prototype.hasOwnProperty.call(req.body, k)) {
      patch[k] = req.body[k];
    }
  });

  const f = await Farmer.findOneAndUpdate(
    { _id: req.params.id, ownerId: req.user.id },
    { $set: patch },
    { new: true }
  );

  if (!f) return res.status(404).json({ error: 'Not found' });
  return res.json(sanitize(f));
};

// DELETE /api/admin/farmers/:id
exports.deleteFarmer = async (req, res) => {
  const f = await Farmer.findOneAndDelete({ _id: req.params.id, ownerId: req.user.id });
  if (!f) return res.status(404).json({ error: 'Not found' });
  return res.json({ ok: true });
};

/* ======== (Stubs for the other admin routes you declared) ======== */
exports.listUsers = async (_req, res) => res.json([]);
exports.getUser = async (_req, res) => res.status(404).json({ error: 'Not implemented' });
exports.updateUser = async (_req, res) => res.status(404).json({ error: 'Not implemented' });
exports.setRole = async (_req, res) => res.status(404).json({ error: 'Not implemented' });
exports.resetPassword = async (_req, res) => res.status(404).json({ error: 'Not implemented' });
exports.deleteUser = async (_req, res) => res.status(404).json({ error: 'Not implemented' });

exports.listReadings = async (_req, res) => res.json([]);
exports.getStats = async (_req, res) => res.json({ farmers: 0, readings: 0 });
