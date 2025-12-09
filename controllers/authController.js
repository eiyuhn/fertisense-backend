// controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const SALT_ROUNDS = 10;

function sanitize(u) {
  if (!u) return null;
  const photoUrl =
    u.photoUrl && u.photoUrl.startsWith('/')
      ? u.photoUrl
      : u.photoUrl || '';

  return {
    _id: u._id,
    username: u.username,
    name: u.name,
    email: u.email || '',
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
  return jwt.sign({ id: userId, role }, JWT_SECRET, { expiresIn: '30d' });
}

/* -----------------------------------
 *  REGISTER  (POST /api/auth/register)
 * ----------------------------------- */
// body: { username, name, password, role?, address?, farmLocation?, mobile?, email?, securityQuestions? }
exports.register = async (req, res) => {
  try {
    const {
      username,
      name,
      password,
      role,
      address,
      farmLocation,
      mobile,
      email,
      securityQuestions = [],
    } = req.body || {};

    if (!username || !password || !name) {
      return res
        .status(400)
        .json({ error: 'Username, name, and password are required.' });
    }

    const normalizedUsername = String(username).trim().toLowerCase();
    if (!normalizedUsername) {
      return res.status(400).json({ error: 'Username cannot be empty.' });
    }

    const existing = await User.findOne({ username: normalizedUsername });
    if (existing) {
      return res.status(409).json({ error: 'Username is already taken.' });
    }

    const passwordHash = await bcrypt.hash(String(password), SALT_ROUNDS);

    // hash security question answers
    const sqDocs = [];
    for (const sq of securityQuestions) {
      if (!sq || !sq.question || !sq.answer) continue;
      const q = String(sq.question).trim();
      const a = String(sq.answer).trim().toLowerCase();
      if (!q || !a) continue;
      const answerHash = await bcrypt.hash(a, SALT_ROUNDS);
      sqDocs.push({ question: q, answerHash });
    }

    if (sqDocs.length < 1) {
      return res.status(400).json({
        error: 'At least one security question is required.',
      });
    }

    const user = await User.create({
      username: normalizedUsername,
      name: name || '',
      email: email ? String(email).toLowerCase().trim() : undefined,
      role:
        role === 'admin'
          ? 'admin'
          : role === 'guest'
          ? 'guest'
          : 'stakeholder',
      address: address || '',
      farmLocation: farmLocation || '',
      mobile: mobile || '',
      passwordHash,
      securityQuestions: sqDocs,
    });

    const token = signToken(user._id.toString(), user.role);
    return res.status(201).json({ token, user: sanitize(user) });
  } catch (err) {
    console.error('Register error:', err);
    if (err.code && err.code === 11000) {
      // could be username unique conflict
      return res
        .status(409)
        .json({ error: 'Username or email is already in use.' });
    }
    return res.status(500).json({
      error: 'Failed to register: Please check server logs for details.',
    });
  }
};

/* --------------------------------
 *  LOGIN  (POST /api/auth/login)
 * -------------------------------- */
// body: { username, password }
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: 'Username and password are required.' });
    }

    const normalizedUsername = String(username).trim().toLowerCase();
    const user = await User.findOne({ username: normalizedUsername });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(String(password), user.passwordHash || '');
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken(user._id.toString(), user.role);
    return res.json({ token, user: sanitize(user) });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Failed to login: ' + err.message });
  }
};

/* -------------------------------
 *  ME  (GET /api/auth/me)
 * ------------------------------- */
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

/* -------------------------------
 *  UPDATE ME  (PATCH /api/auth/me)
 * ------------------------------- */
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
    if (typeof req.body.email === 'string')
      update.email = req.body.email.toLowerCase().trim();

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

/* -------------------------------
 *  PHOTO UPLOAD / DELETE
 * ------------------------------- */

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

// DELETE /api/auth/me
exports.deleteMe = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user.id);
    return res.json({ ok: true, message: 'Account deleted' });
  } catch (err) {
    console.error('deleteMe error', err);
    return res.status(500).json({ error: 'Failed to delete account' });
  }
};

/* -------------------------------------------
 *  SECURITY QUESTIONS – FORGOT PASSWORD FLOW
 * ------------------------------------------- */

// POST /api/auth/security-questions
// body: { username }
exports.getSecurityQuestions = async (req, res) => {
  try {
    const { username } = req.body || {};
    if (!username) {
      return res.status(400).json({ error: 'Username is required.' });
    }

    const normalizedUsername = String(username).trim().toLowerCase();
    const user = await User.findOne({ username: normalizedUsername });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const questions = (user.securityQuestions || []).map((sq, idx) => ({
      index: idx,
      question: sq.question,
    }));

    if (!questions.length) {
      return res
        .status(400)
        .json({ error: 'No security questions set for this user.' });
    }

    return res.json({ questions });
  } catch (err) {
    console.error('getSecurityQuestions error:', err);
    return res
      .status(500)
      .json({ error: 'Failed to fetch security questions: ' + err.message });
  }
};

// POST /api/auth/reset-password
// body: { username, index, answer, newPassword }
exports.resetPassword = async (req, res) => {
  try {
    const { username, index, answer, newPassword } = req.body || {};

    if (!username || index === undefined || !answer || !newPassword) {
      return res.status(400).json({
        error: 'Username, question index, answer, and new password are required.',
      });
    }

    const normalizedUsername = String(username).trim().toLowerCase();
    const user = await User.findOne({ username: normalizedUsername });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const stored = user.securityQuestions || [];
    if (!stored.length) {
      return res
        .status(400)
        .json({ error: 'No security questions set for this user.' });
    }

    if (index < 0 || index >= stored.length) {
      return res.status(400).json({ error: 'Invalid question index.' });
    }

    const sq = stored[index];
    const provided = String(answer || '').trim().toLowerCase();

    const ok = await bcrypt.compare(provided, sq.answerHash);
    if (!ok) {
      return res.status(401).json({ error: 'Incorrect security answer.' });
    }

    const newHash = await bcrypt.hash(String(newPassword), SALT_ROUNDS);
    user.passwordHash = newHash;
    await user.save();

    return res.json({ success: true, message: 'Password reset successful.' });
  } catch (err) {
    console.error('resetPassword error:', err);
    return res
      .status(500)
      .json({ error: 'Failed to reset password: ' + err.message });
  }
};
