const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

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
    // ... (registration logic) ...
    const user = await User.create({
      // ... (user data) ...
      role: req.body.role === 'admin' ? 'admin' : (req.body.role === 'guest' ? 'guest' : 'stakeholder'),
      address: req.body.address || '',
      farmLocation: req.body.farmLocation || '',
      mobile: req.body.mobile || '',
    });

    const token = signToken(user._id.toString(), user.role);
    // ✅ Includes photoUrl in response
    return res.status(201).json({ token, user: sanitize(user) });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Failed to register: ' + err.message });
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

// POST /api/auth/me/photo (This should ideally be moved to userController.js)
exports.uploadMyPhoto = async (req, res) => {
  try {
    // Note: The logic in userController.js needs to be the one that handles the image processing and saving the RELATIVE path.
    // If this function is still being used, the URL it generates is fragile.
    // Assuming a robust upload logic saves the file and returns a relative path like /uploads/avatars/filename.jpg
    
    // We will assume that the photo file has been uploaded by the Multer middleware
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

    // The photoUrl should be the relative path saved by Multer/Sharp logic (e.g., in userController)
    // We assume the userController handled the processing and saving the correct relative path to the DB.

    // If this controller is responsible for updating the DB:
    // This line is prone to error on Render: const publicUrl = `${req.protocol}://${req.get('host')}/uploads/avatars/${req.file.filename}`;
    // It should be using the relative path that the frontend knows how to prepend BASE_URL to.
    
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
