// controllers/farmerController.js
const mongoose = require('mongoose');
const Farmer = require('../models/Farmer');

/* ---------- helpers ---------- */
function sanitizeCode(input) {
  const c = (input ?? '').toString().trim();
  // empty string → undefined so sparse unique index ignores it
  return c === '' ? undefined : c;
}
function toNumOrNull(v) {
  return v === '' || v === null || v === undefined ? null : Number(v);
}
function handleDupKey(res, e) {
  if (e?.code === 11000) {
    return res.status(409).json({ error: 'Farmer code already exists for this owner' });
  }
  return null;
}

/* ---------- FARMERS ---------- */
exports.listFarmers = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    const q = { ownerId };
    if (req.query.code) q.code = String(req.query.code);
    const farmers = await Farmer.find(q).sort({ createdAt: -1 });
    res.json(farmers);
  } catch (e) {
    res.status(500).json({ error: 'Failed to list farmers: ' + e.message });
  }
};

exports.createFarmer = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    const b = req.body || {};
    const name = (b.name ?? '').toString().trim();
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const doc = {
      ownerId,
      name,
      farmLocation: (b.farmLocation ?? '').toString(),
      cropType: (b.cropType ?? '').toString(),
      cropStyle: (b.cropStyle ?? '').toString(),
      landAreaHa: b.landAreaHa === '' || b.landAreaHa === undefined ? 0 : Number(b.landAreaHa),
      code: sanitizeCode(b.code),
    };

    if (doc.code) {
      const exists = await Farmer.findOne({ ownerId, code: doc.code });
      if (exists) return res.status(409).json({ error: 'Farmer code already exists for this owner' });
    }

    const farmer = await Farmer.create(doc);
    res.status(201).json(farmer);
  } catch (e) {
    if (handleDupKey(res, e)) return;
    res.status(500).json({ error: 'Failed to create farmer: ' + e.message });
  }
};

exports.getFarmer = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

    const farmer = await Farmer.findOne({ _id: id, ownerId });
    if (!farmer) return res.status(404).json({ error: 'Farmer not found' });
    res.json(farmer);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch farmer: ' + e.message });
  }
};

exports.updateFarmer = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

    const b = req.body || {};
    const set = {
      name: (b.name ?? '').toString().trim(),
      farmLocation: (b.farmLocation ?? '').toString(),
      cropType: (b.cropType ?? '').toString(),
      cropStyle: (b.cropStyle ?? '').toString(),
      landAreaHa: b.landAreaHa === '' || b.landAreaHa === undefined ? 0 : Number(b.landAreaHa),
      code: sanitizeCode(b.code),
    };

    if (set.code) {
      const exists = await Farmer.findOne({ ownerId, code: set.code, _id: { $ne: id } });
      if (exists) return res.status(409).json({ error: 'Farmer code already exists for this owner' });
    }

    const updated = await Farmer.findOneAndUpdate(
      { _id: id, ownerId },
      { $set: set },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: 'Farmer not found' });

    res.json(updated);
  } catch (e) {
    if (handleDupKey(res, e)) return;
    res.status(500).json({ error: 'Failed to update farmer: ' + e.message });
  }
};

exports.deleteFarmer = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

    const del = await Farmer.findOneAndDelete({ _id: id, ownerId });
    if (!del) return res.status(404).json({ error: 'Farmer not found' });

    // readings are embedded; deleting farmer removes them too
    res.json({ ok: true, deleted: id });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete farmer: ' + e.message });
  }
};

/* ---------- READINGS (embedded: only NPK + pH) ---------- */
exports.listReadingsByFarmer = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid farmerId' });

    const farmer = await Farmer.findOne({ _id: id, ownerId }, { readings: 1 });
    if (!farmer) return res.status(404).json({ error: 'Farmer not found' });

    const sorted = [...(farmer.readings || [])].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    res.json(sorted);
  } catch (e) {
    res.status(500).json({ error: 'Failed to list readings: ' + e.message });
  }
};

exports.addReading = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid farmerId' });

    const b = req.body || {};
    // Accept { npk: {N,P,K} } or lowercase n/p/k
    const n = Number(b?.npk?.N ?? b?.npk?.n ?? b?.n ?? 0);
    const p = Number(b?.npk?.P ?? b?.npk?.p ?? b?.p ?? 0);
    const k = Number(b?.npk?.K ?? b?.npk?.k ?? b?.k ?? 0);

    const reading = {
      source: (b.source || 'manual').toString(),
      n, p, k,
      ph: toNumOrNull(b.ph),
      raw: b.raw,
    };

    const updated = await Farmer.findOneAndUpdate(
      { _id: id, ownerId },
      { $push: { readings: reading } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Farmer not found' });

    const last = updated.readings[updated.readings.length - 1];
    res.status(201).json(last);
  } catch (e) {
    res.status(500).json({ error: 'Failed to add reading: ' + e.message });
  }
};

exports.updateReading = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    const farmerId = req.params.id;
    const readingId = req.params.readingId;
    if (!mongoose.isValidObjectId(farmerId)) return res.status(400).json({ error: 'Invalid farmerId' });
    if (!mongoose.isValidObjectId(readingId)) return res.status(400).json({ error: 'Invalid readingId' });

    const b = req.body || {};
    const set = {};
    if (b.npk) {
      if ('N' in b.npk) set['readings.$.n'] = Number(b.npk.N);
      if ('P' in b.npk) set['readings.$.p'] = Number(b.npk.P);
      if ('K' in b.npk) set['readings.$.k'] = Number(b.npk.K);
    }
    if ('ph' in b) set['readings.$.ph'] = toNumOrNull(b.ph);
    if ('source' in b) set['readings.$.source'] = (b.source || 'manual').toString();

    const updated = await Farmer.findOneAndUpdate(
      { _id: farmerId, ownerId, 'readings._id': readingId },
      { $set: set },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Reading not found' });

    const r = updated.readings.id(readingId);
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update reading: ' + e.message });
  }
};

exports.deleteReading = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    const farmerId = req.params.id;
    const readingId = req.params.readingId;
    if (!mongoose.isValidObjectId(farmerId)) return res.status(400).json({ error: 'Invalid farmerId' });
    if (!mongoose.isValidObjectId(readingId)) return res.status(400).json({ error: 'Invalid readingId' });

    const updated = await Farmer.findOneAndUpdate(
      { _id: farmerId, ownerId },
      { $pull: { readings: { _id: readingId } } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Reading not found' });

    res.json({ ok: true, deleted: readingId });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete reading: ' + e.message });
  }
};
