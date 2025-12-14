// controllers/priceController.js
const PriceSettings = require('../models/PriceSettings');

/**
 * PUBLIC
 * GET /api/prices
 * Anyone can read prices (flatten Map -> plain object)
 */
exports.getPublicPrices = async (_req, res) => {
  try {
    const doc = await PriceSettings.ensureSeeded();

    const itemsObj =
      doc.items instanceof Map
        ? Object.fromEntries([...doc.items.entries()].map(([k, v]) => [k, v]))
        : (doc.items || {});

    res.json({
      currency: doc.currency,
      items: itemsObj,
      updatedAt: doc.updatedAt,
    });
  } catch (e) {
    console.error('[getPublicPrices]', e);
    res.status(500).json({ error: 'Failed to load prices' });
  }
};

/**
 * AUTH
 * GET /api/prices/admin
 * Return canonical doc (Mongoose Map preserved)
 */
exports.getAdminPrices = async (_req, res) => {
  try {
    const doc = await PriceSettings.ensureSeeded();
    res.json(doc);
  } catch (e) {
    console.error('[getAdminPrices]', e);
    res.status(500).json({ error: 'Failed to load admin prices' });
  }
};

/**
 * ADMIN
 * PUT /api/prices/admin
 */
exports.updateAdminPrices = async (req, res) => {
  try {
    const { items, currency } = req.body || {};
    const doc = await PriceSettings.ensureSeeded();

    if (currency) doc.currency = String(currency).toUpperCase();

    if (items && typeof items === 'object') {
      const nextMap = new Map();

      for (const [rawCode, rawVal] of Object.entries(items)) {
        if (!rawVal) continue;

        const code = String(rawCode).replace(/\s+/g, '_').toUpperCase();

        const label = String(rawVal.label || code);
        const pricePerBag = Number(rawVal.pricePerBag || 0);
        const bagKg = Number(rawVal.bagKg || 50);

        const npk = {
          N: Number(rawVal.npk?.N || 0),
          P: Number(rawVal.npk?.P || 0),
          K: Number(rawVal.npk?.K || 0),
        };

        const active = rawVal.active !== false;

        nextMap.set(code, { label, pricePerBag, bagKg, npk, active });
      }

      doc.items = nextMap;
    }

    await doc.save();
    res.json(doc);
  } catch (e) {
    console.error('[updateAdminPrices]', e);
    res.status(500).json({ error: 'Failed to update prices' });
  }
};
