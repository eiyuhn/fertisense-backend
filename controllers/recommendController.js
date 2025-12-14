// controllers/recommendController.js
const PriceSettings = require('../models/PriceSettings');
const { classifyN, classifyP, classifyK } = require('../utils/npkThresholds');

/**
 * Nutrient Requirement (kg/ha) for RICE HYBRID (DA-style target)
 * N: L=120, M=90, H=60
 * P: L=60,  M=45, H=20
 * K: L=60,  M=45, H=30
 */
const DA_RICE_HYBRID_REQ = {
  N: { L: 120, M: 90, H: 60 },
  P: { L: 60,  M: 45, H: 20 },
  K: { L: 60,  M: 45, H: 30 },
};

// ================= DA BAG RULES (UNCHANGED) =================

// K via 0-0-60 at basal
function basalBagsForK(kClass) {
  if (kClass === 'H') return 1;
  if (kClass === 'M') return 1.5;
  return 2; // L
}

// P via basal
function basalForP(pClass) {
  if (pClass === 'H') return [{ code: '16-20-0', bags: 2 }];
  if (pClass === 'M') return [{ code: '18-46-0', bags: 2 }];
  return [{ code: '18-46-0', bags: 2.5 }]; // L
}

// N via split urea
function splitUreaForN(nClass) {
  if (nClass === 'L') return { after30DAT: 2, topdress: 2 };
  if (nClass === 'M') return { after30DAT: 1.5, topdress: 1.5 };
  return { after30DAT: 1, topdress: 1 }; // H
}

function toClass(x) {
  const v = String(x || '').trim().toUpperCase();
  return ['L', 'M', 'H'].includes(v) ? v : null;
}

function buildDaRuleSchedule(nClass, pClass, kClass, areaHa = 1) {
  const req = {
    N: DA_RICE_HYBRID_REQ.N[nClass],
    P: DA_RICE_HYBRID_REQ.P[pClass],
    K: DA_RICE_HYBRID_REQ.K[kClass],
  };

  const basal = [
    { code: '0-0-60', bags: basalBagsForK(kClass) * areaHa },
    ...basalForP(pClass).map(x => ({ ...x, bags: x.bags * areaHa })),
  ];

  const split = splitUreaForN(nClass);

  return {
    npkClass: `${nClass}${pClass}${kClass}`,
    nutrientRequirementKgHa: req,
    organic: [], // keep empty
    basal,
    after30DAT: [{ code: '46-0-0', bags: split.after30DAT * areaHa }],
    topdress60DBH: [{ code: '46-0-0', bags: split.topdress * areaHa }],
  };
}

// ================= PRICE MAPPING =================

const PRICE_KEY_BY_CODE = {
  '46-0-0': 'UREA_46_0_0',
  '18-46-0': 'DAP_18_46_0',
  '16-20-0': 'NPK_16_20_0',
  '0-0-60': 'MOP_0_0_60',
  '14-14-14': 'NPK_14_14_14',
  '21-0-0': 'AMMOSUL_21_0_0',
};

function money(x) {
  return Math.round((x || 0) * 100) / 100;
}

function roundBags(x) {
  return Math.round((Number(x || 0) + Number.EPSILON) * 100) / 100;
}

function mapPriceItems(priceDoc) {
  const itemsMap = Object.fromEntries(priceDoc.items.entries());
  function itemFor(code) {
    const key = PRICE_KEY_BY_CODE[code];
    return key ? itemsMap[key] || null : null;
  }
  return { itemFor, currency: priceDoc.currency || 'PHP' };
}

function nutrientKgPerBag(code, priceDoc) {
  const { itemFor } = mapPriceItems(priceDoc);
  const item = itemFor(code);
  if (!item) return null;

  const bagKg = Number(item.bagKg || 50);
  const pctN = Number(item.npk?.N || 0);
  const pctP = Number(item.npk?.P || 0);
  const pctK = Number(item.npk?.K || 0);

  return {
    bagKg,
    N: bagKg * (pctN / 100),
    P: bagKg * (pctP / 100),
    K: bagKg * (pctK / 100),
    pricePerBag: Number(item.pricePerBag || 0),
  };
}

function calcScheduleCost(schedule, priceDoc) {
  const { itemFor, currency } = mapPriceItems(priceDoc);

  const allLines = [
    ...(schedule.basal || []).map(x => ({ phase: 'BASAL', ...x })),
    ...(schedule.after30DAT || []).map(x => ({ phase: '30 DAT', ...x })),
    ...(schedule.topdress60DBH || []).map(x => ({ phase: 'TOPDRESS', ...x })),
  ];

  const rows = allLines.map(line => {
    const item = itemFor(line.code);
    const pricePerBag = item?.pricePerBag ?? null;
    const subtotal = pricePerBag == null ? null : money(pricePerBag * Number(line.bags || 0));
    return {
      phase: line.phase,
      code: String(line.code),
      bags: Number(line.bags || 0),
      pricePerBag,
      subtotal,
    };
  });

  const total = money(rows.reduce((sum, r) => sum + (r.subtotal || 0), 0));
  return { currency, rows, total };
}

// ================= ALT PLAN (2 alternatives) =================
// Goal: meet nutrient requirement with different fertilizer combos.
// We compute basal bags to meet P + K, then fill remaining N using UREA (or other N source).

function buildAltPlan({
  id,
  label,
  areaHa,
  reqKgHa,     // per ha: {N,P,K}
  pSourceCode, // '18-46-0' or '16-20-0'
  kSourceCode, // '0-0-60'
  nSourceCode, // '46-0-0'
  priceDoc,
}) {
  // If price config missing, return a “fallback” plan (still 3 plans show)
  const pPerBag = nutrientKgPerBag(pSourceCode, priceDoc);
  const kPerBag = nutrientKgPerBag(kSourceCode, priceDoc);
  const nPerBag = nutrientKgPerBag(nSourceCode, priceDoc);

  if (!pPerBag || !kPerBag || !nPerBag) {
    return {
      id,
      title: 'Fertilizer Plan',
      label,
      isDa: false,
      isCheapest: false,
      schedule: { organic: [], basal: [], after30DAT: [], topdress60DBH: [] },
      cost: null,
      warning: 'Missing price settings for some fertilizer codes.',
    };
  }

  // total requirement for the area
  const req = {
    N: Number(reqKgHa.N || 0) * areaHa,
    P: Number(reqKgHa.P || 0) * areaHa,
    K: Number(reqKgHa.K || 0) * areaHa,
  };

  // bags to meet P and K at basal
  const pBags = roundBags(req.P / (pPerBag.P || 1));
  const kBags = roundBags(req.K / (kPerBag.K || 1));

  // nutrients supplied by basal
  const supplied = {
    N: (pBags * pPerBag.N) + (kBags * kPerBag.N),
    P: (pBags * pPerBag.P) + (kBags * kPerBag.P),
    K: (pBags * pPerBag.K) + (kBags * kPerBag.K),
  };

  // remaining N (split into 2 applications)
  const remainingN = Math.max(0, req.N - supplied.N);
  const totalNBags = roundBags(remainingN / (nPerBag.N || 1));

  const after30 = roundBags(totalNBags / 2);
  const topdress = roundBags(totalNBags / 2);

  const schedule = {
    organic: [],
    basal: [
      { code: pSourceCode, bags: pBags },
      { code: kSourceCode, bags: kBags },
    ],
    after30DAT: after30 > 0 ? [{ code: nSourceCode, bags: after30 }] : [],
    topdress60DBH: topdress > 0 ? [{ code: nSourceCode, bags: topdress }] : [],
  };

  const cost = calcScheduleCost(schedule, priceDoc);

  return {
    id,
    title: 'Fertilizer Plan',
    label,
    isDa: false,
    isCheapest: false,
    schedule,
    cost,
  };
}

function sortPlansCheapestFirst(plans) {
  // push null-cost plans to the bottom
  return plans.sort((a, b) => {
    const ta = a?.cost?.total;
    const tb = b?.cost?.total;
    const na = typeof ta === 'number' ? ta : Number.POSITIVE_INFINITY;
    const nb = typeof tb === 'number' ? tb : Number.POSITIVE_INFINITY;
    return na - nb;
  });
}

// ================= CONTROLLER =================

exports.recommend = async (req, res) => {
  try {
    const {
      n = null,
      p = null,
      k = null,
      nClass = null,
      pClass = null,
      kClass = null,
      crop = 'rice_hybrid',
      areaHa = 1,
    } = req.body || {};

    if (String(crop).toLowerCase() !== 'rice_hybrid') {
      return res.status(400).json({ ok: false, error: 'Only rice_hybrid is supported.' });
    }

    const N = toClass(nClass) || classifyN(n);
    const P = toClass(pClass) || classifyP(p);
    const K = toClass(kClass) || classifyK(k);

    if (!N || !P || !K) {
      return res.status(400).json({
        ok: false,
        error: 'Provide nClass/pClass/kClass (L/M/H) or valid ppm values.',
      });
    }

    const area = Number(areaHa) || 1;
    const npkClass = `${N}${P}${K}`;

    // requirement per hectare (based on class)
    const reqKgHa = {
      N: DA_RICE_HYBRID_REQ.N[N],
      P: DA_RICE_HYBRID_REQ.P[P],
      K: DA_RICE_HYBRID_REQ.K[K],
    };

    // load prices
    const priceDoc = await PriceSettings.ensureSeeded();

    // --- 1) DA plan (UNCHANGED logic) ---
    const daSchedule = buildDaRuleSchedule(N, P, K, area);
    const daCost = calcScheduleCost(daSchedule, priceDoc);

    const daPlan = {
      id: 'DA_RULE',
      title: 'Fertilizer Plan',
      label: 'DA Recommendation',
      isDa: true,
      isCheapest: false,
      schedule: {
        organic: [],
        basal: daSchedule.basal || [],
        after30DAT: daSchedule.after30DAT || [],
        topdress60DBH: daSchedule.topdress60DBH || [],
      },
      cost: daCost,
    };

    // --- 2) Alternative A ---
    const altA = buildAltPlan({
      id: 'ALT_A_DAP_MOP_UREA',
      label: 'Alternative (DAP + MOP + Urea)',
      areaHa: area,
      reqKgHa,
      pSourceCode: '18-46-0',
      kSourceCode: '0-0-60',
      nSourceCode: '46-0-0',
      priceDoc,
    });

    // --- 3) Alternative B ---
    const altB = buildAltPlan({
      id: 'ALT_B_16_20_0_MOP_UREA',
      label: 'Alternative (16-20-0 + MOP + Urea)',
      areaHa: area,
      reqKgHa,
      pSourceCode: '16-20-0',
      kSourceCode: '0-0-60',
      nSourceCode: '46-0-0',
      priceDoc,
    });

    // ALWAYS return exactly 3 plans
    let plans = [daPlan, altA, altB];

    // Sort by cheapest
    plans = sortPlansCheapestFirst(plans);

    // Mark cheapest (only if it has a numeric total)
    if (plans.length) {
      plans.forEach(p => (p.isCheapest = false));
      const firstTotal = plans[0]?.cost?.total;
      if (typeof firstTotal === 'number') plans[0].isCheapest = true;
    }

    return res.json({
      ok: true,
      crop: 'rice_hybrid',
      classified: { N, P, K, npkClass },
      input: {
        nPpm: n != null ? Number(n) : null,
        pPpm: p != null ? Number(p) : null,
        kPpm: k != null ? Number(k) : null,
        areaHa: area,
      },
      nutrientRequirementKgHa: reqKgHa,

      // ✅ NEW: your app uses this
      plans,

      // ✅ keep backward compatible fields too
      schedule: daPlan.schedule,
      cost: daPlan.cost,

      cheapest:
        plans.length && typeof plans[0]?.cost?.total === 'number'
          ? { id: plans[0].id, total: plans[0].cost.total, currency: plans[0].cost.currency }
          : null,

      note: 'Returned 3 fertilizer plans (DA + 2 alternatives), sorted cheapest-first.',
    });
  } catch (e) {
    console.error('[recommend] error:', e);
    res.status(500).json({ ok: false, error: 'Failed to build recommendation' });
  }
};
