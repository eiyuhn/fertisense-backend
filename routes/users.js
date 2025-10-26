const router = require('express').Router();
const { auth } = require('../utils/auth');
const { upload } = require('../middleware/upload');
const { uploadMyPhoto } = require('../controllers/userController');

// sanity ping
router.get('/ping', (_req, res) => res.json({ ok: true, route: '/api/users' }));

// Upload/replace my avatar
router.post('/me/photo', auth, upload.single('photo'), uploadMyPhoto);

module.exports = router;
