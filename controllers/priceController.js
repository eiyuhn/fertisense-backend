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

/**
 * Robust update: read the current doc, convert Map -> plain object,
 * apply patches, then replace the WHOLE "items" map using findOneAndUpdate.
 * This avoids any Mongoose Map dirty-tracking issues.
 */
exports.updateAdminPrices = async (req, res) => {
  try {
    const { currency, items } = req.body || {};
    const doc = await PriceSettings.ensureSeeded();

    // Convert Map -> plain object for safe merging
    const itemsObj = Object.fromEntries(doc.items?.entries?.() || doc.items || []);

    if (items && typeof items === 'object') {
      for (const [code, patch] of Object.entries(items)) {
        const current =
          itemsObj[code] || {
            label: code,
            pricePerBag: 0,
            bagKg: 50,
            npk: { N: 0, P: 0, K: 0 },
            active: true,
          };

        itemsObj[code] = {
          ...current,
          ...patch,
          // Force numeric coercion where relevant
          pricePerBag:
            patch && patch.pricePerBag != null ? Number(patch.pricePerBag) : current.pricePerBag,
          bagKg: patch && patch.bagKg != null ? Number(patch.bagKg) : current.bagKg,
          npk: {
            ...(current.npk || {}),
            ...((patch && patch.npk) || {}),
          },
          active:
            patch && Object.prototype.hasOwnProperty.call(patch, 'active')
              ? Boolean(patch.active)
              : current.active,
          label:
            patch && Object.prototype.hasOwnProperty.call(patch, 'label')
              ? String(patch.label)
              : current.label,
        };
      }
    }

    const setOps = { items: itemsObj };
    if (currency) setOps.currency = String(currency);

    const updated = await PriceSettings.findOneAndUpdate(
      { key: 'current' },
      { $set: setOps },
      { new: true, upsert: true, runValidators: true }
    );

    return res.json(sanitize(updated));
  } catch (err) {
    console.error('[prices] updateAdminPrices error:', err);
    return res.status(500).json({ error: 'Failed to update prices' });
  }
};

// Optional helper
exports.getLatestPrices = async () => {
  const doc = await PriceSettings.ensureSeeded();
  return sanitize(doc);
};
