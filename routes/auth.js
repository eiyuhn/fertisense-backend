// auth.js
const router = require('express').Router();
const { auth } = require('../utils/auth');
const ctrl = require('../controllers/authController');

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads', 'avatars');
fs.mkdirSync(uploadDir, { recursive: true });

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
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

/* sanity ping */
router.get('/ping', (_req, res) => res.json({ ok: true, route: '/api/auth' }));

/* public */
router.post('/register', ctrl.register);
router.post('/login', ctrl.login);

// 🔐 Forgot password flow (public)
router.post('/request-password-reset', ctrl.requestPasswordReset);
router.post('/reset-password', ctrl.resetPassword);

/* protected */
router.get('/me', auth, ctrl.me);
router.patch('/me', auth, ctrl.updateMe);
router.post('/me/photo', auth, upload.single('photo'), ctrl.uploadMyPhoto);
router.delete('/me/photo', auth, ctrl.deleteMyPhoto);

module.exports = router;
