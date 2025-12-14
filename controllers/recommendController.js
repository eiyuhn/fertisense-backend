// controllers/recommendController.js
const PriceSettings = require('../models/PriceSettings');
const LMH_TABLE = require('../utils/lmhTable');

// ---------- helpers ----------

// ✅ parse NPK from: "46-0-0", "46 – 0 – 0", "UREA_46_0_0", "NPK_14_14_14"
function parseTripleAny(text) {
  const s = String(text || '').toUpperCase();

  // dash style
  let m = s.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s*[-–]\s*(\d{1,2})/);
  if (m) return { N: Number(m[1]), P: Number(m[2]), K: Number(m[3]) };

  // underscore style
  m = s.match(/(\d{1,2})_(\d{1,2})_(\d{1,2})/);
  if (m) return { N: Number(m[1]), P: Number(m[2]), K: Number(m[3]) };

  return null;
}

// dash-code -> canonical key in PriceSettings.items
function canonicalKeyFromDashCode(code) {
  const npk = parseTripleAny(code);
  if (!npk) return null;

  const { N, P, K } = npk;

  if (N === 46 && P === 0 && K === 0) return 'UREA_46_0_0';
  if (N === 18 && P === 46 && K === 0) return 'DAP_18_46_0';
  if (N === 0 && P === 0 && K === 60) return 'MOP_0_0_60';
  if (N === 21 && P === 0 && K === 0) return 'AMMOSUL_21_0_0';
  if (N === 16 && P === 20 && K === 0) return 'NPK_16_20_0';
  if (N === 14 && P === 14 && K === 14) return 'NPK_14_14_14';

  return `NPK_${N}_${P}_${K}`;
}

// ✅ robust resolver for any input code
function resolvePriceItem(priceDoc, code) {
  if (!priceDoc?.items) return null;

  const items = priceDoc.items; // Map
  const raw = String(code || '');

  // 1) exact key
  if (items.get(raw)) return { key: raw, item: items.get(raw) };

  // 2) dash code -> canonical key
  const canon = canonicalKeyFromDashCode(raw);
  if (canon && items.get(canon)) return { key: canon, item: items.get(canon) };

  // 3) underscore variant of whatever user passed
  const unders = raw.replace(/[-–]/g, '_').replace(/\s+/g, '_').toUpperCase();
  if (items.get(unders)) return { key: unders, item: items.get(unders) };

  // 4) match by label containing the same dash code (e.g., "Urea (46-0-0)")
  //    OR match by npk stored in item.npk
  const want = parseTripleAny(raw);

  for (const [k, v] of items.entries()) {
    if (!v) continue;

    const label = String(v.label || '');

    // label contains raw code
    if (label.includes(raw)) return { key: k, item: v };

    // label has triple matching
    const labelNpk = parseTripleAny(label);
    if (
      want &&
      labelNpk &&
      labelNpk.N === want.N &&
      labelNpk.P === want.P &&
      labelNpk.K === want.K
    ) {
      return { key: k, item: v };
    }

    // stored npk matches
    const npk = v.npk || {};
    if (
      want &&
      Number(npk.N) === want.N &&
      Number(npk.P) === want.P &&
      Number(npk.K) === want.K
    ) {
      return { key: k, item: v };
    }
  }

  return null;
}

// ✅ cost calc: NEVER treat missing as 0; subtotal=null if missing, total sums ONLY priced items
function calcScheduleCost(schedule, priceDoc, areaHa = 1) {
  const rows = [];
  let total = 0;

  const add = (phase, arr = []) => {
    for (const x of arr) {
      const bags = Number(x?.bags || 0) * Number(areaHa || 1);
      const code = String(x?.code || '');

      const resolved = resolvePriceItem(priceDoc, code);
      const item = resolved?.item || null;

      const pricePerBag = item ? Number(item.pricePerBag || 0) : null;
      const subtotal = pricePerBag == null ? null : bags * pricePerBag;

      // ✅ only add if we really have a price
      if (subtotal != null) total += subtotal;

      rows.push({
        phase,
        code,
        key: resolved?.key || null,
        label: item?.label || code,
        bags,
        pricePerBag,
        subtotal,
      });
    }
  };

  add('BASAL', schedule.basal);
  add('30 DAT', schedule.after30DAT);
  add('TOPDRESS', schedule.topdress60DBH);

  return { currency: priceDoc.currency, rows, total };
}

// cheapest-sort helper: avoid tagging "missing prices" as cheapest
function hasMissingPrices(cost) {
  return (cost?.rows || []).some((r) => r.pricePerBag == null);
}

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

// ✅ DA 27-combo schedule table (Rice Hybrid) — matches your earlier table
const DA_SCHEDULE_TABLE = {
  // N = LOW
  LLL: { basal: [{ code: '0-0-60', bags: 2.0 }, { code: '18-46-0', bags: 2.5 }], after30DAT: [{ code: '46-0-0', bags: 2.0 }], topdress60DBH: [{ code: '46-0-0', bags: 2.0 }] },
  LLM: { basal: [{ code: '0-0-60', bags: 1.5 }, { code: '18-46-0', bags: 2.5 }], after30DAT: [{ code: '46-0-0', bags: 2.0 }], topdress60DBH: [{ code: '46-0-0', bags: 2.0 }] },
  LLH: { basal: [{ code: '0-0-60', bags: 1.0 }, { code: '18-46-0', bags: 2.5 }], after30DAT: [{ code: '46-0-0', bags: 2.0 }], topdress60DBH: [{ code: '46-0-0', bags: 2.0 }] },

  LML: { basal: [{ code: '0-0-60', bags: 2.0 }, { code: '18-46-0', bags: 2.0 }], after30DAT: [{ code: '46-0-0', bags: 2.0 }], topdress60DBH: [{ code: '46-0-0', bags: 2.0 }] },
  LMM: { basal: [{ code: '0-0-60', bags: 1.5 }, { code: '18-46-0', bags: 2.0 }], after30DAT: [{ code: '46-0-0', bags: 2.0 }], topdress60DBH: [{ code: '46-0-0', bags: 2.0 }] },
  LMH: { basal: [{ code: '0-0-60', bags: 1.0 }, { code: '18-46-0', bags: 2.0 }], after30DAT: [{ code: '46-0-0', bags: 2.0 }], topdress60DBH: [{ code: '46-0-0', bags: 2.0 }] },

  LHL: { basal: [{ code: '0-0-60', bags: 2.0 }, { code: '16-20-0', bags: 2.0 }], after30DAT: [{ code: '46-0-0', bags: 2.0 }], topdress60DBH: [{ code: '46-0-0', bags: 2.0 }] },
  LHM: { basal: [{ code: '0-0-60', bags: 1.5 }, { code: '16-20-0', bags: 2.0 }], after30DAT: [{ code: '46-0-0', bags: 2.0 }], topdress60DBH: [{ code: '46-0-0', bags: 2.0 }] },
  LHH: { basal: [{ code: '0-0-60', bags: 1.0 }, { code: '16-20-0', bags: 2.0 }], after30DAT: [{ code: '46-0-0', bags: 2.0 }], topdress60DBH: [{ code: '46-0-0', bags: 2.0 }] },

  // N = MEDIUM
  MLL: { basal: [{ code: '0-0-60', bags: 2.0 }, { code: '18-46-0', bags: 2.5 }], after30DAT: [{ code: '46-0-0', bags: 1.5 }], topdress60DBH: [{ code: '46-0-0', bags: 1.5 }] },
  MLM: { basal: [{ code: '0-0-60', bags: 1.5 }, { code: '18-46-0', bags: 2.5 }], after30DAT: [{ code: '46-0-0', bags: 1.5 }], topdress60DBH: [{ code: '46-0-0', bags: 1.5 }] },
  MLH: { basal: [{ code: '0-0-60', bags: 1.0 }, { code: '18-46-0', bags: 2.5 }], after30DAT: [{ code: '46-0-0', bags: 1.5 }], topdress60DBH: [{ code: '46-0-0', bags: 1.5 }] },

  MML: { basal: [{ code: '0-0-60', bags: 2.0 }, { code: '18-46-0', bags: 2.0 }], after30DAT: [{ code: '46-0-0', bags: 1.5 }], topdress60DBH: [{ code: '46-0-0', bags: 1.5 }] },
  MMM: { basal: [{ code: '0-0-60', bags: 1.5 }, { code: '18-46-0', bags: 2.0 }], after30DAT: [{ code: '46-0-0', bags: 1.5 }], topdress60DBH: [{ code: '46-0-0', bags: 1.5 }] },
  MMH: { basal: [{ code: '0-0-60', bags: 1.0 }, { code: '18-46-0', bags: 2.0 }], after30DAT: [{ code: '46-0-0', bags: 1.5 }], topdress60DBH: [{ code: '46-0-0', bags: 1.5 }] },

  MHL: { basal: [{ code: '0-0-60', bags: 2.0 }, { code: '16-20-0', bags: 2.0 }], after30DAT: [{ code: '46-0-0', bags: 1.5 }], topdress60DBH: [{ code: '46-0-0', bags: 1.5 }] },
  MHM: { basal: [{ code: '0-0-60', bags: 1.5 }, { code: '16-20-0', bags: 2.0 }], after30DAT: [{ code: '46-0-0', bags: 1.5 }], topdress60DBH: [{ code: '46-0-0', bags: 1.5 }] },
  MHH: { basal: [{ code: '0-0-60', bags: 1.0 }, { code: '16-20-0', bags: 2.0 }], after30DAT: [{ code: '46-0-0', bags: 1.5 }], topdress60DBH: [{ code: '46-0-0', bags: 1.5 }] },

  // N = HIGH
  HLL: { basal: [{ code: '0-0-60', bags: 2.0 }, { code: '18-46-0', bags: 2.5 }], after30DAT: [{ code: '46-0-0', bags: 1.0 }], topdress60DBH: [{ code: '46-0-0', bags: 1.0 }] },
  HLM: { basal: [{ code: '0-0-60', bags: 1.5 }, { code: '18-46-0', bags: 2.5 }], after30DAT: [{ code: '46-0-0', bags: 1.0 }], topdress60DBH: [{ code: '46-0-0', bags: 1.0 }] },
  HLH: { basal: [{ code: '0-0-60', bags: 1.0 }, { code: '18-46-0', bags: 2.5 }], after30DAT: [{ code: '46-0-0', bags: 1.0 }], topdress60DBH: [{ code: '46-0-0', bags: 1.0 }] },

  HML: { basal: [{ code: '0-0-60', bags: 2.0 }, { code: '18-46-0', bags: 2.0 }], after30DAT: [{ code: '46-0-0', bags: 1.0 }], topdress60DBH: [{ code: '46-0-0', bags: 1.0 }] },
  HMM: { basal: [{ code: '0-0-60', bags: 1.5 }, { code: '18-46-0', bags: 2.0 }], after30DAT: [{ code: '46-0-0', bags: 1.0 }], topdress60DBH: [{ code: '46-0-0', bags: 1.0 }] },
  HMH: { basal: [{ code: '0-0-60', bags: 1.0 }, { code: '18-46-0', bags: 2.0 }], after30DAT: [{ code: '46-0-0', bags: 1.0 }], topdress60DBH: [{ code: '46-0-0', bags: 1.0 }] },

  HHL: { basal: [{ code: '0-0-60', bags: 2.0 }, { code: '16-20-0', bags: 2.0 }], after30DAT: [{ code: '46-0-0', bags: 1.0 }], topdress60DBH: [{ code: '46-0-0', bags: 1.0 }] },
  HHM: { basal: [{ code: '0-0-60', bags: 1.5 }, { code: '16-20-0', bags: 2.0 }], after30DAT: [{ code: '46-0-0', bags: 1.0 }], topdress60DBH: [{ code: '46-0-0', bags: 1.0 }] },
  HHH: { basal: [{ code: '0-0-60', bags: 1.0 }, { code: '16-20-0', bags: 2.0 }], after30DAT: [{ code: '46-0-0', bags: 1.0 }], topdress60DBH: [{ code: '46-0-0', bags: 1.0 }] },
};

// ---------- controller ----------
exports.recommend = async (req, res) => {
  try {
    const { nClass, pClass, kClass, areaHa = 1 } = req.body || {};

    // ✅ IMPORTANT: normalize to "L/M/H" no matter what app sends
    const N = String(nClass || 'L').trim().toUpperCase()[0] || 'L';
    const P = String(pClass || 'L').trim().toUpperCase()[0] || 'L';
    const K = String(kClass || 'L').trim().toUpperCase()[0] || 'L';
    const npkClass = `${N}${P}${K}`;

    const priceDoc = await PriceSettings.ensureSeeded();

    // --- DA PLAN (depends on class) ---
    const daSchedule = DA_SCHEDULE_TABLE[npkClass] || DA_SCHEDULE_TABLE.LLL;

    const daPlan = {
      id: 'DA_RULE',
      title: 'Fertilizer Plan',
      label: 'DA Recommendation',
      isDa: true,
      isCheapest: false,
      schedule: daSchedule,
      cost: calcScheduleCost(daSchedule, priceDoc, areaHa),
    };

    // --- ALTERNATIVES (from LMH table) ---
    const rule = LMH_TABLE[npkClass] || null;

    const alt1Schedule =
      rule?.alt1 && PLAN_LIBRARY[rule.alt1]
        ? PLAN_LIBRARY[rule.alt1]()
        : PLAN_LIBRARY.DAP_MOP_UREA();

    const alt2Schedule =
      rule?.alt2 && PLAN_LIBRARY[rule.alt2]
        ? PLAN_LIBRARY[rule.alt2]()
        : PLAN_LIBRARY.DAP_MOP_AMMOSUL();

    const alt1 = {
      id: 'ALT_1',
      title: 'Fertilizer Plan',
      label: 'Alternative Plan 1',
      isDa: false,
      isCheapest: false,
      schedule: alt1Schedule,
      cost: calcScheduleCost(alt1Schedule, priceDoc, areaHa),
    };

    const alt2 = {
      id: 'ALT_2',
      title: 'Fertilizer Plan',
      label: 'Alternative Plan 2',
      isDa: false,
      isCheapest: false,
      schedule: alt2Schedule,
      cost: calcScheduleCost(alt2Schedule, priceDoc, areaHa),
    };

    const plans = [daPlan, alt1, alt2];

    // ✅ best cheapest sort: "missing prices" go last
    plans.sort((a, b) => {
      const am = hasMissingPrices(a.cost);
      const bm = hasMissingPrices(b.cost);
      if (am !== bm) return am ? 1 : -1;
      return Number(a?.cost?.total ?? Number.POSITIVE_INFINITY) - Number(b?.cost?.total ?? Number.POSITIVE_INFINITY);
    });

    plans.forEach((p) => (p.isCheapest = false));
    if (plans.length) plans[0].isCheapest = true;

    res.json({
      ok: true,
      crop: 'rice_hybrid',
      classified: { N, P, K, npkClass },
      input: { areaHa: Number(areaHa || 1) },
      nutrientRequirementKgHa: { N: 120, P: 60, K: 60 },
      plans,
      note: 'Returned 3 fertilizer plans (DA + 2 alternatives), sorted cheapest-first.',
    });
  } catch (err) {
    console.error('[recommend]', err);
    res.status(500).json({ ok: false, error: 'Recommendation failed' });
  }
};
