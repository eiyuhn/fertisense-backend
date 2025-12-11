// controllers/recommendController.js
const PriceSettings = require('../models/PriceSettings');

/**
 * Approx. conversion:
 *  1 ppm ≈ 2 kg/ha (0–20 cm soil depth, bulk density ~1.3 g/cm³)
 */
const PPM_TO_KG_HA = 2.0;

/** IRRI-style classification thresholds (sensor values are in ppm) */
const IRRI_THRESHOLDS = {
  N: { lowMax: 40, mediumMax: 80 },     // 0–40 low, 41–80 medium, >80 high
  P: { lowMax: 10, mediumMax: 20 },     // 0–10 low, 11–20 medium, >20 high
  K: { lowMax: 80, mediumMax: 150 },    // 0–80 low, 81–150 medium, >150 high
};

/**
 * IRRI fertilizer recommendations (kg/ha of N, P, K) by category
 * ✳️ FILL THESE using your official tables where needed.
 * Below: example from your "Hybrid, Wet Season, Light Soils" table.
 */
const IRRI_RATES = {
  HYBRID: {
    WET: {
      LIGHT: {
        N: { low: 120, medium: 90, high: 60 },
        P: { low: 70,  medium: 50, high: 30 },
        K: { low: 70,  medium: 50, high: 30 },
      },
      HEAVY: {
        // TODO: replace with correct values from your table
        N: { low: 100, medium: 80, high: 50 },
        P: { low: 60,  medium: 40, high: 20 },
        K: { low: 60,  medium: 40, high: 20 },
      },
    },
    DRY: {
      // TODO: replace with dry-season values (if you have them)
      LIGHT: {
        N: { low: 100, medium: 80, high: 50 },
        P: { low: 60,  medium: 40, high: 20 },
        K: { low: 60,  medium: 40, high: 20 },
      },
      HEAVY: {
        N: { low: 90, medium: 70, high: 40 },
        P: { low: 50, medium: 30, high: 20 },
        K: { low: 50, medium: 30, high: 20 },
      },
    },
  },
  INBRED: {
    // Fallback / sample values – adjust based on your IRRI references
    WET: {
      LIGHT: {
        N: { low: 100, medium: 70, high: 40 },
        P: { low: 60,  medium: 40, high: 20 },
        K: { low: 60,  medium: 40, high: 20 },
      },
      HEAVY: {
        N: { low: 90, medium: 60, high: 30 },
        P: { low: 60, medium: 40, high: 20 },
        K: { low: 60, medium: 40, high: 20 },
      },
    },
    DRY: {
      LIGHT: {
        N: { low: 120, medium: 90, high: 60 },
        P: { low: 60, medium: 40, high: 20 },
        K: { low: 60, medium: 40, high: 20 },
      },
      HEAVY: {
        N: { low: 100, medium: 70, high: 40 },
        P: { low: 60, medium: 40, high: 20 },
        K: { low: 60, medium: 40, high: 20 },
      },
    },
  },
};

function money(x) {
  return Math.round((x || 0) * 100) / 100;
}
function subtotalBags(bags, pricePerBag) {
  return money((bags || 0) * (pricePerBag || 0));
}

function classifyLevel(valuePpm, thr) {
  if (valuePpm <= thr.lowMax) return 'low';
  if (valuePpm <= thr.mediumMax) return 'medium';
  return 'high';
}

function safeGetRates(riceType, season, soilType) {
  const type = (riceType || 'HYBRID').toUpperCase();
  const seas = (season || 'WET').toUpperCase();
  const soil = (soilType || 'LIGHT').toUpperCase();

  const byType = IRRI_RATES[type] || IRRI_RATES.HYBRID;
  const bySeason = (byType && byType[seas]) || byType.WET;
  const bySoil = (bySeason && bySeason[soil]) || bySeason.LIGHT;

  return bySoil;
}

function phStatus(ph) {
  if (ph == null || isNaN(ph)) return 'unknown';
  if (ph < 5.5) return 'acidic';
  if (ph > 7.5) return 'alkaline';
  return 'neutral';
}

/**
 * Build fertilizer plans using current price settings + IRRI NPK targets.
 * Uses your PriceSettings.items entries (npk%, bagKg, pricePerBag).
 */
function buildPlansFromTargets(targetN, targetP, targetK, priceDoc, areaHa = 1) {
  const itemsMap = Object.fromEntries(priceDoc.items.entries());
  const currency = priceDoc.currency || 'PHP';

  function needKg(nutrientKgHa) {
    return nutrientKgHa * (areaHa || 1);
  }

  function getItem(code) {
    const item = itemsMap[code];
    if (!item) throw new Error(`Missing fertilizer item in PriceSettings: ${code}`);
    return item;
  }

  // --- Plan 1: Straight Fertilizers (Urea, SSP, MOP) ---
  function makePlanStraight() {
    const urea = getItem('UREA_46_0_0');
    const ssp  = getItem('SSP_0_16_0');
    const mop  = getItem('MOP_0_0_60');

    const nKg = needKg(targetN);
    const pKg = needKg(targetP);
    const kKg = needKg(targetK);

    const ureaKg = urea.npk.N > 0 ? nKg / (urea.npk.N / 100) : 0;
    const sspKg  = ssp.npk.P  > 0 ? pKg / (ssp.npk.P  / 100) : 0;
    const mopKg  = mop.npk.K  > 0 ? kKg / (mop.npk.K  / 100) : 0;

    const ureaBags = Math.ceil(ureaKg / urea.bagKg);
    const sspBags  = Math.ceil(sspKg  / ssp.bagKg);
    const mopBags  = Math.ceil(mopKg  / mop.bagKg);

    const rows = [
      {
        key: 'UREA_46_0_0',
        label: urea.label,
        bags: ureaBags,
        pricePerBag: urea.pricePerBag,
        subtotal: subtotalBags(ureaBags, urea.pricePerBag),
      },
      {
        key: 'SSP_0_16_0',
        label: ssp.label,
        bags: sspBags,
        pricePerBag: ssp.pricePerBag,
        subtotal: subtotalBags(sspBags, ssp.pricePerBag),
      },
      {
        key: 'MOP_0_0_60',
        label: mop.label,
        bags: mopBags,
        pricePerBag: mop.pricePerBag,
        subtotal: subtotalBags(mopBags, mop.pricePerBag),
      },
    ];

    const total = money(rows.reduce((a, r) => a + r.subtotal, 0));
    return { code: 'plan1', title: 'Straight Fertilizers', rows, total, currency };
  }

  // --- Plan 2: DAP-based (DAP covers P + some N, then Urea + MOP) ---
  function makePlanDAP() {
    const dap  = getItem('DAP_18_46_0');
    const urea = getItem('UREA_46_0_0');
    const mop  = getItem('MOP_0_0_60');

    const nKg = needKg(targetN);
    const pKg = needKg(targetP);
    const kKg = needKg(targetK);

    const dapKg = dap.npk.P > 0 ? pKg / (dap.npk.P / 100) : 0;
    const nFromDAP = dapKg * (dap.npk.N / 100);
    const nRemaining = Math.max(0, nKg - nFromDAP);

    const ureaKg = urea.npk.N > 0 ? nRemaining / (urea.npk.N / 100) : 0;
    const mopKg  = mop.npk.K  > 0 ? kKg / (mop.npk.K  / 100) : 0;

    const dapBags  = Math.ceil(dapKg  / dap.bagKg);
    const ureaBags = Math.ceil(ureaKg / urea.bagKg);
    const mopBags  = Math.ceil(mopKg  / mop.bagKg);

    const rows = [
      {
        key: 'DAP_18_46_0',
        label: dap.label,
        bags: dapBags,
        pricePerBag: dap.pricePerBag,
        subtotal: subtotalBags(dapBags, dap.pricePerBag),
      },
      {
        key: 'UREA_46_0_0',
        label: urea.label,
        bags: ureaBags,
        pricePerBag: urea.pricePerBag,
        subtotal: subtotalBags(ureaBags, urea.pricePerBag),
      },
      {
        key: 'MOP_0_0_60',
        label: mop.label,
        bags: mopBags,
        pricePerBag: mop.pricePerBag,
        subtotal: subtotalBags(mopBags, mop.pricePerBag),
      },
    ];

    const total = money(rows.reduce((a, r) => a + r.subtotal, 0));
    return { code: 'plan2', title: 'DAP + Urea + MOP', rows, total, currency };
  }

  // --- Plan 3: NPK complete + Urea top-up ---
  function makePlanNPK() {
    // You can use either NPK_14_14_14 or COMPLETE_14_14_14 depending on your seed
    const npk  = itemsMap['NPK_14_14_14'] || itemsMap['COMPLETE_14_14_14'];
    const urea = getItem('UREA_46_0_0');

    if (!npk) {
      // If NPK is not defined, skip this plan
      return null;
    }

    const nKg = needKg(targetN);
    const pKg = needKg(targetP);
    const kKg = needKg(targetK);

    const npkN = npk.npk.N / 100;
    const npkP = npk.npk.P / 100;
    const npkK = npk.npk.K / 100;

    // kg of NPK to cover the max of N/P/K demand
    const npkKg = Math.max(
      npkN > 0 ? nKg / npkN : 0,
      npkP > 0 ? pKg / npkP : 0,
      npkK > 0 ? kKg / npkK : 0
    );

    const nFromNPK = npkKg * npkN;
    const nRemaining = Math.max(0, nKg - nFromNPK);
    const ureaKg = urea.npk.N > 0 ? nRemaining / (urea.npk.N / 100) : 0;

    const npkBags  = Math.ceil(npkKg  / npk.bagKg);
    const ureaBags = Math.ceil(ureaKg / urea.bagKg);

    const rows = [
      {
        key: npk.code || 'NPK_14_14_14',
        label: npk.label,
        bags: npkBags,
        pricePerBag: npk.pricePerBag,
        subtotal: subtotalBags(npkBags, npk.pricePerBag),
      },
      {
        key: 'UREA_46_0_0',
        label: urea.label,
        bags: ureaBags,
        pricePerBag: urea.pricePerBag,
        subtotal: subtotalBags(ureaBags, urea.pricePerBag),
      },
    ];

    const total = money(rows.reduce((a, r) => a + r.subtotal, 0));
    return { code: 'plan3', title: 'Complete (NPK) + Urea', rows, total, currency };
  }

  const plans = [];
  try { plans.push(makePlanStraight()); } catch (e) { console.warn('Plan1 error:', e.message); }
  try { plans.push(makePlanDAP()); } catch (e) { console.warn('Plan2 error:', e.message); }
  try {
    const p3 = makePlanNPK();
    if (p3) plans.push(p3);
  } catch (e) {
    console.warn('Plan3 error:', e.message);
  }

  return plans;
}

exports.recommend = async (req, res) => {
  try {
    // Sensor-based inputs in **ppm**
    // n, p, k are from soil test (NPK in ppm)
    const {
      n = 0,
      p = 0,
      k = 0,
      ph,
      season,
      riceType,
      soilType,
      areaHa = 1,
    } = req.body || {};

    const nPpm = Number(n) || 0;
    const pPpm = Number(p) || 0;
    const kPpm = Number(k) || 0;
    const phVal = ph != null ? Number(ph) : undefined;

    const nLevel = classifyLevel(nPpm, IRRI_THRESHOLDS.N);
    const pLevel = classifyLevel(pPpm, IRRI_THRESHOLDS.P);
    const kLevel = classifyLevel(kPpm, IRRI_THRESHOLDS.K);

    const rates = safeGetRates(riceType, season, soilType);

    const targetN = rates.N[nLevel];
    const targetP = rates.P[pLevel];
    const targetK = rates.K[kLevel];

    const phStat = phStatus(phVal);

    // Friendly narrative
    const englishText = [
      `Based on the soil test, Nitrogen is ${nLevel.toUpperCase()}, Phosphorus is ${pLevel.toUpperCase()}, and Potassium is ${kLevel.toUpperCase()}.`,
      `For a ${ (riceType || 'hybrid').toLowerCase() } rice field (${(season || 'wet').toLowerCase()} season, ${(soilType || 'light').toLowerCase()} soil), IRRI-based recommendation is:`,
      `N ≈ ${targetN} kg/ha, P ≈ ${targetP} kg/ha, K ≈ ${targetK} kg/ha.`,
      phVal != null
        ? `Soil pH is ${phVal.toFixed(1)} (${phStat}).`
        : `Soil pH was not provided.`,
    ].join(' ');

    const tagalogText = [
      `Batay sa soil test, ang Nitrogen ay ${nLevel.toUpperCase()}, ang Phosphorus ay ${pLevel.toUpperCase()}, at ang Potassium ay ${kLevel.toUpperCase()}.`,
      `Para sa ${ (riceType || 'hybrid').toLowerCase() } na palay sa ${ (season || 'wet').toLowerCase() } season at ${(soilType || 'light').toLowerCase()} na lupa, inirerekomenda na:`,
      `N ≈ ${targetN} kg/ha, P ≈ ${targetP} kg/ha, K ≈ ${targetK} kg/ha.`,
      phVal != null
        ? `Ang pH ng lupa ay ${phVal.toFixed(1)} (${phStat}).`
        : `Walang naitalang pH ng lupa.`,
    ].join(' ');

    // Load price settings for fertilizer plans
    const priceDoc = await PriceSettings.ensureSeeded();
    const plans = buildPlansFromTargets(targetN, targetP, targetK, priceDoc, areaHa);

    let cheapest = null;
    if (plans.length > 0) {
      cheapest = plans.reduce((a, b) => (a.total <= b.total ? a : b), plans[0]);
    }

    res.json({
      ok: true,
      input: {
        nPpm,
        pPpm,
        kPpm,
        ph: phVal,
        season: season || 'WET',
        riceType: riceType || 'HYBRID',
        soilType: soilType || 'LIGHT',
        areaHa,
        // For debugging view:
        nKgHaApprox: nPpm * PPM_TO_KG_HA,
        pKgHaApprox: pPpm * PPM_TO_KG_HA,
        kKgHaApprox: kPpm * PPM_TO_KG_HA,
        levels: { N: nLevel, P: pLevel, K: kLevel },
        targetsKgHa: { N: targetN, P: targetP, K: targetK },
      },
      narrative: { en: englishText, tl: tagalogText },
      plans,
      cheapest: cheapest
        ? { code: cheapest.code, total: cheapest.total, currency: cheapest.currency }
        : null,
      currency: priceDoc.currency || 'PHP',
      updatedAt: priceDoc.updatedAt,
    });
  } catch (e) {
    console.error('[recommend] error:', e);
    res.status(500).json({ ok: false, error: 'Failed to build recommendation' });
  }
};
