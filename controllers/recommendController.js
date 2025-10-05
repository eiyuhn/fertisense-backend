const PriceSettings = require('../models/PriceSettings');

/**
 * POST /api/recommend
 * Body:
 * {
 *   "areaHa": 1.0,
 *   "targets": { "N":120, "P2O5":40, "K2O":40 }
 * }
 */
exports.recommend = async (req, res) => {
  try {
    const { areaHa = 1, targets = {} } = req.body || {};
    const ha = Math.max(Number(areaHa) || 1, 0.1);

    // Convert to elemental N, P, K
    const N_req_ha = Number(targets.N ?? 120);
    const P_req_ha = targets.P != null
      ? Number(targets.P)
      : (targets.P2O5 != null ? Number(targets.P2O5) * 0.436 : 17.44); // 40*0.436 default
    const K_req_ha = targets.K != null
      ? Number(targets.K)
      : (targets.K2O != null ? Number(targets.K2O) * 0.830 : 33.2);   // 40*0.83 default

    // Nutrient needs for entire area
    let N_need = N_req_ha * ha;
    let P_need = P_req_ha * ha;
    let K_need = K_req_ha * ha;

    // Load fertilizer prices
    const doc = await PriceSettings.ensureSeeded();
    const items = doc.items || new Map();

    const getItem = (code) => {
      const raw = items.get ? items.get(code) : items[code];
      if (!raw) return null;
      return {
        code,
        label: raw.label,
        pricePerBag: Number(raw.pricePerBag || 0),
        bagKg: Number(raw.bagKg || 50),
        npk: raw.npk || { N: 0, P: 0, K: 0 },
        active: !!raw.active,
      };
    };

    const DAP = getItem('DAP_18_46_0');
    const MOP = getItem('MOP_0_0_60');
    const UREA = getItem('UREA_46_0_0');

    const perBag = (item) => ({
      N: item ? (item.bagKg * (item.npk.N / 100)) : 0,
      P: item ? (item.bagKg * (item.npk.P / 100)) : 0,
      K: item ? (item.bagKg * (item.npk.K / 100)) : 0,
    });

    const plan = {};
    let totalCost = 0;

    // 1️⃣ Meet P need with DAP
    if (DAP && DAP.active && P_need > 0) {
      const pb = perBag(DAP);
      const bags = P_need / pb.P;
      plan[DAP.code] = {
        ...DAP,
        bags: round1(bags),
        lineCost: round2(bags * DAP.pricePerBag),
      };
      totalCost += plan[DAP.code].lineCost;
      N_need -= bags * pb.N;
      P_need -= bags * pb.P;
      K_need -= bags * pb.K;
    }

    // 2️⃣ Meet K need with MOP
    if (MOP && MOP.active && K_need > 0) {
      const pb = perBag(MOP);
      const bags = K_need / pb.K;
      plan[MOP.code] = {
        ...MOP,
        bags: round1(bags),
        lineCost: round2(bags * MOP.pricePerBag),
      };
      totalCost += plan[MOP.code].lineCost;
      N_need -= bags * pb.N;
      P_need -= bags * pb.P;
      K_need -= bags * pb.K;
    }

    // 3️⃣ Top-up N with Urea
    if (UREA && UREA.active && N_need > 0) {
      const pb = perBag(UREA);
      const bags = N_need / pb.N;
      plan[UREA.code] = {
        ...UREA,
        bags: round1(bags),
        lineCost: round2(bags * UREA.pricePerBag),
      };
      totalCost += plan[UREA.code].lineCost;
    }

    const lines = Object.values(plan).map((x) => ({
      code: x.code,
      label: x.label,
      pricePerBag: x.pricePerBag,
      bags: x.bags,
      lineCost: x.lineCost,
    }));

    res.json({
      ok: true,
      areaHa: ha,
      currency: doc.currency || 'PHP',
      totalCost: round2(totalCost),
      lines,
      leftover: {
        N: round2(Math.max(N_need, 0)),
        P: round2(Math.max(P_need, 0)),
        K: round2(Math.max(K_need, 0)),
      },
      updatedAt: doc.updatedAt,
    });
  } catch (err) {
    console.error('[recommend] error:', err);
    res.status(500).json({ error: 'Failed to compute recommendation' });
  }
};

function round1(v) {
  return Math.round(v * 10) / 10;
}
function round2(v) {
  return Math.round(v * 100) / 100;
}
