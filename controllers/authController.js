// controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');

function sanitize(u) {
  if (!u) return null;
  return {
    _id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    address: u.address || '',
    farmLocation: u.farmLocation || '',
    mobile: u.mobile || '',
    // ✅ unified field used by the app
    photoUrl: u.photoUrl || '',
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

function signToken(userId, role) {
  const secret = process.env.JWT_SECRET || 'dev_secret';
  return jwt.sign({ id: userId, role }, secret, { expiresIn: '30d' });
}

// POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { name, email, password, role, address, farmLocation, mobile } = req.body || {};
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }
    const normalizedEmail = String(email).toLowerCase().trim();

    const exists = await User.findOne({ email: normalizedEmail });
    if (exists) return res.status(409).json({ error: 'Email already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: role === 'admin' ? 'admin' : (role === 'guest' ? 'guest' : 'stakeholder'),
      address: address || '',
      farmLocation: farmLocation || '',
      mobile: mobile || '',
    });

    const token = signToken(user._id.toString(), user.role);
    return res.status(201).json({ token, user: sanitize(user) });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Failed to register: ' + err.message });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email?.trim() || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const normalizedEmail = String(email).toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash || '');
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user._id.toString(), user.role);
    return res.json({ token, user: sanitize(user) });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Failed to login: ' + err.message });
  }
};

// GET /api/auth/me
exports.me = async (req, res) => {
  try {
    const u = await User.findById(req.user.id);
    if (!u) return res.status(404).json({ error: 'Not found' });
    return res.json(sanitize(u));
  } catch (err) {
    console.error('Me error:', err);
    return res.status(500).json({ error: 'Failed to fetch profile: ' + err.message });
  }
};

// PATCH /api/auth/me  (also used by /api/users/me)
exports.updateMe = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // allow only these fields
    const { name, address, farmLocation, mobile } = req.body || {};
    const update = {};
    if (typeof name === 'string') update.name = name.trim();
    if (typeof address === 'string') update.address = address.trim();
    if (typeof farmLocation === 'string') update.farmLocation = farmLocation.trim();
    if (typeof mobile === 'string') update.mobile = mobile.trim();

    const u = await User.findByIdAndUpdate(userId, update, { new: true });
    if (!u) return res.status(404).json({ error: 'Not found' });

    return res.json(sanitize(u));
  } catch (err) {
    console.error('updateMe error:', err);
    return res.status(500).json({ error: 'Failed to update profile: ' + err.message });
  }
};

// POST /api/auth/me/photo  (also used by /api/users/me/photo)
exports.uploadMyPhoto = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

    // Build a public URL for the stored file
    const publicUrl = `${req.protocol}://${req.get('host')}/uploads/avatars/${req.file.filename}`;

    const u = await User.findByIdAndUpdate(
      userId,
      { photoUrl: publicUrl },
      { new: true }
    );
    if (!u) return res.status(404).json({ error: 'Not found' });

    return res.json(sanitize(u));
  } catch (err) {
    console.error('uploadMyPhoto error:', err);
    return res.status(500).json({ error: 'Failed to upload photo: ' + err.message });
  }
};
