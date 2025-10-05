// controllers/farmerController.js
const mongoose = require('mongoose');
const Farmer = require('../models/Farmer');
const Reading = require('../models/Reading'); // N, P, K, ph, ec, moisture, temp, farmerId, createdAt

// --------- FARMERS ----------
exports.listFarmers = async (req, res) => {
  try {
    const q = {};
    // Optional: search by code ?code=ABC123
    if (req.query.code) q.code = req.query.code;
    const farmers = await Farmer.find(q).sort({ createdAt: -1 });
    res.json(farmers);
  } catch (e) {
    res.status(500).json({ error: 'Failed to list farmers: ' + e.message });
  }
};

exports.createFarmer = async (req, res) => {
  try {
    const body = req.body || {};
    // expected minimal fields: { name, code?, address?, farmLocation?, mobile? }
    const farmer = await Farmer.create({
      name: body.name?.trim(),
      code: body.code?.trim(),
      address: body.address || '',
      farmLocation: body.farmLocation || '',
      mobile: body.mobile || '',
    });
    res.status(201).json(farmer);
  } catch (e) {
    res.status(500).json({ error: 'Failed to create farmer: ' + e.message });
  }
};

exports.getFarmer = async (req, res) => {
  try {
    const farmer = await Farmer.findById(req.params.id);
    if (!farmer) return res.status(404).json({ error: 'Farmer not found' });
    res.json(farmer);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch farmer: ' + e.message });
  }
};

exports.updateFarmer = async (req, res) => {
  try {
    const updated = await Farmer.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          name: req.body.name,
          code: req.body.code,
          address: req.body.address,
          farmLocation: req.body.farmLocation,
          mobile: req.body.mobile,
        },
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Farmer not found' });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update farmer: ' + e.message });
  }
};

exports.deleteFarmer = async (req, res) => {
  try {
    const id = req.params.id;
    const f = await Farmer.findByIdAndDelete(id);
    if (!f) return res.status(404).json({ error: 'Farmer not found' });
    // Optional: also delete that farmer’s readings
    await Reading.deleteMany({ farmerId: id });
    res.json({ ok: true, deleted: id });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete farmer: ' + e.message });
  }
};

// --------- READINGS (under a farmer) ----------
exports.listReadingsByFarmer = async (req, res) => {
  try {
    const farmerId = req.params.id;
    if (!mongoose.isValidObjectId(farmerId)) {
      return res.status(400).json({ error: 'Invalid farmerId' });
    }
    const readings = await Reading.find({ farmerId })
      .sort({ createdAt: -1 });
    res.json(readings);
  } catch (e) {
    res.status(500).json({ error: 'Failed to list readings: ' + e.message });
  }
};

exports.addReading = async (req, res) => {
  try {
    const farmerId = req.params.id;
    if (!mongoose.isValidObjectId(farmerId)) {
      return res.status(400).json({ error: 'Invalid farmerId' });
    }
    const { npk = {}, ph, ec, moisture, temp, source } = req.body || {};
    const reading = await Reading.create({
      farmerId,
      N: Number(npk.N ?? npk.n ?? 0),
      P: Number(npk.P ?? npk.p ?? 0),
      K: Number(npk.K ?? npk.k ?? 0),
      ph: ph == null ? null : Number(ph),
      ec: ec == null ? null : Number(ec),
      moisture: moisture == null ? null : Number(moisture),
      temp: temp == null ? null : Number(temp),
      source: source || 'manual',
    });
    res.status(201).json(reading);
  } catch (e) {
    res.status(500).json({ error: 'Failed to add reading: ' + e.message });
  }
};

exports.updateReading = async (req, res) => {
  try {
    const { id: farmerId, readingId } = req.params;
    if (!mongoose.isValidObjectId(farmerId) || !mongoose.isValidObjectId(readingId)) {
      return res.status(400).json({ error: 'Invalid ids' });
    }
    // Only allow update on a reading that belongs to this farmer
    const fields = {};
    if (req.body.npk) {
      if ('N' in req.body.npk) fields['N'] = Number(req.body.npk.N);
      if ('P' in req.body.npk) fields['P'] = Number(req.body.npk.P);
      if ('K' in req.body.npk) fields['K'] = Number(req.body.npk.K);
    }
    ['ph', 'ec', 'moisture', 'temp', 'source'].forEach((k) => {
      if (k in (req.body || {})) fields[k] = req.body[k];
    });

    const updated = await Reading.findOneAndUpdate(
      { _id: readingId, farmerId },
      { $set: fields },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Reading not found' });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update reading: ' + e.message });
  }
};

exports.deleteReading = async (req, res) => {
  try {
    const { id: farmerId, readingId } = req.params;
    if (!mongoose.isValidObjectId(farmerId) || !mongoose.isValidObjectId(readingId)) {
      return res.status(400).json({ error: 'Invalid ids' });
    }
    const del = await Reading.findOneAndDelete({ _id: readingId, farmerId });
    if (!del) return res.status(404).json({ error: 'Reading not found' });
    res.json({ ok: true, deleted: readingId });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete reading: ' + e.message });
  }
};
