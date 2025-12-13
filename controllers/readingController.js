// controllers/readingController.js
const mongoose = require('mongoose');
const Reading = require('../models/Reading');
const Farmer = require('../models/Farmer');

// ---------- Helper: normalize numeric input from various shapes ----------
function pickReadingNumbers(payload = {}) {
  const n = payload.n ?? payload.N ?? payload?.npk?.N ?? payload?.npk?.n;
  const p = payload.p ?? payload.P ?? payload?.npk?.P ?? payload?.npk?.p;
  const k = payload.k ?? payload.K ?? payload?.npk?.K ?? payload?.npk?.k;
  const ph = payload.ph ?? payload.pH;

  return {
    n: n === '' || n === null || n === undefined ? undefined : Number(n),
    p: p === '' || p === null || p === undefined ? undefined : Number(p),
    k: k === '' || k === null || k === undefined ? undefined : Number(k),
    ph: ph === '' || ph === null || ph === undefined ? undefined : Number(ph),
  };
}

// ---------- Helper: sanitize plans ----------
function normalizePlans(rawPlans) {
  if (!Array.isArray(rawPlans)) return [];
  return rawPlans.map((p) => ({
    name: p?.name != null ? String(p.name) : '',
    cost: p?.cost != null ? String(p.cost) : '',
    details: Array.isArray(p?.details) ? p.details.map((x) => String(x)) : [],
  }));
}

// ---------- Create single reading (optionally linked to a farmer) ----------
exports.createReading = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const body = req.body || {};
    const {
      farmerId,
      source = 'manual',

      // narrative + plans
      recommendationText = '',
      englishText = '',
      fertilizerPlans = [],
      currency = 'PHP',

      // ✅ optional DA fields (won’t break if not sent)
      daSchedule = null,
      daCost = null,
      npkClass = '',
    } = body;

    const { n, p, k, ph } = pickReadingNumbers(body);

    const errors = [];
    if (!Number.isFinite(n)) errors.push('N must be a number');
    if (!Number.isFinite(p)) errors.push('P must be a number');
    if (!Number.isFinite(k)) errors.push('K must be a number');
    if (ph !== undefined && !Number.isFinite(ph)) errors.push('pH must be a number if provided');

    if (farmerId && !mongoose.isValidObjectId(farmerId)) errors.push('Invalid farmerId');

    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    const safePlans = normalizePlans(fertilizerPlans);

    // 1) Save reading (MongoDB Reading collection)
    const reading = await Reading.create({
      userId,
      farmerId: farmerId && mongoose.isValidObjectId(farmerId) ? farmerId : null,
      source,
      N: n,
      P: p,
      K: k,
      pH: ph,

      recommendationText: String(recommendationText || ''),
      englishText: String(englishText || ''),
      currency: String(currency || 'PHP'),
      fertilizerPlans: safePlans,

      daSchedule,
      daCost,
      npkClass: String(npkClass || ''),
    });

    // 2) If farmerId present, also push into embedded Farmer.readings[]
    let embedded;
    if (farmerId && mongoose.isValidObjectId(farmerId)) {
      const farmer = await Farmer.findOne({ _id: farmerId, ownerId: userId });
      if (!farmer) return res.status(404).json({ error: 'Farmer not found for this user' });

      farmer.readings.push({
        source: source === 'esp32' ? 'esp32' : 'manual',
        n,
        p,
        k,
        ph,
        raw: body.raw,
      });

      await farmer.save();
      embedded = farmer.readings[farmer.readings.length - 1];
    }

    return res.status(201).json({ reading, embedded });
  } catch (e) {
    console.error('[createReading] error:', e);
    return res.status(500).json({ error: 'Failed to create reading' });
  }
};

// ---------- List all readings (user-wide) ----------
exports.listReadings = async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const items = await Reading.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(Number(limit));
    res.json(items);
  } catch (e) {
    console.error('[listReadings] error:', e);
    res.status(500).json({ error: 'Failed to list readings' });
  }
};

// ---------- List readings for a specific farmer ----------
exports.listReadingsByFarmer = async (req, res) => {
  try {
    const { farmerId } = req.params;

    if (!mongoose.isValidObjectId(farmerId)) {
      return res.status(400).json({ error: 'Invalid farmerId' });
    }

    const items = await Reading.find({ userId: req.user.id, farmerId }).sort({ createdAt: -1 });
    return res.json(items);
  } catch (e) {
    console.error('[listReadingsByFarmer] error:', e);
    return res.status(500).json({ error: 'Failed to list readings for farmer' });
  }
};

// ---------- Get single reading by id ----------
exports.getReading = async (req, res) => {
  try {
    const r = await Reading.findOne({ _id: req.params.id, userId: req.user.id });
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json(r);
  } catch (e) {
    console.error('[getReading] error:', e);
    res.status(500).json({ error: 'Failed to fetch reading' });
  }
};

// ---------- Delete single reading by id ----------
exports.deleteReading = async (req, res) => {
  try {
    const r = await Reading.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[deleteReading] error:', e);
    res.status(500).json({ error: 'Failed to delete reading' });
  }
};

// ---------- Batch: ESP32 points saved under Farmer (embedded) ----------
exports.addReadingBatch = async (req, res) => {
  try {
    const { farmerId } = req.params;
    const { points = [], meta = {} } = req.body || {};

    if (!Array.isArray(points) || points.length === 0) {
      return res.status(400).json({ message: 'points[] required' });
    }

    if (!mongoose.isValidObjectId(farmerId)) {
      return res.status(400).json({ message: 'Invalid farmerId' });
    }

    const farmer = await Farmer.findOne({ _id: farmerId, ownerId: req.user.id });
    if (!farmer) return res.status(404).json({ message: 'Farmer not found' });

    const clean = points.map((pRaw) => {
      const { n, p, k, ph } = pickReadingNumbers(pRaw);
      return {
        source: 'esp32',
        n: Number.isFinite(n) ? n : 0,
        p: Number.isFinite(p) ? p : 0,
        k: Number.isFinite(k) ? k : 0,
        ph: Number.isFinite(ph) ? ph : undefined,
        moisture: pRaw.moisture != null ? Number(pRaw.moisture) : undefined,
        raw: pRaw,
        createdAt: pRaw.ts ? new Date(pRaw.ts) : undefined,
      };
    });

    const sum = (arr, key) => arr.reduce((a, x) => a + (Number(x[key]) || 0), 0);
    const arr = (key) => clean.map((x) => Number(x[key] ?? 0));

    const avg = {
      n: +(sum(clean, 'n') / clean.length).toFixed(1),
      p: +(sum(clean, 'p') / clean.length).toFixed(1),
      k: +(sum(clean, 'k') / clean.length).toFixed(1),
      ph: clean.some((x) => x.ph != null) ? +(sum(clean, 'ph') / clean.length).toFixed(2) : undefined,
      moisture: clean.some((x) => x.moisture != null)
        ? +(sum(clean, 'moisture') / clean.length).toFixed(1)
        : undefined,
    };

    const min = { n: Math.min(...arr('n')), p: Math.min(...arr('p')), k: Math.min(...arr('k')) };
    const max = { n: Math.max(...arr('n')), p: Math.max(...arr('p')), k: Math.max(...arr('k')) };
    const batchId = Date.now().toString(36);

    clean.forEach((pt) => farmer.readings.push({ ...pt, batchId }));
    if (!farmer.readingSummaries) farmer.readingSummaries = [];
    farmer.readingSummaries.push({ batchId, count: clean.length, meta, avg, min, max, createdAt: new Date() });

    await farmer.save();
    res.json({ ok: true, batchId, count: clean.length, summary: { avg, min, max } });
  } catch (e) {
    console.error('[addReadingBatch] error:', e);
    res.status(500).json({ error: 'Failed to save batch' });
  }
};
