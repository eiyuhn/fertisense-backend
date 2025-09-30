// fertisense-backend/controllers/priceController.js
const PriceSetting = require('../models/PriceSettings');

function sanitize(doc) {
  return {
    id: doc._id.toString(),
    currency: doc.currency,
    items: Object.fromEntries(
      Object.entries(doc.items || {}).map(([code, v]) => [
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
  const doc =
    (await PriceSetting.findOne({ key: 'current' })) ||
    (await PriceSetting.create({ key: 'current' }));
  return res.json(sanitize(doc));
};

exports.getAdminPrices = async (_req, res) => {
  const doc =
    (await PriceSetting.findOne({ key: 'current' })) ||
    (await PriceSetting.create({ key: 'current' }));
  return res.json(sanitize(doc));
};

exports.updateAdminPrices = async (req, res) => {
  // Expect body: { currency?, items: { CODE: { pricePerBag?, label?, bagKg?, npk?, active? }, ... } }
  const { currency, items } = req.body || {};
  let doc =
    (await PriceSetting.findOne({ key: 'current' })) ||
    (await PriceSetting.create({ key: 'current' }));

  if (currency) doc.currency = currency;

  if (items && typeof items === 'object') {
    // Merge fields per item (partial updates allowed)
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
};

// Helper for other controllers (e.g., recommendation)
exports.getLatestPrices = async () => {
  const doc =
    (await PriceSetting.findOne({ key: 'current' })) ||
    (await PriceSetting.create({ key: 'current' }));
  return sanitize(doc);
};
