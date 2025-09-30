// utils/auth.js
const jwt = require('jsonwebtoken');

// Bearer token auth: sets req.user = { id, role }
exports.auth = (req, res, next) => {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    const secret = process.env.JWT_SECRET || 'dev_secret';
    const payload = jwt.verify(token, secret);
    req.user = { id: payload.id, role: payload.role || 'stakeholder' };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Role gate (simple)
exports.requireRole = (role) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.role !== role) return res.status(403).json({ error: `${role} only` });
  next();
};
