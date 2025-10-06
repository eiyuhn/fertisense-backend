const Reading = require('../models/Reading'); // keep if you still use standalone readings
const Farmer  = require('../models/Farmer');

exports.createReading = async (req, res) => {
  const payload = req.body || {};
  ['N','P','K'].forEach(k => {
    if (payload[k] != null && typeof payload[k] !== 'number') {
      return res.status(400).json({ error: `${k} must be a number` });
    }
  });
  const reading = await Reading.create({
    userId: req.user.id,
    source: payload.source || 'manual',
    N: payload.N, P: payload.P, K: payload.K,
    pH: payload.pH, temperature: payload.temperature,
    moisture: payload.moisture, ec: payload.ec
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

// -------- 10-point batch, saved under Farmer --------
exports.addReadingBatch = async (req, res) => {
  const { farmerId } = req.params;
  const { points = [], meta = {} } = req.body || {};
  if (!Array.isArray(points) || points.length === 0) {
    return res.status(400).json({ message: 'points[] required' });
  }

  const farmer = await Farmer.findOne({ _id: farmerId, ownerId: req.user.id });
  if (!farmer) return res.status(404).json({ message: 'Farmer not found' });

  const clean = points.map(p => ({
    source: 'esp32',
    n: Number(p.n ?? p.N ?? 0),
    p: Number(p.p ?? p.P ?? 0),
    k: Number(p.k ?? p.K ?? 0),
    ph: p.ph != null ? Number(p.ph) : undefined,
    moisture: p.moisture != null ? Number(p.moisture) : undefined,
    raw: p,
    createdAt: p.ts ? new Date(p.ts) : undefined,
  }));

  const sum = (arr, sel) => arr.reduce((a, x) => a + (Number(x[sel]) || 0), 0);
  const arr = sel => clean.map(x => Number(x[sel] ?? 0));
  const avg = {
    n: +(sum(clean, 'n') / clean.length).toFixed(1),
    p: +(sum(clean, 'p') / clean.length).toFixed(1),
    k: +(sum(clean, 'k') / clean.length).toFixed(1),
    ph: clean.some(x => x.ph != null) ? +(sum(clean, 'ph') / clean.length).toFixed(2) : undefined,
    moisture: clean.some(x => x.moisture != null) ? +(sum(clean, 'moisture') / clean.length).toFixed(1) : undefined,
  };
  const min = { n: Math.min(...arr('n')), p: Math.min(...arr('p')), k: Math.min(...arr('k')) };
  const max = { n: Math.max(...arr('n')), p: Math.max(...arr('p')), k: Math.max(...arr('k')) };
  const batchId = Date.now().toString(36);

  clean.forEach(pt => farmer.readings.push({ ...pt, batchId }));
  if (!farmer.readingSummaries) farmer.readingSummaries = [];
  farmer.readingSummaries.push({ batchId, count: clean.length, meta, avg, min, max, createdAt: new Date() });

  await farmer.save();
  res.json({ ok: true, batchId, count: clean.length, summary: { avg, min, max } });
};
