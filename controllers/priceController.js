// fertisense-backend/controllers/priceController.js
const PriceSettings = require('../models/PriceSettings');

/* Toggle verbose troubleshoot logs here. Keep false for quiet. */
const DEBUG = false;

function dlog(...args) {
  if (DEBUG) console.log('[prices]', ...args);
}

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

/**
 * Accepts payload like:
 * {
 *   "currency": "PHP",
 *   "items": {
 *     "COMPLETE_14_14_14": { "pricePerBag": 1999 }
 *     // OR "price": 1999  (alias)
 *     // OR "value": 1999  (alias)
 *   }
 * }
 */
exports.updateAdminPrices = async (req, res) => {
  try {
    const { currency, items } = req.body || {};
    await PriceSettings.ensureSeeded();

    const setOps = {};

    if (currency) setOps['currency'] = String(currency);

    if (items && typeof items === 'object') {
      for (const [code, patch] of Object.entries(items)) {
        const base = `items.${code}`;

        // Always ensure basic fields exist for this code
        setOps[`${base}.label`] = String(patch?.label ?? code);
        setOps[`${base}.bagKg`] = Number(
          (patch && patch.bagKg != null ? patch.bagKg : 50)
        );
        setOps[`${base}.active`] = Boolean(
          (patch && Object.prototype.hasOwnProperty.call(patch, 'active') ? patch.active : true)
        );

        // Accept pricePerBag OR price OR value
        const rawPrice =
          patch && patch.pricePerBag != null
            ? patch.pricePerBag
            : patch && patch.price != null
            ? patch.price
            : patch && patch.value != null
            ? patch.value
            : undefined;

        if (rawPrice != null) {
          setOps[`${base}.pricePerBag`] = Number(rawPrice);
        }

        // NPK nested (optional)
        if (patch && patch.npk && typeof patch.npk === 'object') {
          if (Object.prototype.hasOwnProperty.call(patch.npk, 'N'))
            setOps[`${base}.npk.N`] = Number(patch.npk.N);
          if (Object.prototype.hasOwnProperty.call(patch.npk, 'P'))
            setOps[`${base}.npk.P`] = Number(patch.npk.P);
          if (Object.prototype.hasOwnProperty.call(patch.npk, 'K'))
            setOps[`${base}.npk.K`] = Number(patch.npk.K);
        } else {
          // keep defaults if creating
          setOps[`${base}.npk.N`] = setOps[`${base}.npk.N`] ?? 0;
          setOps[`${base}.npk.P`] = setOps[`${base}.npk.P`] ?? 0;
          setOps[`${base}.npk.K`] = setOps[`${base}.npk.K`] ?? 0;
        }
      }
    }

    dlog('incoming body:', JSON.stringify(req.body));
    dlog('computed $set:', JSON.stringify(setOps));

    if (Object.keys(setOps).length === 0) {
      const current = await PriceSettings.findOne({ key: 'current' });
      return res.json(sanitize(current));
    }

    await PriceSettings.updateOne({ key: 'current' }, { $set: setOps }, { upsert: true });

    const fresh = await PriceSettings.findOne({ key: 'current' });
    return res.json(sanitize(fresh));
  } catch (err) {
    console.error('[prices] updateAdminPrices error:', err);
    return res.status(500).json({ error: 'Failed to update prices' });
  }
};

// Helper for other controllers
exports.getLatestPrices = async () => {
  const doc = await PriceSettings.ensureSeeded();
  return sanitize(doc);
};
