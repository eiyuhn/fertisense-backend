// controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Assuming this is your Mongoose model

function sanitize(u) {
  if (!u) return null;
  const photoUrl =
    u.photoUrl && u.photoUrl.startsWith('/')
      ? u.photoUrl
      : u.photoUrl || '';

  return {
    _id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    address: u.address || '',
    farmLocation: u.farmLocation || '',
    mobile: u.mobile || '',
    photoUrl,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

function signToken(userId, role) {
  const secret = process.env.JWT_SECRET || 'dev_secret';
  return jwt.sign({ id: userId, role }, secret, { expiresIn: '30d' });
}

function generateResetCode() {
  // 6-digit numeric code
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { email, password, name, role, address, farmLocation, mobile } =
      req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: 'Email and password are required.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      email: String(email).toLowerCase().trim(),
      passwordHash,
      name,
      role:
        role === 'admin'
          ? 'admin'
          : role === 'guest'
          ? 'guest'
          : 'stakeholder',
      address: address || '',
      farmLocation: farmLocation || '',
      mobile: mobile || '',
    });

    const token = signToken(user._id.toString(), user.role);
    return res.status(201).json({ token, user: sanitize(user) });
  } catch (err) {
    console.error('Register error:', err);
    if (err.code && err.code === 11000) {
      return res
        .status(409)
        .json({ error: 'This email address is already in use.' });
    }
    return res.status(500).json({
      error: 'Failed to register: Please check server logs for details.',
    });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const user = await User.findOne({
      email: String(req.body.email).toLowerCase().trim(),
    });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(req.body.password, user.passwordHash || '');
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
    return res
      .status(500)
      .json({ error: 'Failed to fetch profile: ' + err.message });
  }
};

// PATCH /api/auth/me
exports.updateMe = async (req, res) => {
  try {
    const update = {};
    if (typeof req.body.name === 'string') update.name = req.body.name.trim();
    if (typeof req.body.address === 'string')
      update.address = req.body.address.trim();
    if (typeof req.body.farmLocation === 'string')
      update.farmLocation = req.body.farmLocation.trim();
    if (typeof req.body.mobile === 'string')
      update.mobile = req.body.mobile.trim();

    const u = await User.findByIdAndUpdate(req.user.id, update, { new: true });
    if (!u) return res.status(404).json({ error: 'Not found' });

    return res.json(sanitize(u));
  } catch (err) {
    console.error('updateMe error:', err);
    return res
      .status(500)
      .json({ error: 'Failed to update profile: ' + err.message });
  }
};

// POST /api/auth/me/photo
exports.uploadMyPhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

    const publicUrl = `/uploads/avatars/${req.file.filename}`;

    const u = await User.findByIdAndUpdate(
      req.user.id,
      { photoUrl: publicUrl },
      { new: true }
    );
    if (!u) return res.status(404).json({ error: 'Not found' });

    return res.json(sanitize(u));
  } catch (err) {
    console.error('uploadMyPhoto error:', err);
    return res
      .status(500)
      .json({ error: 'Failed to upload photo: ' + err.message });
  }
};

// DELETE /api/auth/me/photo
exports.deleteMyPhoto = async (req, res) => {
  try {
    const u = await User.findByIdAndUpdate(
      req.user.id,
      { photoUrl: '' },
      { new: true }
    );
    if (!u) return res.status(404).json({ error: 'Not found' });

    return res.json(sanitize(u));
  } catch (err) {
    console.error('deleteMyPhoto error:', err);
    return res
      .status(500)
      .json({ error: 'Failed to delete photo: ' + err.message });
  }
};

/* 🔐 FORGOT PASSWORD FLOW */

// POST /api/auth/request-password-reset
// body: { email, mobile }
exports.requestPasswordReset = async (req, res) => {
  try {
    let { email, mobile } = req.body || {};
    if (!email || !mobile) {
      return res
        .status(400)
        .json({ error: 'Email and mobile number are required.' });
    }

    email = String(email).toLowerCase().trim();
    // keep only digits of mobile
    mobile = String(mobile).replace(/[^0-9]/g, '');

    const user = await User.findOne({ email, mobile });
    if (!user) {
      return res.status(404).json({
        error: 'No account matches that email and mobile number.',
      });
    }

    const code = generateResetCode();
    user.resetCode = code;
    user.resetCodeExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 min
    await user.save();

    // TODO: integrate real SMS sending here using user.mobile
    // For now we just return ok + testCode (only in non-production)
    const payload = { ok: true, message: 'Reset code generated.' };
    if (process.env.NODE_ENV !== 'production') {
      payload.testCode = code; // helpful for dev/testing
    }

    return res.json(payload);
  } catch (err) {
    console.error('requestPasswordReset error:', err);
    return res.status(500).json({
      error: 'Failed to request password reset: ' + err.message,
    });
  }
};

// POST /api/auth/reset-password
// body: { email, mobile, code, newPassword }
exports.resetPassword = async (req, res) => {
  try {
    let { email, mobile, code, newPassword } = req.body || {};
    if (!email || !mobile || !code || !newPassword) {
      return res.status(400).json({
        error: 'Email, mobile, code, and new password are required.',
      });
    }

    email = String(email).toLowerCase().trim();
    mobile = String(mobile).replace(/[^0-9]/g, '');
    code = String(code).trim();

    const user = await User.findOne({ email, mobile });
    if (!user || !user.resetCode || !user.resetCodeExpires) {
      return res.status(400).json({ error: 'No reset request found.' });
    }

    if (user.resetCode !== code) {
      return res.status(400).json({ error: 'Invalid reset code.' });
    }

    if (user.resetCodeExpires.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Reset code has expired.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    user.passwordHash = passwordHash;
    user.resetCode = null;
    user.resetCodeExpires = null;
    await user.save();

    return res.json({ ok: true, message: 'Password updated successfully.' });
  } catch (err) {
    console.error('resetPassword error:', err);
    return res
      .status(500)
      .json({ error: 'Failed to reset password: ' + err.message });
  }
};
