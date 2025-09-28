// fertisense-backend/fertisense-backend/controllers/adminController.js
const bcrypt = require('bcrypt');
const User = require('../models/User');
const Reading = require('../models/Reading');

function sanitize(u) {
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

/** USERS **/

// GET /api/admin/users?q=...
exports.listUsers = async (req, res) => {
  const q = (req.query.q || '').trim();
  const filter = q
    ? { $or: [{ email: new RegExp(q, 'i') }, { name: new RegExp(q, 'i') }] }
    : {};
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(500);
  res.json(users.map(sanitize));
};

// GET /api/admin/users/:id
exports.getUser = async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json(sanitize(u));
};

// PATCH /api/admin/users/:id/role { role: "admin" | "stakeholder" }
exports.setRole = async (req, res) => {
  const { role } = req.body || {};
  if (!['admin', 'stakeholder'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const u = await User.findByIdAndUpdate(
    req.params.id,
    { $set: { role } },
    { new: true }
  );
  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json(sanitize(u));
};

// POST /api/admin/users/:id/reset-password { password: "..." }
exports.resetPassword = async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const hash = await bcrypt.hash(password, 10);
  const u = await User.findByIdAndUpdate(
    req.params.id,
    { $set: { passwordHash: hash } },
    { new: true }
  );
  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
};

// DELETE /api/admin/users/:id
exports.deleteUser = async (req, res) => {
  const me = req.user.id;
  if (req.params.id === me) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }
  const u = await User.findByIdAndDelete(req.params.id);
  if (!u) return res.status(404).json({ error: 'Not found' });

  await Reading.deleteMany({ userId: u._id });
  res.json({ ok: true });
};

/** READINGS **/

// GET /api/admin/readings?userId=...
exports.listReadings = async (req, res) => {
  const filter = {};
  if (req.query.userId) filter.userId = req.query.userId;
  const items = await Reading.find(filter).sort({ createdAt: -1 }).limit(1000);
  res.json(items);
};

/** STATS **/

// GET /api/admin/stats
exports.getStats = async (req, res) => {
  const [users, readings] = await Promise.all([
    User.countDocuments({}),
    Reading.countDocuments({}),
  ]);
  const latest = await Reading.find({}).sort({ createdAt: -1 }).limit(5);
  res.json({ users, readings, latest });
};
