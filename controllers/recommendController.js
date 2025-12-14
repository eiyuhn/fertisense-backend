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

// ================= DA BAG RULES (your existing fixed rule) =================

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
    // organic removed in UI (still can exist if you want, but set empty)
    organic: [],
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
  // keep readable bags like LGU sheet
  return Math.round((Number(x || 0) + Number.EPSILON) * 100) / 100;
}

function mapPriceItems(priceDoc) {
  const itemsMap = Object.fromEntries(priceDoc.items.entries());
  function itemFor(code) {
    const key = PRICE_KEY_BY_CODE[code];
    return key ? itemsMap[key] || null : null;
  }
  return { itemsMap, itemFor, currency: priceDoc.currency || 'PHP' };
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

// 🔧 cost calc (your existing, kept)
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
      code: line.code,
      bags: Number(line.bags || 0),
      pricePerBag,
      subtotal,
    };
  });

  const total = money(rows.reduce((sum, r) => sum + (r.subtotal || 0), 0));
  return { currency, rows, total };
}

// ================= ALT PLAN BUILDER (CHEAPER COMBOS) =================
// We build “equivalent” schedules that still satisfy the same kg/ha requirement,
// but use different fertilizer combinations based on your LGU price list.

function buildAltPlan_Template({
  id,
  title,
  label,
  areaHa,
  reqKgHa,      // {N,P,K} per hectare
  basalMix,     // array of fertilizers used for basal nutrient supply (P/K + some N)
  nSourceCode,  // fertilizer code to supply remaining N (split)
  priceDoc,
}) {
  // basalMix example:
  // [{ code:'18-46-0', role:'P' }, { code:'0-0-60', role:'K' }]
  // or [{ code:'14-14-14', role:'PK' }]

  const req = {
    N: Number(reqKgHa.N || 0) * areaHa,
    P: Number(reqKgHa.P || 0) * areaHa,
    K: Number(reqKgHa.K || 0) * areaHa,
  };

  // safety: must exist in price settings
  const checkCodes = [...basalMix.map(x => x.code), nSourceCode];
  for (const c of checkCodes) {
    const perBag = nutrientKgPerBag(c, priceDoc);
    if (!perBag) return null;
  }

  let basal = [];
  let supplied = { N: 0, P: 0, K: 0 };

  // --- Basal bags computation ---
  // Strategy:
  // - If fertilizer is “P” => set bags so P meets requirement
  // - If “K” => set bags so K meets requirement
  // - If “PK” (like 14-14-14) => set bags so BOTH P and K are met
  // Then compute how much N it already supplies.

  for (const part of basalMix) {
    const perBag = nutrientKgPerBag(part.code, priceDoc);

    let bags = 0;

    if (part.role === 'P') {
      bags = req.P / (perBag.P || 1);
    } else if (part.role === 'K') {
      bags = req.K / (perBag.K || 1);
    } else if (part.role === 'PK') {
      const needP = req.P / (perBag.P || 1);
      const needK = req.K / (perBag.K || 1);
      bags = Math.max(needP, needK);
    } else {
      // default: do nothing
      bags = 0;
    }

    bags = roundBags(bags);

    basal.push({ code: part.code, bags });
    supplied.N += bags * perBag.N;
    supplied.P += bags * perBag.P;
    supplied.K += bags * perBag.K;
  }

  // Remaining N must be filled by N source
  const nPerBag = nutrientKgPerBag(nSourceCode, priceDoc);
  const remainingN = Math.max(0, req.N - supplied.N);
  const nBagsTotal = remainingN / (nPerBag.N || 1);

  const after30 = roundBags(nBagsTotal / 2);
  const topdress = roundBags(nBagsTotal / 2);

  // if basically zero, keep clean
  const after30DAT = after30 > 0 ? [{ code: nSourceCode, bags: after30 }] : [];
  const topdress60DBH = topdress > 0 ? [{ code: nSourceCode, bags: topdress }] : [];

  const schedule = {
    organic: [],
    basal,
    after30DAT,
    topdress60DBH,
  };

  const cost = calcScheduleCost(schedule, priceDoc);

  return {
    id,
    title,
    label,
    isDa: false,
    isCheapest: false,
    schedule,
    cost,
  };
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
      return res.status(400).json({
        ok: false,
        error: 'Only rice_hybrid is supported.',
      });
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

    const npkClass = `${N}${P}${K}`;
    const area = Number(areaHa) || 1;

    // Nutrient requirement (per ha)
    const reqKgHa = {
      N: DA_RICE_HYBRID_REQ.N[N],
      P: DA_RICE_HYBRID_REQ.P[P],
      K: DA_RICE_HYBRID_REQ.K[K],
    };

    // Load prices (needed for alt plans + cost sorting)
    const priceDoc = await PriceSettings.ensureSeeded();

    // 1) DA plan (your fixed rule)
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

    // 2) Alternative plans (cost-based, still meeting kg requirements)
    // These are based on LGU-style combinations from your sheet:
    // Option A: DAP + MOP + Urea
    // Option B: 16-20-0 + MOP + Urea
    // Option C: 14-14-14 + Urea
    // Option D: 14-14-14 + Ammosul (cheaper N source)
    const altA = buildAltPlan_Template({
      id: 'ALT_DAP_MOP_UREA',
      title: 'Fertilizer Plan',
      label: 'Alternative (DAP + MOP + Urea)',
      areaHa: area,
      reqKgHa,
      basalMix: [
        { code: '18-46-0', role: 'P' },
        { code: '0-0-60', role: 'K' },
      ],
      nSourceCode: '46-0-0',
      priceDoc,
    });

    const altB = buildAltPlan_Template({
      id: 'ALT_16_20_0_MOP_UREA',
      title: 'Fertilizer Plan',
      label: 'Alternative (16-20-0 + MOP + Urea)',
      areaHa: area,
      reqKgHa,
      basalMix: [
        { code: '16-20-0', role: 'P' },
        { code: '0-0-60', role: 'K' },
      ],
      nSourceCode: '46-0-0',
      priceDoc,
    });

    const altC = buildAltPlan_Template({
      id: 'ALT_14_14_14_UREA',
      title: 'Fertilizer Plan',
      label: 'Alternative (14-14-14 + Urea)',
      areaHa: area,
      reqKgHa,
      basalMix: [{ code: '14-14-14', role: 'PK' }],
      nSourceCode: '46-0-0',
      priceDoc,
    });

    const altD = buildAltPlan_Template({
      id: 'ALT_14_14_14_AMMOSUL',
      title: 'Fertilizer Plan',
      label: 'Alternative (14-14-14 + Ammosul)',
      areaHa: area,
      reqKgHa,
      basalMix: [{ code: '14-14-14', role: 'PK' }],
      nSourceCode: '21-0-0',
      priceDoc,
    });

    // Collect & remove nulls
    const allPlansRaw = [daPlan, altA, altB, altC, altD].filter(Boolean);

    // Remove duplicates by schedule “signature” (same bags for same codes)
    const signature = (plan) => {
      const s = plan.schedule || {};
      const norm = (arr) =>
        (arr || [])
          .map((x) => `${String(x.code)}:${roundBags(x.bags)}`)
          .sort()
          .join('|');
      return [
        'B:' + norm(s.basal),
        '30:' + norm(s.after30DAT),
        'T:' + norm(s.topdress60DBH),
      ].join('::');
    };

    const seen = new Set();
    const uniquePlans = [];
    for (const p of allPlansRaw) {
      const sig = signature(p);
      if (seen.has(sig)) continue;
      seen.add(sig);
      uniquePlans.push(p);
    }

    // Sort by cost ascending (cheapest first)
    uniquePlans.sort((a, b) => {
      const ta = Number(a?.cost?.total ?? Number.POSITIVE_INFINITY);
      const tb = Number(b?.cost?.total ?? Number.POSITIVE_INFINITY);
      return ta - tb;
    });

    // Mark cheapest
    if (uniquePlans.length) uniquePlans[0].isCheapest = true;

    // Return only the top 3 cheapest plans (as you requested)
    const top3 = uniquePlans.slice(0, 3);

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
      // ✅ important: send plans array (sorted cheapest first)
      plans: top3,
      cheapest: top3.length
        ? { id: top3[0].id, total: top3[0].cost?.total ?? 0, currency: top3[0].cost?.currency || 'PHP' }
        : null,
      note: 'Generated 3 fertilizer plans sorted by cheapest total cost. DA plan included as a labeled option.',
    });
  } catch (e) {
    console.error('[recommend] error:', e);
    res.status(500).json({ ok: false, error: 'Failed to build recommendation' });
  }
};
