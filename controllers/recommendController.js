// controllers/recommendController.js
const PriceSettings = require('../models/PriceSettings');
const { classifyN, classifyP, classifyK } = require('../utils/npkThresholds');

/**
 * DA-style Nutrient Requirement (kg/ha) for RICE HYBRID
 * N: L=120, M=90, H=60
 * P: L=60,  M=45, H=20
 * K: L=60,  M=45, H=30
 */
const DA_RICE_HYBRID_REQ = {
  N: { L: 120, M: 90, H: 60 },
  P: { L: 60,  M: 45, H: 20 },
  K: { L: 60,  M: 45, H: 30 },
};

// ================= DA BAG RULES =================

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

function buildRule(nClass, pClass, kClass, areaHa = 1) {
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
    organic: [{ code: 'ORGANIC', bags: 10 * areaHa }],
    basal,
    after30DAT: [{ code: '46-0-0', bags: split.after30DAT * areaHa }],
    topdress60DBH: [{ code: '46-0-0', bags: split.topdress * areaHa }],
  };
}

// Pre-generate 27 rules
const DA_RULES_RICE_HYBRID = (() => {
  const levels = ['L', 'M', 'H'];
  const map = new Map();
  for (const n of levels)
    for (const p of levels)
      for (const k of levels) {
        const r = buildRule(n, p, k, 1);
        map.set(r.npkClass, r);
      }
  return map;
})();

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

// 🔧 FIXED: areaHa applied ONLY ONCE
function calcScheduleCost(schedule, priceDoc) {
  const itemsMap = Object.fromEntries(priceDoc.items.entries());
  const currency = priceDoc.currency || 'PHP';

  function itemFor(code) {
    const key = PRICE_KEY_BY_CODE[code];
    return key ? itemsMap[key] || null : null;
  }

  const allLines = [
    ...schedule.basal.map(x => ({ phase: 'BASAL', ...x })),
    ...schedule.after30DAT.map(x => ({ phase: '30 DAT', ...x })),
    ...schedule.topdress60DBH.map(x => ({ phase: 'TOPDRESS', ...x })),
  ];

  const rows = allLines.map(line => {
    const item = itemFor(line.code);
    const pricePerBag = item?.pricePerBag ?? null;
    const subtotal = pricePerBag == null ? null : money(pricePerBag * line.bags);
    return {
      phase: line.phase,
      code: line.code,
      bags: line.bags,
      pricePerBag,
      subtotal,
    };
  });

  const total = money(rows.reduce((sum, r) => sum + (r.subtotal || 0), 0));
  return { currency, rows, total };
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
    const baseRule = DA_RULES_RICE_HYBRID.get(npkClass);
    if (!baseRule) {
      return res.status(404).json({ ok: false, error: `No rule for ${npkClass}` });
    }

    const schedule = buildRule(N, P, K, Number(areaHa) || 1);

    let cost = null;
    try {
      const priceDoc = await PriceSettings.ensureSeeded();
      cost = calcScheduleCost(schedule, priceDoc);
    } catch {
      cost = null;
    }

    return res.json({
      ok: true,
      crop: 'rice_hybrid',
      classified: { N, P, K, npkClass },
      input: {
        nPpm: n != null ? Number(n) : null,
        pPpm: p != null ? Number(p) : null,
        kPpm: k != null ? Number(k) : null,
        areaHa: Number(areaHa) || 1,
      },
      nutrientRequirementKgHa: schedule.nutrientRequirementKgHa,
      schedule,
      cost,
      note: 'DA fixed-rule fertilizer recommendation (Basal + 30 DAT + Topdress).',
    });
  } catch (e) {
    console.error('[recommend] error:', e);
    res.status(500).json({ ok: false, error: 'Failed to build recommendation' });
  }
};
