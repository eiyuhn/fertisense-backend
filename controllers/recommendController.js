// controllers/recommendController.js
const PriceSettings = require('../models/PriceSettings');

function money(x) { return Math.round(x * 100) / 100; }
function subtotalBags(bags, pricePerBag) { return money((bags || 0) * (pricePerBag || 0)); }

// Keys must match PriceSettings.items keys
const LGU_PLANS = {
  plan1: { DAP_18_46_0: 2.33, MOP_0_0_60: 3.45, UREA_46_0_0: 2.23 },
  plan2: { COMPLETE_14_14_14: 10.0, UREA_46_0_0: 4.52 },
  plan3: { UREA_46_0_0: 4.52, MOP_0_0_60: 2.33, DAP_18_46_0: 1.0 },
};

exports.recommend = async (req, res) => {
  try {
    const { n = 0, p = 0, k = 0, ph, season, riceType, soilType } = req.body || {};
    const priceDoc = await PriceSettings.ensureSeeded();
    const items = Object.fromEntries(priceDoc.items.entries());

    const englishText =
      p < 10 ? 'The soil is low in Phosphorus. Apply a P-rich fertilizer (e.g., DAP or SSP).'
             : 'Nutrients are in moderate range. Follow the recommended plan.';
    const tagalogText =
      p < 10 ? 'Mababa ang Phosphorus ng lupa. Mag-apply ng abono na may mataas na P (hal. DAP o SSP).'
             : 'Katamtaman ang antas ng sustansya. Sundin ang rekomendadong plano.';

    const plans = Object.entries(LGU_PLANS).map(([code, mix], idx) => {
      const rows = Object.entries(mix).map(([priceKey, bags]) => {
        const item = items[priceKey];
        const label = item?.label || priceKey;
        const pricePerBag = item?.pricePerBag || 0;
        return {
          key: priceKey,
          label,
          bags,
          pricePerBag,
          subtotal: subtotalBags(bags, pricePerBag),
        };
      });
      const total = money(rows.reduce((a, r) => a + r.subtotal, 0));
      return {
        code,
        title: `Plan ${idx + 1}`,
        rows,
        total,
        currency: priceDoc.currency || 'PHP',
      };
    });

    const cheapest = plans.reduce((a, b) => (a.total <= b.total ? a : b), plans[0]);

    res.json({
      ok: true,
      input: { n, p, k, ph, season, riceType, soilType },
      narrative: { en: englishText, tl: tagalogText },
      plans,
      cheapest: { code: cheapest.code, total: cheapest.total, currency: cheapest.currency },
      updatedAt: priceDoc.updatedAt,
    });
  } catch (e) {
    console.error('[recommend] error:', e);
    res.status(500).json({ error: 'Failed to build recommendation' });
  }
};
