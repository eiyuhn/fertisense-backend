const PriceSettings = require('../models/PriceSettings');
const LMH_TABLE = require('../utils/lmhTable');

// ---------- helpers ----------
const calcScheduleCost = (schedule, priceDoc) => {
  const rows = [];
  let total = 0;

  const add = (phase, arr = []) => {
    for (const x of arr) {
      const item = priceDoc.items.get(x.code.replace(/-/g, '_'));
      if (!item) continue;

      const subtotal = x.bags * item.pricePerBag;
      total += subtotal;

      rows.push({
        phase,
        code: x.code,
        bags: x.bags,
        pricePerBag: item.pricePerBag,
        subtotal,
      });
    }
  };

  add('BASAL', schedule.basal);
  add('30 DAT', schedule.after30DAT);
  add('TOPDRESS', schedule.topdress60DBH);

  return { currency: priceDoc.currency, rows, total };
};

// ---------- alternative schedules ----------
const PLAN_LIBRARY = {
  DAP_MOP_AMMOSUL: () => ({
    basal: [
      { code: '18-46-0', bags: 2.5 },
      { code: '0-0-60', bags: 2 },
    ],
    after30DAT: [{ code: '21-0-0', bags: 2 }],
    topdress60DBH: [{ code: '21-0-0', bags: 2 }],
  }),

  DAP_MOP_UREA: () => ({
    basal: [
      { code: '18-46-0', bags: 2.5 },
      { code: '0-0-60', bags: 2 },
    ],
    after30DAT: [{ code: '46-0-0', bags: 2 }],
    topdress60DBH: [{ code: '46-0-0', bags: 2 }],
  }),

  COMPLETE_UREA: () => ({
    basal: [{ code: '14-14-14', bags: 4 }],
    after30DAT: [{ code: '46-0-0', bags: 2 }],
    topdress60DBH: [{ code: '46-0-0', bags: 2 }],
  }),

  '16_20_0_MOP_UREA': () => ({
    basal: [
      { code: '16-20-0', bags: 3 },
      { code: '0-0-60', bags: 2 },
    ],
    after30DAT: [{ code: '46-0-0', bags: 2 }],
    topdress60DBH: [{ code: '46-0-0', bags: 2 }],
  }),
};

// ---------- controller ----------
exports.recommend = async (req, res) => {
  try {
    const { nClass, pClass, kClass, areaHa = 1 } = req.body;

    const N = nClass || 'L';
    const P = pClass || 'L';
    const K = kClass || 'L';
    const npkClass = `${N}${P}${K}`;

    const priceDoc = await PriceSettings.ensureSeeded();

    // --- DA PLAN (unchanged logic) ---
    const daSchedule = {
      basal: [
        { code: '0-0-60', bags: 2 },
        { code: '18-46-0', bags: 2.5 },
      ],
      after30DAT: [{ code: '46-0-0', bags: 2 }],
      topdress60DBH: [{ code: '46-0-0', bags: 2 }],
    };

    const daCost = calcScheduleCost(daSchedule, priceDoc);

    const daPlan = {
      id: 'DA_RULE',
      title: 'Fertilizer Plan',
      label: 'DA Recommendation',
      isDa: true,
      isCheapest: false,
      schedule: daSchedule,
      cost: daCost,
    };

    // --- ALTERNATIVES ---
    const rule = LMH_TABLE[npkClass];
    const alt1Schedule = PLAN_LIBRARY[rule.alt1]();
    const alt2Schedule = PLAN_LIBRARY[rule.alt2]();

    const alt1 = {
      id: 'ALT_1',
      title: 'Fertilizer Plan',
      label: 'Alternative Plan 1',
      isDa: false,
      isCheapest: false,
      schedule: alt1Schedule,
      cost: calcScheduleCost(alt1Schedule, priceDoc),
    };

    const alt2 = {
      id: 'ALT_2',
      title: 'Fertilizer Plan',
      label: 'Alternative Plan 2',
      isDa: false,
      isCheapest: false,
      schedule: alt2Schedule,
      cost: calcScheduleCost(alt2Schedule, priceDoc),
    };

    const plans = [daPlan, alt1, alt2];

    // --- sort cheapest ---
    plans.sort((a, b) => a.cost.total - b.cost.total);
    plans[0].isCheapest = true;

    res.json({
      ok: true,
      crop: 'rice_hybrid',
      classified: { N, P, K, npkClass },
      input: { areaHa },
      nutrientRequirementKgHa: { N: 120, P: 60, K: 60 },
      plans,
      note: 'Returned 3 fertilizer plans (DA + 2 alternatives), sorted cheapest-first.',
    });
  } catch (err) {
    console.error('[recommend]', err);
    res.status(500).json({ ok: false, error: 'Recommendation failed' });
  }
};
