const Reading = require('../models/Reading');

exports.createReading = async (req, res) => {
  const payload = req.body || {};
  // Basic validation
  ['N','P','K'].forEach(k => {
    if (payload[k] != null && typeof payload[k] !== 'number') {
      return res.status(400).json({ error: `${k} must be a number` });
    }
  });

  const reading = await Reading.create({
    userId: req.user.id,
    source: payload.source || 'manual',
    N: payload.N,
    P: payload.P,
    K: payload.K,
    pH: payload.pH,
    temperature: payload.temperature,
    moisture: payload.moisture,
    ec: payload.ec
  });
  res.json(reading);
};

exports.listReadings = async (req, res) => {
  const { limit = 50 } = req.query;
  const items = await Reading.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(Number(limit));
  res.json(items);
};

exports.getReading = async (req, res) => {
  const r = await Reading.findOne({ _id: req.params.id, userId: req.user.id });
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json(r);
};

exports.deleteReading = async (req, res) => {
  const r = await Reading.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
};
