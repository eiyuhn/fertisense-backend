// fertisense-backend/controllers/priceController.js
const PriceSettings = require('../models/PriceSettings');

function sanitize(doc) {
  return {
    id: doc._id.toString(),
    currency: doc.currency,
    items: Object.fromEntries(
      Array.from(doc.items?.entries?.() || doc.items || []).map(([code, v]) => [
        code,
        {
          label: v.label,
          pricePerBag: v.pricePerBag,
          bagKg: v.bagKg,
          npk: v.npk,
          active: v.active,
        },
      ])
    ),
    updatedAt: doc.updatedAt,
  };
}

exports.getPublicPrices = async (_req, res) => {
  try {
    const doc = await PriceSettings.ensureSeeded();
    return res.json(sanitize(doc));
  } catch (err) {
    console.error('[prices] getPublicPrices error:', err);
    return res.status(500).json({ error: 'Failed to load prices' });
  }
};

exports.getAdminPrices = async (_req, res) => {
  try {
    const doc = await PriceSettings.ensureSeeded();
    return res.json(sanitize(doc));
  } catch (err) {
    console.error('[prices] getAdminPrices error:', err);
    return res.status(500).json({ error: 'Failed to load admin prices' });
  }
};

exports.updateAdminPrices = async (req, res) => {
  try {
    const { currency, items } = req.body || {};
    const doc = await PriceSettings.ensureSeeded();

    if (currency) doc.currency = currency;

    if (items && typeof items === 'object') {
      for (const [code, patch] of Object.entries(items)) {
        const current = doc.items.get(code) || {
          label: code,
          pricePerBag: 0,
          bagKg: 50,
          npk: { N: 0, P: 0, K: 0 },
          active: true,
        };
        doc.items.set(code, {
          ...current,
          ...patch,
          npk: { ...(current.npk || {}), ...(patch.npk || {}) },
        });
      }
    }

    await doc.save();
    return res.json(sanitize(doc));
  } catch (err) {
    console.error('[prices] updateAdminPrices error:', err);
    return res.status(500).json({ error: 'Failed to update prices' });
  }
};

exports.getLatestPrices = async () => {
  const doc = await PriceSettings.ensureSeeded();
  return sanitize(doc);
};
