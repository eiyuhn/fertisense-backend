const path = require('path');
const fs = require('fs');
const multer = require('multer');

const ROOT = path.join(__dirname, '..');
const TMP_DIR = path.join(ROOT, 'uploads', 'tmp');
const AVATAR_DIR = path.join(ROOT, 'uploads', 'avatars');

fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const storage = multer.diskStorage({
  // Save RAW upload to temp first
  destination: (_req, _file, cb) => cb(null, TMP_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname((file.originalname || '')).toLowerCase() || '.jpg';
    const safeUser = (req.user && req.user.id) ? req.user.id : 'anon';
    cb(null, `${safeUser}-${Date.now()}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only image files are allowed'), false);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

module.exports = { upload, AVATAR_DIR, TMP_DIR };
