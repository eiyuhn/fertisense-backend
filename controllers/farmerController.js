const Farmer = require('../models/Farmer');

function sanitize(f) {
  return {
    id: f._id,
    ownerId: f.ownerId,
    name: f.name,
    address: f.address,
    farmLocation: f.farmLocation,
    mobile: f.mobile,
    cropType: f.cropType,
    cropStyle: f.cropStyle,
    landAreaHa: f.landAreaHa,
    code: f.code,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

// POST /api/farmers
exports.create = async (req, res) => {
  try {
    const {
      name,
      address = '',
      farmLocation = '',
      mobile = '',
      cropType = '',
      cropStyle = '',
      landAreaHa = 0,
      code = '',
    } = req.body || {};

    if (!name) return res.status(400).json({ error: 'Name is required' });

    const f = await Farmer.create({
      ownerId: req.user.id,
      name,
      address,
      farmLocation,
      mobile,
      cropType,
      cropStyle,
      landAreaHa,
      code,
    });

    res.status(201).json(sanitize(f));
  } catch (err) {
    console.error('Create farmer error:', err);
    res.status(500).json({ error: 'Failed to create farmer: ' + err.message });
  }
};

// GET /api/farmers
exports.list = async (req, res) => {
  const items = await Farmer.find({ ownerId: req.user.id }).sort({ createdAt: -1 });
  res.json(items.map(sanitize));
};

// GET /api/farmers/:id
exports.get = async (req, res) => {
  const f = await Farmer.findOne({ _id: req.params.id, ownerId: req.user.id });
  if (!f) return res.status(404).json({ error: 'Not found' });
  res.json(sanitize(f));
};

// PUT /api/farmers/:id
exports.update = async (req, res) => {
  const patch = {};
  ['name','address','farmLocation','mobile','cropType','cropStyle','landAreaHa','code'].forEach(k => {
    if (k in req.body) patch[k] = req.body[k];
  });

  const f = await Farmer.findOneAndUpdate(
    { _id: req.params.id, ownerId: req.user.id },
    { $set: patch },
    { new: true }
  );
  if (!f) return res.status(404).json({ error: 'Not found' });
  res.json(sanitize(f));
};

// DELETE /api/farmers/:id
exports.remove = async (req, res) => {
  const f = await Farmer.findOneAndDelete({ _id: req.params.id, ownerId: req.user.id });
  if (!f) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
};
