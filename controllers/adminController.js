// fertisense-backend/fertisense-backend/controllers/adminController.js
const bcrypt = require('bcrypt');
const User = require('../models/User');
const Reading = require('../models/Reading');
const Farmer = require('../models/Farmer');

/* ---------------- helpers ---------------- */
function sanitizeUser(u) {
  return {
    id: u._id,
    name: u.name,
    address: u.address,
    farmLocation: u.farmLocation,
    mobile: u.mobile,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt,
  };
}

function sanitizeFarmer(f) {
  return {
    id: f._id,
    name: f.name,
    farmLocation: f.farmLocation,
    farmSizeHa: f.farmSizeHa,
    riceType: f.riceType,
    plantingStyle: f.plantingStyle,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

function normEnum(val, allowed) {
  if (typeof val !== 'string') return null;
  const v = val.toLowerCase().trim();
  const mapped = v === 'both' ? 'pareho' : v; // accept "both"
  return allowed.includes(mapped) ? mapped : null;
}

/* ---------------- FARMERS (CRUD) ---------------- */
// POST /api/admin/farmers
// body: { name, farmLocation?, farmSizeHa?, riceType?, plantingStyle? }
exports.createFarmer = async (req, res) => {
  const { name, farmLocation, farmSizeHa, riceType, plantingStyle } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required' });

  const rice = normEnum(riceType ?? 'pareho', ['hybrid', 'inbred', 'pareho']);
  const style = normEnum(plantingStyle ?? 'pareho', ['irrigated', 'rainfed', 'pareho']);
  if (riceType && !rice) return res.status(400).json({ error: 'Invalid riceType' });
  if (plantingStyle && !style) return res.status(400).json({ error: 'Invalid plantingStyle' });

  let size = undefined;
  if (farmSizeHa !== undefined && farmSizeHa !== null && farmSizeHa !== '') {
    const n = Number(farmSizeHa);
    if (Number.isNaN(n) || n < 0) return res.status(400).json({ error: 'farmSizeHa must be a non-negative number' });
    size = n;
  }

  const doc = await Farmer.create({
    name: String(name).trim(),
    farmLocation: (farmLocation ?? '').toString().trim(),
    farmSizeHa: size,
    riceType: rice ?? 'pareho',
    plantingStyle: style ?? 'pareho',
    createdBy: req.user.id,
  });

  return res.status(201).json(sanitizeFarmer(doc));
};

// GET /api/admin/farmers?q=
exports.listFarmers = async (req, res) => {
  const q = (req.query.q || '').trim();
  const filter = q ? { $text: { $search: q } } : {};
  const items = await Farmer.find(filter).sort({ createdAt: -1 }).limit(1000);
  res.json(items.map(sanitizeFarmer));
};

// GET /api/admin/farmers/:id
exports.getFarmer = async (req, res) => {
  const f = await Farmer.findById(req.params.id);
  if (!f) return res.status(404).json({ error: 'Not found' });
  res.json(sanitizeFarmer(f));
};

// PATCH /api/admin/farmers/:id
exports.updateFarmer = async (req, res) => {
  const patch = {};
  if (typeof req.body?.name === 'string') patch.name = req.body.name.trim();
  if (typeof req.body?.farmLocation === 'string') patch.farmLocation = req.body.farmLocation.trim();

  if (req.body?.farmSizeHa !== undefined) {
    const n = Number(req.body.farmSizeHa);
    if (Number.isNaN(n) || n < 0) return res.status(400).json({ error: 'farmSizeHa must be a non-negative number' });
    patch.farmSizeHa = n;
  }

  if (req.body?.riceType !== undefined) {
    const rice = normEnum(req.body.riceType, ['hybrid', 'inbred', 'pareho']);
    if (!rice) return res.status(400).json({ error: 'Invalid riceType' });
    patch.riceType = rice;
  }

  if (req.body?.plantingStyle !== undefined) {
    const style = normEnum(req.body.plantingStyle, ['irrigated', 'rainfed', 'pareho']);
    if (!style) return res.status(400).json({ error: 'Invalid plantingStyle' });
    patch.plantingStyle = style;
  }

  const f = await Farmer.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true });
  if (!f) return res.status(404).json({ error: 'Not found' });
  res.json(sanitizeFarmer(f));
};

// DELETE /api/admin/farmers/:id
exports.deleteFarmer = async (req, res) => {
  const f = await Farmer.findByIdAndDelete(req.params.id);
  if (!f) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
};

/* ---------------- USERS (existing) ---------------- */
exports.listUsers = async (req, res) => {
  const q = (req.query.q || '').trim();
  const filter = q ? { $or: [{ email: new RegExp(q, 'i') }, { name: new RegExp(q, 'i') }] } : {};
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(500);
  res.json(users.map(sanitizeUser));
};

exports.getUser = async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json(sanitizeUser(u));
};

exports.updateUser = async (req, res) => {
  const patch = {};
  if (typeof req.body?.name === 'string') patch.name = req.body.name;
  if (typeof req.body?.address === 'string') patch.address = req.body.address;
  if (typeof req.body?.farmLocation === 'string') patch.farmLocation = req.body.farmLocation;
  if (typeof req.body?.mobile === 'string') patch.mobile = req.body.mobile;
  if (typeof req.body?.email === 'string') {
    const normalizedEmail = String(req.body.email).toLowerCase().trim();
    const dup = await User.findOne({ email: normalizedEmail, _id: { $ne: req.params.id } });
    if (dup) return res.status(409).json({ error: 'Email already in use' });
    patch.email = normalizedEmail;
  }
  const u = await User.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true });
  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json(sanitizeUser(u));
};

exports.setRole = async (req, res) => {
  const { role } = req.body || {};
  if (!['admin', 'stakeholder'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const u = await User.findByIdAndUpdate(req.params.id, { $set: { role } }, { new: true });
  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json(sanitizeUser(u));
};

exports.resetPassword = async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const hash = await bcrypt.hash(password, 10);
  const u = await User.findByIdAndUpdate(req.params.id, { $set: { passwordHash: hash } }, { new: true });
  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
};

exports.deleteUser = async (req, res) => {
  const me = req.user.id;
  if (req.params.id === me) return res.status(400).json({ error: 'Cannot delete yourself' });
  const u = await User.findByIdAndDelete(req.params.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  await Reading.deleteMany({ userId: u._id });
  res.json({ ok: true });
};

/* ---------------- READINGS/STATS (existing) ---------------- */
exports.listReadings = async (req, res) => {
  const filter = {};
  if (req.query.userId) filter.userId = req.query.userId;
  const items = await Reading.find(filter).sort({ createdAt: -1 }).limit(1000);
  res.json(items);
};

exports.getStats = async (req, res) => {
  const [users, readings, farmers] = await Promise.all([
    User.countDocuments({}),
    Reading.countDocuments({}),
    Farmer.countDocuments({}),
  ]);
  const latest = await Reading.find({}).sort({ createdAt: -1 }).limit(5);
  res.json({ users, readings, farmers, latest });
};
