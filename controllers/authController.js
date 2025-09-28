// fertisense-backend/fertisense-backend/controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

function sanitize(u) {
  return {
    id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    address: u.address,
    farmLocation: u.farmLocation,
    mobile: u.mobile,
    createdAt: u.createdAt,
  };
}

// POST /api/auth/register
// body: { name, email, password, role?, address?, farmLocation?, mobile? }
exports.register = async (req, res) => {
  const { name, email, password, role, address, farmLocation, mobile } = req.body || {};
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }
  const normalizedEmail = String(email).toLowerCase().trim();

  const exists = await User.findOne({ email: normalizedEmail });
  if (exists) return res.status(409).json({ error: 'Email already exists' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email: normalizedEmail,
    passwordHash,
    role: role === 'admin' ? 'admin' : 'stakeholder',
    address: address || '',
    farmLocation: farmLocation || '',
    mobile: mobile || '',
  });

  // Your frontend expects { ok: true } on register
  return res.status(201).json({ ok: true, user: sanitize(user) });
};

// POST /api/auth/login
// body: { email, password }
exports.login = async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const normalizedEmail = String(email).toLowerCase().trim();

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.passwordHash || '');
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: user._id.toString(), email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token, user: sanitize(user) });
};

// GET /api/auth/me  (auth middleware sets req.user)
exports.me = async (req, res) => {
  const u = await User.findById(req.user.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json(sanitize(u));
};
