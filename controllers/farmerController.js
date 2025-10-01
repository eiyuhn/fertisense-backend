// controllers/farmerController.js
const Farmer = require('../models/Farmer');

/**
 * Helper: only allow these fields to be set/updated by clients
 */
const ALLOWED_FIELDS = new Set([
  'name',
  'farmLocation',
  'cropType',
  'cropStyle',
  'landAreaHa',
  'code',
]);

function pickAllowed(body) {
  const out = {};
  for (const k of Object.keys(body || {})) {
    if (ALLOWED_FIELDS.has(k)) out[k] = body[k];
  }
  return out;
}

/**
 * POST /farmers
 * Create farmer under the authenticated owner
 */
exports.createFarmer = async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    const payload = pickAllowed(req.body);
    const farmer = await Farmer.create({ ...payload, ownerId: req.user.id });
    res.status(201).json(farmer);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

/**
 * GET /farmers
 * List farmers for this owner (newest first)
 */
exports.listFarmers = async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    const farmers = await Farmer.find({ ownerId: req.user.id })
      .sort({ createdAt: -1 });
    res.json(farmers);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

/**
 * GET /farmers/:id
 * Read one farmer (owner-scoped)
 */
exports.getFarmer = async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    const farmer = await Farmer.findOne({ _id: req.params.id, ownerId: req.user.id });
    if (!farmer) return res.status(404).json({ error: 'Farmer not found' });
    res.json(farmer);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

/**
 * PUT /farmers/:id
 * Update editable fields (owner-scoped)
 */
exports.updateFarmer = async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    const payload = pickAllowed(req.body);
    const farmer = await Farmer.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.user.id },
      payload,
      { new: true }
    );
    if (!farmer) return res.status(404).json({ error: 'Farmer not found' });
    res.json(farmer);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

/**
 * DELETE /farmers/:id
 * Delete farmer (owner-scoped)
 * If you keep a separate "logs" collection, also delete those here.
 */
exports.deleteFarmer = async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    const farmer = await Farmer.findOneAndDelete({ _id: req.params.id, ownerId: req.user.id });
    if (!farmer) return res.status(404).json({ error: 'Farmer not found' });

    // Example cascade if you later add a separate logs collection:
    // await Log.deleteMany({ ownerId: req.user.id, farmerId: req.params.id });

    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

/**
 * POST /farmers/:id/readings
 * Add a sensor reading to this farmer (owner-scoped)
 */
exports.addReading = async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });

    const farmer = await Farmer.findOne({ _id: req.params.id, ownerId: req.user.id });
    if (!farmer) return res.status(404).json({ error: 'Farmer not found' });

    // Expect payload from ESP32 reader (all optional)
    const {
      n, p, k, ph, moisture, ec, temperature,
      raw, source,
    } = req.body || {};

    // Push newest first
    farmer.readings.unshift({
      n, p, k, ph, moisture, ec, temperature,
      raw,
      source: source || 'esp32',
    });

    await farmer.save();

    res.status(201).json({ ok: true, latest: farmer.readings[0] });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
