// controllers/adminController.js
const Farmer = require('../models/Farmer');
const User = require('../models/User'); // ✅ added

/* ---------------- Utils ---------------- */
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

const CROP_TYPES  = ['', 'hybrid', 'inbred', 'pareho'];
const CROP_STYLES = ['', 'irrigated', 'rainfed', 'pareho'];

function asNumber(x, def = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}

function cleanCode(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '');
}

/* ================ FARMERS (ADMIN) ================ */
exports.createFarmer = async (req, res) => {
  try {
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

    const nameTrim = (name || '').trim();
    if (!nameTrim) return res.status(400).json({ error: 'Name is required' });

    const ct = CROP_TYPES.includes(cropType) ? cropType : '';
    const cs = CROP_STYLES.includes(cropStyle) ? cropStyle : '';
    const area = asNumber(landAreaHa, 0);

    const generated = `${nameTrim.split(/\s+/)[0].toLowerCase()}-${Date.now()
      .toString()
      .slice(-4)}`;
    const safeCode = cleanCode(code || generated);

    if (safeCode) {
      const exists = await Farmer.findOne({
        ownerId: req.user.id,
        code: safeCode,
      }).lean();
      if (exists)
        return res.status(409).json({ error: 'Farmer code already exists' });
    }

    const doc = await Farmer.create({
      ownerId: req.user.id,
      name: nameTrim,
      address: (address || '').trim(),
      farmLocation: (farmLocation || '').trim(),
      mobile: (mobile || '').trim(),
      cropType: ct,
      cropStyle: cs,
      landAreaHa: area,
      code: safeCode,
    });

    return res.status(201).json(sanitize(doc));
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'Farmer code already exists' });
    }
    console.error('Admin createFarmer error:', err);
    return res
      .status(500)
      .json({ error: 'Failed to create farmer: ' + err.message });
  }
};

exports.listFarmers = async (req, res) => {
  const items = await Farmer.find({ ownerId: req.user.id }).sort({
    createdAt: -1,
  });
  return res.json(items.map(sanitize));
};

exports.getFarmer = async (req, res) => {
  const f = await Farmer.findOne({
    _id: req.params.id,
    ownerId: req.user.id,
  });
  if (!f) return res.status(404).json({ error: 'Not found' });
  return res.json(sanitize(f));
};

exports.updateFarmer = async (req, res) => {
  const patch = {};
  const fields = [
    'name',
    'address',
    'farmLocation',
    'mobile',
    'cropType',
    'cropStyle',
    'landAreaHa',
    'code',
  ];

  for (const k of fields) {
    if (!Object.prototype.hasOwnProperty.call(req.body, k)) continue;

    let v = req.body[k];

    if (
      k === 'name' ||
      k === 'address' ||
      k === 'farmLocation' ||
      k === 'mobile'
    ) {
      v = (v || '').toString().trim();
    }

    if (k === 'cropType') v = CROP_TYPES.includes(v) ? v : '';
    if (k === 'cropStyle') v = CROP_STYLES.includes(v) ? v : '';
    if (k === 'landAreaHa') v = asNumber(v, 0);
    if (k === 'code') v = cleanCode(v);

    patch[k] = v;
  }

  if (patch.code) {
    const dup = await Farmer.findOne({
      ownerId: req.user.id,
      code: patch.code,
      _id: { $ne: req.params.id },
    }).lean();
    if (dup) return res.status(409).json({ error: 'Farmer code already exists' });
  }

  const f = await Farmer.findOneAndUpdate(
    { _id: req.params.id, ownerId: req.user.id },
    { $set: patch },
    { new: true }
  );

  if (!f) return res.status(404).json({ error: 'Not found' });
  return res.json(sanitize(f));
};

exports.deleteFarmer = async (req, res) => {
  const f = await Farmer.findOneAndDelete({
    _id: req.params.id,
    ownerId: req.user.id,
  });
  if (!f) return res.status(404).json({ error: 'Not found' });
  return res.json({ ok: true });
};

/* ================ USERS (ADMIN) ================ */

// GET /api/admin/users[?role=stakeholder]
exports.listUsers = async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) {
      filter.role = req.query.role; // e.g. stakeholder, admin, guest
    }

    const users = await User.find(filter)
      .select('-passwordHash') // hide password hash
      .sort({ createdAt: -1 })
      .lean();

    return res.json(users);
  } catch (err) {
    console.error('[ADMIN listUsers]', err);
    return res.status(500).json({ error: 'Failed to list users' });
  }
};

// placeholders – you can implement later if needed
exports.getUser = async (_req, res) =>
  res.status(404).json({ error: 'Not implemented' });
exports.updateUser = async (_req, res) =>
  res.status(404).json({ error: 'Not implemented' });
exports.setRole = async (_req, res) =>
  res.status(404).json({ error: 'Not implemented' });
exports.resetPassword = async (_req, res) =>
  res.status(404).json({ error: 'Not implemented' });
exports.deleteUser = async (_req, res) =>
  res.status(404).json({ error: 'Not implemented' });

/* ================ READINGS & STATS (ADMIN) ================ */

exports.listReadings = async (_req, res) => res.json([]);
exports.getStats = async (_req, res) => res.json({ farmers: 0, readings: 0 });
