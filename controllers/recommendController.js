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
  P: { L: 60, M: 45, H: 20 },
  K: { L: 60, M: 45, H: 30 },
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
    ...basalForP(pClass).map((x) => ({ ...x, bags: x.bags * areaHa })),
  ];

  const split = splitUreaForN(nClass);

  return {
    npkClass: `${nClass}${pClass}${kClass}`,
    nutrientRequirementKgHa: req,
    organic: [], // keep empty to match your UI
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
  return Math.round((Number(x || 0) + Number.EPSILON) * 100) / 100;
}

function roundBags(x) {
  return Math.round((Number(x || 0) + Number.EPSILON) * 100) / 100;
}

function mapPriceItems(priceDoc) {
  const itemsMap = Object.fromEntries(priceDoc.items.entries());
  function itemFor(code) {
    const key = PRICE_KEY_BY_CODE[String(code)];
    return key ? itemsMap[key] || null : null;
  }
  return { itemsMap, itemFor, currency: priceDoc.currency || 'PHP' };
}

/**
 * Returns nutrient kg delivered per 1 bag, based on PriceSettings.
 * NOTE: we treat npk as percent (%).
 * Example: 18-46-0 bagKg=50 -> P per bag = 50*(46/100)=23 kg P per bag
 */
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

// cost calc (kept)
function calcScheduleCost(schedule, priceDoc) {
  const { itemFor, currency } = mapPriceItems(priceDoc);

  const allLines = [
    ...(schedule.basal || []).map((x) => ({ phase: 'BASAL', ...x })),
    ...(schedule.after30DAT || []).map((x) => ({ phase: '30 DAT', ...x })),
    ...(schedule.topdress60DBH || []).map((x) => ({ phase: 'TOPDRESS', ...x })),
  ];

  const rows = allLines.map((line) => {
    const item = itemFor(line.code);
    const pricePerBag = item?.pricePerBag ?? null;
    const subtotal =
      pricePerBag == null ? null : money(pricePerBag * Number(line.bags || 0));
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
// Builds schedules that meet the same kg requirements, but with different mixes.
// ✅ FIXED: No "|| 1" fallback (prevents 45/120 bags explosion).
// ✅ If nutrient per bag is 0, plan returns null (invalid plan).

function buildAltPlan_Template({
  id,
  title,
  label,
  areaHa,
  reqKgHa, // {N,P,K} per hectare
  basalMix, // [{code, role:'P'|'K'|'PK'}]
  nSourceCode, // code to supply remaining N split
  priceDoc,
}) {
  const req = {
    N: Number(reqKgHa.N || 0) * Number(areaHa || 1),
    P: Number(reqKgHa.P || 0) * Number(areaHa || 1),
    K: Number(reqKgHa.K || 0) * Number(areaHa || 1),
  };

  // safety: must exist in price settings
  const checkCodes = [...basalMix.map((x) => x.code), nSourceCode];
  for (const c of checkCodes) {
    const perBag = nutrientKgPerBag(c, priceDoc);
    if (!perBag) return null;
  }

  const basal = [];
  const supplied = { N: 0, P: 0, K: 0 };

  for (const part of basalMix) {
    const perBag = nutrientKgPerBag(part.code, priceDoc);
    if (!perBag) return null;

    let bags = 0;

    if (part.role === 'P') {
      if (!perBag.P || perBag.P <= 0) return null; // ✅ critical fix
      bags = req.P / perBag.P;
    } else if (part.role === 'K') {
      if (!perBag.K || perBag.K <= 0) return null; // ✅ critical fix
      bags = req.K / perBag.K;
    } else if (part.role === 'PK') {
      const canP = perBag.P > 0;
      const canK = perBag.K > 0;
      if (!canP && !canK) return null;

      const needP = canP ? req.P / perBag.P : 0;
      const needK = canK ? req.K / perBag.K : 0;
      bags = Math.max(needP, needK);
    } else {
      bags = 0;
    }

    bags = roundBags(bags);

    // don’t store 0 lines
    if (bags > 0) basal.push({ code: part.code, bags });

    supplied.N += bags * (perBag.N || 0);
    supplied.P += bags * (perBag.P || 0);
    supplied.K += bags * (perBag.K || 0);
  }

  // Remaining N must be filled by N source
  const nPerBag = nutrientKgPerBag(nSourceCode, priceDoc);
  if (!nPerBag || !nPerBag.N || nPerBag.N <= 0) return null; // ✅ critical fix

  const remainingN = Math.max(0, req.N - supplied.N);
  const nBagsTotal = remainingN / nPerBag.N;

  const after30 = roundBags(nBagsTotal / 2);
  const topdress = roundBags(nBagsTotal / 2);

  const after30DAT = after30 > 0 ? [{ code: nSourceCode, bags: after30 }] : [];
  const topdress60DBH =
    topdress > 0 ? [{ code: nSourceCode, bags: topdress }] : [];

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

    const reqKgHa = {
      N: DA_RICE_HYBRID_REQ.N[N],
      P: DA_RICE_HYBRID_REQ.P[P],
      K: DA_RICE_HYBRID_REQ.K[K],
    };

    const priceDoc = await PriceSettings.ensureSeeded();

    // 1) DA plan (fixed rule)
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

    // 2) Alternatives (equivalent nutrients)
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

    const allPlansRaw = [daPlan, altA, altB, altC, altD].filter(Boolean);

    // Deduplicate by schedule signature
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

    // Sort by total cost (cheapest first)
    uniquePlans.sort((a, b) => {
      const ta = Number(a?.cost?.total ?? Number.POSITIVE_INFINITY);
      const tb = Number(b?.cost?.total ?? Number.POSITIVE_INFINITY);
      return ta - tb;
    });

    // Mark cheapest
    if (uniquePlans.length) uniquePlans[0].isCheapest = true;

    // Return top 3 cheapest
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
      plans: top3,
      cheapest: top3.length
        ? {
            id: top3[0].id,
            total: top3[0].cost?.total ?? 0,
            currency: top3[0].cost?.currency || 'PHP',
          }
        : null,
      note: 'Generated 3 fertilizer plans sorted by cheapest total cost. DA plan included as a labeled option.',
    });
  } catch (e) {
    console.error('[recommend] error:', e);
    res.status(500).json({ ok: false, error: 'Failed to build recommendation' });
  }
};
