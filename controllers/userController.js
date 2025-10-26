const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { AVATAR_DIR } = require('../middleware/upload');
const User = require('../models/User');

// POST /api/users/me/photo
// multipart/form-data with field name: "photo"
exports.uploadMyPhoto = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const inputPath = req.file.path; // saved in TMP_DIR
    const filename = `${req.user.id}-${Date.now()}.jpg`; // always a NEW name
    const outputPath = path.join(AVATAR_DIR, filename);

    // Normalize: rotate (EXIF), square crop to 512, compress jpeg
    await sharp(inputPath)
      .rotate()
      .resize(512, 512, { fit: 'cover' })
      .jpeg({ quality: 85 })
      .toFile(outputPath);

    // cleanup temp file (ignore errors)
    fs.unlink(inputPath, () => {});

    // Build public URL (served statically by Express)
    const publicUrl = `${req.protocol}://${req.get('host')}/uploads/avatars/${filename}`;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { photoUrl: publicUrl },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.json({ ok: true, photoUrl: user.photoUrl });
  } catch (err) {
    console.error('uploadMyPhoto error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
};
