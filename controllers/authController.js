const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Assuming this is your Mongoose model

function sanitize(u) {
  if (!u) return null;
  // Ensure photoUrl is included, returning a relative path if it exists
  const photoUrl = u.photoUrl && u.photoUrl.startsWith('/') ? u.photoUrl : (u.photoUrl || '');

  return {
    _id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    address: u.address || '',
    farmLocation: u.farmLocation || '',
    mobile: u.mobile || '',
    photoUrl: photoUrl, // ✅ Returns relative path
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
    const { email, password, name, role, address, farmLocation, mobile } = req.body;

    // --- 1. BASIC VALIDATION ---
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // --- 2. HASH PASSWORD ---
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // --- 3. CREATE USER IN DB ---
    // Now including the required fields: email and passwordHash
    const user = await User.create({
      email: String(email).toLowerCase().trim(), // FIX: Must explicitly include email
      passwordHash: passwordHash, // FIX: Must include the hashed password
      name: name,
      role: role === 'admin' ? 'admin' : (role === 'guest' ? 'guest' : 'stakeholder'),
      address: address || '',
      farmLocation: farmLocation || '',
      mobile: mobile || '',
    });

    const token = signToken(user._id.toString(), user.role);
    // ✅ Includes photoUrl in response
    return res.status(201).json({ token, user: sanitize(user) });
  } catch (err) {
    console.error('Register error:', err);
    // Return a generic error to the client, but log the specific details server-side
    if (err.code && err.code === 11000) { // MongoDB duplicate key error
      return res.status(409).json({ error: 'This email address is already in use.' });
    }
    return res.status(500).json({ error: 'Failed to register: Please check server logs for details.' });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const user = await User.findOne({ email: String(req.body.email).toLowerCase().trim() });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(req.body.password, user.passwordHash || '');
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user._id.toString(), user.role);
    // ✅ Includes photoUrl in response
    return res.json({ token, user: sanitize(user) });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Failed to login: ' + err.message });
  }
};

// GET /api/auth/me (Used for refreshMe)
exports.me = async (req, res) => {
  try {
    const u = await User.findById(req.user.id);
    if (!u) return res.status(404).json({ error: 'Not found' });
    // ✅ Includes photoUrl in refresh
    return res.json(sanitize(u));
  } catch (err) {
    console.error('Me error:', err);
    return res.status(500).json({ error: 'Failed to fetch profile: ' + err.message });
  }
};

// PATCH /api/auth/me (updates profile fields)
exports.updateMe = async (req, res) => {
  try {
    // ... (update logic) ...
    const update = {}; 
    if (typeof req.body.name === 'string') update.name = req.body.name.trim();
    if (typeof req.body.address === 'string') update.address = req.body.address.trim();
    if (typeof req.body.farmLocation === 'string') update.farmLocation = req.body.farmLocation.trim();
    if (typeof req.body.mobile === 'string') update.mobile = req.body.mobile.trim();

    const u = await User.findByIdAndUpdate(req.user.id, update, { new: true });
    if (!u) return res.status(404).json({ error: 'Not found' });

    // ✅ Returns updated and sanitized user
    return res.json(sanitize(u));
  } catch (err) {
    console.error('updateMe error:', err);
    return res.status(500).json({ error: 'Failed to update profile: ' + err.message });
  }
};

// POST /api/auth/me/photo (Upload)
exports.uploadMyPhoto = async (req, res) => {
  try {
    // We will assume that the photo file has been uploaded by the Multer middleware
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

    // Assuming the file is saved as filename.jpg in /uploads/avatars/
    const publicUrl = `/uploads/avatars/${req.file.filename}`; 

    const u = await User.findByIdAndUpdate(
      req.user.id,
      { photoUrl: publicUrl },
      { new: true }
    );
    if (!u) return res.status(404).json({ error: 'Not found' });

    // ✅ Returns sanitized user, which includes the relative photoUrl
    return res.json(sanitize(u)); 
  } catch (err) {
    console.error('uploadMyPhoto error:', err);
    return res.status(500).json({ error: 'Failed to upload photo: ' + err.message });
  }
};

// DELETE /api/auth/me/photo (Delete)
exports.deleteMyPhoto = async (req, res) => {
  try {
    // Set photoUrl to an empty string/null to use the default avatar on the client
    const u = await User.findByIdAndUpdate(
      req.user.id,
      { photoUrl: '' }, // Clear the URL
      { new: true }
    );
    if (!u) return res.status(404).json({ error: 'Not found' });

    // Note: Actual file deletion from disk/storage (e.g., S3) should happen here
    
    // Returns sanitized user, which now has an empty photoUrl
    return res.json(sanitize(u));
  } catch (err) {
    console.error('deleteMyPhoto error:', err);
    return res.status(500).json({ error: 'Failed to delete photo: ' + err.message });
  }
};
