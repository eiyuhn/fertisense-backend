const path = require('path');
const sharp = require('sharp');
const { AVATAR_DIR } = require('../middleware/upload');
const User = require('../models/User');

// POST /api/users/me/photo
// multipart/form-data with field name: "photo"
exports.uploadMyPhoto = async (req, res, next) => {
  try {
    console.log('🔥 uploadMyPhoto called');
    console.log('req.user:', req.user);
    console.log('req.file:', req.file);

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const inputPath = req.file.path;
    console.log('inputPath:', inputPath);

    const filename = path.basename(inputPath).replace(path.extname(inputPath), '.jpg');
    const outputPath = path.join(AVATAR_DIR, filename);

    await sharp(inputPath)
      .rotate()
      .resize(512, 512, { fit: 'cover' })
      .jpeg({ quality: 85 })
      .toFile(outputPath);

    const publicUrl = `${req.protocol}://${req.get('host')}/uploads/avatars/${filename}`;
    console.log('publicUrl:', publicUrl);

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { photoUrl: publicUrl },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.json({ ok: true, photoUrl: user.photoUrl });
  } catch (err) {
    console.error('💥 uploadMyPhoto error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
};

