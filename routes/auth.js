const router = require('express').Router();
const { auth } = require('../utils/auth');
const ctrl = require('../controllers/authController');

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'avatars');
fs.mkdirSync(uploadDir, { recursive: true });

// Multer setup for avatar uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const base = `user_${req.user?.id || 'anon'}_${Date.now()}`;
    cb(null, base + ext);
  },
});
const fileFilter = (_req, file, cb) => {
  const ok = /image\/(jpeg|png|webp|gif)/i.test(file.mimetype || '');
  if (!ok) return cb(new Error('Only image files are allowed'), false);
  cb(null, true);
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

/* sanity ping (prove this router is mounted) */
router.get('/ping', (_req, res) => res.json({ ok: true, route: '/api/auth' }));

/* public */
router.post('/register', ctrl.register);
router.post('/login', ctrl.login);

/* protected */
router.get('/me', auth, ctrl.me);

// Update profile fields
router.patch('/me', auth, ctrl.updateMe);

// Upload profile photo (field name: "photo")
router.post('/me/photo', auth, upload.single('photo'), ctrl.uploadMyPhoto);

// 🆕 NEW: Delete profile photo
router.delete('/me/photo', auth, ctrl.deleteMyPhoto);

module.exports = router;
