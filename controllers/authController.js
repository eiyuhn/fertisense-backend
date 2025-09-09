const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

function sanitize(u) {
  return {
    id: u._id,
    name: u.name,
    address: u.address,
    farmLocation: u.farmLocation,
    mobile: u.mobile,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt
  };
}

exports.register = async (req, res) => {
  try {
    let { name, address, farmLocation, mobile, email, password, role } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    email = String(email).toLowerCase().trim();

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, address, farmLocation, mobile, email, passwordHash, role });
    return res.json({ ok: true, user: sanitize(user) });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const u = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!u) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (!u.passwordHash) {
      return res.status(500).json({ error: 'User exists but has no passwordHash' });
    }

    const ok = await bcrypt.compare(password, u.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Wrong password' });
    }

    const token = jwt.sign(
      { id: u._id, role: u.role, email: u.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: sanitize(u) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed: ' + err.message });
  }
};



exports.me = async (req, res) => {
  const u = await User.findById(req.user.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json(sanitize(u));
};

exports.updateMe = async (req, res) => {
  const { name, address, farmLocation, mobile } = req.body || {};
  const u = await User.findByIdAndUpdate(
    req.user.id,
    { $set: { name, address, farmLocation, mobile } },
    { new: true }
  );
  res.json(sanitize(u));
};
