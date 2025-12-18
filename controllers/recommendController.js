
const PriceSettings = require('../models/PriceSettings');


const ALLOW_COST_ONLY = String(process.env.ALLOW_COST_ONLY || '').toLowerCase() === 'true';


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

  // 4) match by label containing the same dash code OR by stored item.npk
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

  add('BASAL', schedule?.basal || []);
  add('30 DAT', schedule?.after30DAT || []);
  add('TOPDRESS', schedule?.topdress60DBH || []);

  return { currency: priceDoc.currency, rows, total };
}

function hasMissingPrices(cost) {
  return (cost?.rows || []).some((r) => r.pricePerBag == null);
}

// ---------- controller ----------
// ✅ DEFAULT BEHAVIOR: DISABLED (prevents backend from overriding frontend logic)
exports.recommend = async (req, res) => {
  try {
    // ✅ if you want backend to ONLY compute costs for plans that frontend already computed
    // send: { areaHa, plans: [{ id, label, schedule: {basal, after30DAT, topdress60DBH} }] }
    if (ALLOW_COST_ONLY && Array.isArray(req.body?.plans)) {
      const { areaHa = 1, plans = [] } = req.body;

      const priceDoc = await PriceSettings.ensureSeeded();

      const out = plans.map((p, idx) => {
        const schedule = p?.schedule || {};
        const cost = calcScheduleCost(schedule, priceDoc, areaHa);

        return {
          id: p?.id || `PLAN_${idx + 1}`,
          title: String(p?.title || 'Fertilizer Plan'),
          label: String(p?.label || `Plan ${idx + 1}`),
          isDa: Boolean(p?.isDa),
          isCheapest: false,
          schedule,
          cost,
        };
      });

      // cheapest sort (missing prices go last)
      out.sort((a, b) => {
        const am = hasMissingPrices(a.cost);
        const bm = hasMissingPrices(b.cost);
        if (am !== bm) return am ? 1 : -1;
        return (
          Number(a?.cost?.total ?? Number.POSITIVE_INFINITY) -
          Number(b?.cost?.total ?? Number.POSITIVE_INFINITY)
        );
      });

      out.forEach((p) => (p.isCheapest = false));
      if (out.length) out[0].isCheapest = true;

      return res.json({
        ok: true,
        mode: 'COST_ONLY',
        input: { areaHa: Number(areaHa || 1), planCount: out.length },
        plans: out,
        note: 'Backend computed costs only. Fertilizer recommendation logic is handled in the mobile app.',
      });
    }

    // ✅ otherwise: disable endpoint entirely
    return res.status(410).json({
      ok: false,
      error:
        'Backend fertilizer recommendation is disabled. Recommendation is computed in the mobile app based on selected options.',
      hint:
        'If you need backend cost computation only, set ALLOW_COST_ONLY=true in .env and POST { areaHa, plans:[{schedule:...}] }',
    });
  } catch (err) {
    console.error('[recommend]', err);
    return res.status(500).json({ ok: false, error: 'Recommendation failed' });
  }
};
