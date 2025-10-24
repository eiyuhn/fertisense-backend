// controllers/priceController.js
const PriceSettings = require('../models/PriceSettings');

exports.getPublicPrices = async (req, res) => {
  try {
    const doc = await PriceSettings.ensureSeeded();
    const out = {
      currency: doc.currency,
      items: Object.fromEntries([...doc.items.entries()].map(([key, v]) => [key, v])),
      updatedAt: doc.updatedAt,
    };
    res.json(out);
  } catch (e) {
    console.error('[getPublicPrices] ', e);
    res.status(500).json({ error: 'Failed to load prices' });
  }
};

exports.getAdminPrices = async (req, res) => {
  try {
    const doc = await PriceSettings.ensureSeeded();
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load admin prices' });
  }
};

exports.updateAdminPrices = async (req, res) => {
  try {
    const { items, currency } = req.body || {};
    const doc = await PriceSettings.ensureSeeded();
    if (currency) doc.currency = String(currency);

    if (items && typeof items === 'object') {
      for (const [k, v] of Object.entries(items)) {
        doc.items.set(k, v);
      }
    }
    await doc.save();
    res.json({ ok: true });
  } catch (e) {
    console.error('[updateAdminPrices] ', e);
    res.status(500).json({ error: 'Failed to update prices' });
  }
};
