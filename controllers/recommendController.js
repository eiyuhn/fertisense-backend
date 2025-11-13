// controllers/recommendController.js
const PriceSettings = require('../models/PriceSettings');

/* ---------------- small helpers ---------------- */
function money(x) {
  return Math.round((x || 0) * 100) / 100;
}
function subtotalBags(bags, pricePerBag) {
  return money((bags || 0) * (pricePerBag || 0));
}

/* -------------- 1. Classify NPK ppm → L / M / H -------------- */
// You can tweak these thresholds if DA/BAR gives different ones.
function classifyN(nPpm) {
  if (nPpm < 100) return 'L';
  if (nPpm <= 150) return 'M';
  return 'H';
}
function classifyP(pPpm) {
  if (pPpm < 15) return 'L';
  if (pPpm <= 30) return 'M';
  return 'H';
}
function classifyK(kPpm) {
  if (kPpm < 80) return 'L';
  if (kPpm <= 150) return 'M';
  return 'H';
}

/* -------------- 2. Target kg/ha table (from your booklet) -------------- */

// variety: "hybrid" | "inbred"
// soil: "light" | "medHeavy"
// season: "wet" | "dry"
// ratings: "L" | "M" | "H"

const RICE_TARGETS = {
  hybrid: {
    light: {
      wet: {
        N: { L: 120, M: 90, H: 60 },
        P: { L: 70,  M: 50, H: 30 },
        K: { L: 80,  M: 50, H: 30 },
      },
      dry: {
        N: { L: 140, M: 110, H: 80 },
        P: { L: 80,  M: 60,  H: 30 },
        K: { L: 90,  M: 70,  H: 50 },
      },
    },
    medHeavy: {
      wet: {
        // This row matches your 110-70-70 example for hybrid, wet, med-heavy
        N: { L: 110, M: 80, H: 50 },
        P: { L: 70,  M: 50, H: 30 },
        K: { L: 70,  M: 50, H: 30 },
      },
      dry: {
        N: { L: 120, M: 90, H: 60 },
        P: { L: 70,  M: 50, H: 30 },
        K: { L: 80,  M: 60, H: 40 },
      },
    },
  },
  inbred: {
    light: {
      wet: {
        N: { L: 100, M: 70, H: 40 },
        P: { L: 60,  M: 40, H: 20 },
        K: { L: 60,  M: 40, H: 20 },
      },
      dry: {
        N: { L: 120, M: 90, H: 60 },
        P: { L: 60,  M: 40, H: 20 },
        K: { L: 60,  M: 40, H: 20 },
      },
    },
    medHeavy: {
      wet: {
        N: { L: 90,  M: 60, H: 30 },
        P: { L: 60,  M: 40, H: 20 },
        K: { L: 60,  M: 40, H: 20 },
      },
      dry: {
        N: { L: 100, M: 70, H: 40 },
        P: { L: 60,  M: 40, H: 20 },
        K: { L: 60,  M: 40, H: 20 },
      },
    },
  },
};

function getTargetKgPerHa(variety, soilClass, season, nRating, pRating, kRating) {
  const v = RICE_TARGETS[variety] || RICE_TARGETS.hybrid;
  const s = v[soilClass] || v.medHeavy;
  const row = (s && s[season]) || s.wet;

  return {
    Nkg: row.N[nRating],
    Pkg: row.P[pRating],
    Kkg: row.K[kRating],
  };
}

/* -------------- 3. Read fertilizer products from PriceSettings -------------- */

function extractProducts(priceDoc) {
  const out = [];
  const map = priceDoc.items instanceof Map
    ? Object.fromEntries(priceDoc.items.entries())
    : priceDoc.items || {};

  for (const [code, v] of Object.entries(map)) {
    if (!v) continue;
    const npk = v.npk || { N: 0, P: 0, K: 0 };
    out.push({
      code,
      label: v.label || code,
      pricePerBag: Number(v.pricePerBag || 0),
      bagKg: v.bagKg || 50,
      Npct: Number(npk.N || 0),
      Ppct: Number(npk.P || 0),
      Kpct: Number(npk.K || 0),
    });
  }
  return out;
}

function kgPerBag(prod, nutrient) {
  const pct =
    nutrient === 'N' ? prod.Npct :
    nutrient === 'P' ? prod.Ppct :
    prod.Kpct;
  return (pct / 100) * prod.bagKg;
}

function costPerKgNutrient(prod, nutrient) {
  const kg = kgPerBag(prod, nutrient);
  return kg > 0 ? prod.pricePerBag / kg : Number.POSITIVE_INFINITY;
}

function selectFertilizers(products) {
  let balanced, nOnly, kOnly;

  for (const p of products) {
    const hasN = p.Npct > 0;
    const hasP = p.Ppct > 0;
    const hasK = p.Kpct > 0;

    if (hasN && hasP && hasK) {
      // balanced NPK (e.g. 14-14-14). Choose cheapest per kg P.
      if (!balanced || costPerKgNutrient(p, 'P') < costPerKgNutrient(balanced, 'P')) {
        balanced = p;
      }
    }

    if (hasN && !hasP && !hasK) {
      // N only (e.g. 46-0-0, 21-0-0)
      if (!nOnly || costPerKgNutrient(p, 'N') < costPerKgNutrient(nOnly, 'N')) {
        nOnly = p;
      }
    }

    if (!hasN && !hasP && hasK) {
      // K only (e.g. 0-0-60)
      if (!kOnly || costPerKgNutrient(p, 'K') < costPerKgNutrient(kOnly, 'K')) {
        kOnly = p;
      }
    }
  }

  return { balanced, nOnly, kOnly };
}

/* -------------- 4. Build a balanced-first plan -------------- */

function roundBags(x) {
  // 2 decimal places; you can switch to 0.25 stepping if you want
  return Math.round(x * 100) / 100;
}

function computeBalancedPlan(targetNkg, targetPkg, targetKkg, ferts) {
  const rows = [];
  let Nsup = 0;
  let Psup = 0;
  let Ksup = 0;
  let totalCost = 0;

  const { balanced, nOnly, kOnly } = ferts;

  if (!balanced || !nOnly || !kOnly) {
    // Not enough product types to build a proper plan
    return { rows: [], supplied: { Nkg: 0, Pkg: 0, Kkg: 0 }, totalCost: 0 };
  }

  // 1) Use balanced NPK to satisfy all P (hardest to adjust)
  const PkgPerBag = kgPerBag(balanced, 'P') || 0.0001;
  const bagsBalanced = roundBags(targetPkg / PkgPerBag);

  Nsup += bagsBalanced * kgPerBag(balanced, 'N');
  Psup += bagsBalanced * kgPerBag(balanced, 'P');
  Ksup += bagsBalanced * kgPerBag(balanced, 'K');
  totalCost += bagsBalanced * balanced.pricePerBag;
  rows.push({ product: balanced, bags: bagsBalanced });

  // 2) Remaining N & K after NPK
  const remainingN = Math.max(0, targetNkg - Nsup);
  const remainingK = Math.max(0, targetKkg - Ksup);

  // 3) N-only fertilizer (e.g. Urea 46-0-0)
  const NkgPerBag_N = kgPerBag(nOnly, 'N') || 0.0001;
  const bagsN = roundBags(remainingN / NkgPerBag_N);

  Nsup += bagsN * NkgPerBag_N;
  totalCost += bagsN * nOnly.pricePerBag;
  if (bagsN > 0) rows.push({ product: nOnly, bags: bagsN });

  // 4) K-only fertilizer (e.g. 0-0-60)
  const KkgPerBag_K = kgPerBag(kOnly, 'K') || 0.0001;
  const bagsK = roundBags(remainingK / KkgPerBag_K);

  Ksup += bagsK * KkgPerBag_K;
  totalCost += bagsK * kOnly.pricePerBag;
  if (bagsK > 0) rows.push({ product: kOnly, bags: bagsK });

  return {
    rows,
    supplied: { Nkg: Nsup, Pkg: Psup, Kkg: Ksup },
    totalCost,
  };
}

/* -------------- 5. Normalization helpers for request body -------------- */

function normalizeVariety(raw) {
  const s = (raw || '').toString().toLowerCase();
  if (s.includes('inbred')) return 'inbred';
  return 'hybrid';
}
function normalizeSoil(raw) {
  const s = (raw || '').toString().toLowerCase();
  if (s.includes('light')) return 'light';
  return 'medHeavy';
}
function normalizeSeason(raw) {
  const s = (raw || '').toString().toLowerCase();
  if (s.includes('dry')) return 'dry';
  return 'wet';
}

/* -------------- 6. Main controller -------------- */

exports.recommend = async (req, res) => {
  try {
    const body = req.body || {};

    // Support both old (n,p,k) and new (nPpm,pPpm,kPpm) field names
    const nPpm = Number(body.nPpm ?? body.n ?? 0);
    const pPpm = Number(body.pPpm ?? body.p ?? 0);
    const kPpm = Number(body.kPpm ?? body.k ?? 0);
    const ph = body.ph != null ? Number(body.ph) : undefined;

    if (!Number.isFinite(nPpm) || !Number.isFinite(pPpm) || !Number.isFinite(kPpm)) {
      return res.status(400).json({ ok: false, error: 'Invalid NPK values.' });
    }

    const areaHa = Number(body.areaHa || 1);
    const variety = normalizeVariety(body.riceType || body.variety);
    const soilClass = normalizeSoil(body.soilType);
    const season = normalizeSeason(body.season);

    const nRating = classifyN(nPpm);
    const pRating = classifyP(pPpm);
    const kRating = classifyK(kPpm);

    // kg/ha from table
    const { Nkg, Pkg, Kkg } = getTargetKgPerHa(
      variety,
      soilClass,
      season,
      nRating,
      pRating,
      kRating
    );

    // total requirement for the actual field size
    const totalN = Nkg * areaHa;
    const totalP = Pkg * areaHa;
    const totalK = Kkg * areaHa;

    // Load fertilizer price list
    const priceDoc = await PriceSettings.ensureSeeded();
    const products = extractProducts(priceDoc);
    const ferts = selectFertilizers(products);
    const planCalc = computeBalancedPlan(totalN, totalP, totalK, ferts);

    const rows = planCalc.rows.map((r) => ({
      key: r.product.code,
      label: r.product.label,
      bags: r.bags,
      pricePerBag: r.product.pricePerBag,
      subtotal: subtotalBags(r.bags, r.product.pricePerBag),
    }));

    const plan = {
      code: 'rice_balanced',
      title: 'Rice Fertilizer Plan (Balanced first)',
      rows,
      total: money(planCalc.totalCost),
      currency: priceDoc.currency || 'PHP',
    };

    const currency = plan.currency;

    // Narrative in TL + EN
    const englishText =
      `Soil test readings: N=${nPpm.toFixed(1)} ppm, ` +
      `P=${pPpm.toFixed(1)} ppm, K=${kPpm.toFixed(1)} ppm.\n` +
      `This corresponds to soil fertility N=${nRating}, P=${pRating}, K=${kRating}. ` +
      `For ${variety} rice (${season} season, ${soilClass === 'medHeavy' ? 'medium-heavy' : 'light'} soil) ` +
      `the recommended application is about ${totalN.toFixed(0)} kg N, ` +
      `${totalP.toFixed(0)} kg P and ${totalK.toFixed(0)} kg K for ${areaHa} ha.`;

    const tagalogText =
      `Base sa soil test: N=${nPpm.toFixed(1)} ppm, P=${pPpm.toFixed(1)} ppm, ` +
      `K=${kPpm.toFixed(1)} ppm.\n` +
      `Ang lupa ay may antas na N=${nRating}, P=${pRating}, K=${kRating}. ` +
      `Para sa ${variety.toUpperCase()} rice (${season} season, ` +
      `${soilClass === 'medHeavy' ? 'medium-heavy' : 'light'} soil), ` +
      `inirerekomenda ang humigit-kumulang ${totalN.toFixed(0)} kg N, ` +
      `${totalP.toFixed(0)} kg P at ${totalK.toFixed(0)} kg K para sa ${areaHa} ha.`;

    const plans = [plan];
    const cheapest = { code: plan.code, total: plan.total, currency };

    res.json({
      ok: true,
      input: {
        nPpm,
        pPpm,
        kPpm,
        ph,
        areaHa,
        variety,
        soilClass,
        season,
        ratings: { N: nRating, P: pRating, K: kRating },
        targetsPerHa: { Nkg, Pkg, Kkg },
      },
      narrative: { en: englishText, tl: tagalogText },
      plans,
      cheapest,
      updatedAt: priceDoc.updatedAt,
    });
  } catch (e) {
    console.error('[recommend] error:', e);
    res.status(500).json({ ok: false, error: 'Failed to build recommendation' });
  }
};
