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
 * Robust: build dot-path $set ops for each item and update atomically.
 * Also logs the incoming body and the computed setOps.
 */
exports.updateAdminPrices = async (req, res) => {
  try {
    // ---- DIAGNOSTIC LOGS ----
    console.log('[prices] incoming body:', JSON.stringify(req.body));

    const { currency, items } = req.body || {};
    await PriceSettings.ensureSeeded();

    const setOps = {};

    if (currency) {
      setOps['currency'] = String(currency);
    }

    if (items && typeof items === 'object') {
      for (const [code, patch] of Object.entries(items)) {
        const base = `items.${code}`;

        // Ensure base fields are created when updating a new code
        // (label defaults to code if not given)
        if (patch && Object.prototype.hasOwnProperty.call(patch, 'label')) {
          setOps[`${base}.label`] = String(patch.label);
        } else {
          setOps[`${base}.label`] = setOps[`${base}.label`] ?? String(code);
        }

        if (patch && Object.prototype.hasOwnProperty.call(patch, 'pricePerBag')) {
          setOps[`${base}.pricePerBag`] = Number(patch.pricePerBag);
        }

        if (patch && Object.prototype.hasOwnProperty.call(patch, 'bagKg')) {
          setOps[`${base}.bagKg`] = Number(patch.bagKg);
        } else {
          // keep a default if creating new
          setOps[`${base}.bagKg`] = setOps[`${base}.bagKg`] ?? 50;
        }

        if (patch && patch.npk && typeof patch.npk === 'object') {
          if (Object.prototype.hasOwnProperty.call(patch.npk, 'N'))
            setOps[`${base}.npk.N`] = Number(patch.npk.N);
          if (Object.prototype.hasOwnProperty.call(patch.npk, 'P'))
            setOps[`${base}.npk.P`] = Number(patch.npk.P);
          if (Object.prototype.hasOwnProperty.call(patch.npk, 'K'))
            setOps[`${base}.npk.K`] = Number(patch.npk.K);
        } else {
          // defaults when creating new
          setOps[`${base}.npk.N`] = setOps[`${base}.npk.N`] ?? 0;
          setOps[`${base}.npk.P`] = setOps[`${base}.npk.P`] ?? 0;
          setOps[`${base}.npk.K`] = setOps[`${base}.npk.K`] ?? 0;
        }

        if (patch && Object.prototype.hasOwnProperty.call(patch, 'active')) {
          setOps[`${base}.active`] = Boolean(patch.active);
        } else {
          setOps[`${base}.active`] = setOps[`${base}.active`] ?? true;
        }
      }
    }

    // ---- DIAGNOSTIC LOGS ----
    console.log('[prices] setOps for $set:', JSON.stringify(setOps));

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

// Optional helper
exports.getLatestPrices = async () => {
  const doc = await PriceSettings.ensureSeeded();
  return sanitize(doc);
};
