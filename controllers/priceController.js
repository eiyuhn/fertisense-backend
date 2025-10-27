// controllers/priceController.js
const PriceSettings = require('../models/PriceSettings');

/**
 * PUBLIC
 * GET /api/prices
 * Anyone can read the current prices (guest/stakeholder/admin).
 */
exports.getPublicPrices = async (_req, res) => {
  try {
    const doc = await PriceSettings.ensureSeeded();

    // Flatten Map -> plain object for clients
    const out = {
      currency: doc.currency,
      items: Object.fromEntries([...doc.items.entries()].map(([key, v]) => [key, v])),
      updatedAt: doc.updatedAt,
    };

    res.json(out);
  } catch (e) {
    console.error('[getPublicPrices]', e);
    res.status(500).json({ error: 'Failed to load prices' });
  }
};

/**
 * ADMIN
 * GET /api/prices/admin
 * Returns the canonical document (Map preserved by Mongoose).
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
 * Replaces the whole price map with the sent payload (add/edit/remove).
 * Body shape:
 * {
 *   currency: "PHP",
 *   items: {
 *     UREA_46_0_0: { label, pricePerBag, bagKg, npk: {N,P,K}, active },
 *     NEW_CODE: { ... },
 *     ...
 *   }
 * }
 */
exports.updateAdminPrices = async (req, res) => {
  try {
    const { items, currency } = req.body || {};
    const doc = await PriceSettings.ensureSeeded();

    if (currency) {
      doc.currency = String(currency).toUpperCase();
    }

    if (items && typeof items === 'object') {
      // Build a brand-new Map to allow deletions
      const nextMap = new Map();

      // Sanitize & coerce each entry
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

    // Return the full, updated document so the client can refresh immediately
    res.json(doc);
  } catch (e) {
    console.error('[updateAdminPrices]', e);
    res.status(500).json({ error: 'Failed to update prices' });
  }
};
