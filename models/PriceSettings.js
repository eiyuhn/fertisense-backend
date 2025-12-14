// models/PriceSettings.js
const mongoose = require('mongoose');

const PriceItemSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    pricePerBag: { type: Number, required: true, min: 0 },
    bagKg: { type: Number, default: 50 },
    npk: {
      N: { type: Number, default: 0 },
      P: { type: Number, default: 0 },
      K: { type: Number, default: 0 },
    },
    active: { type: Boolean, default: true },
  },
  { _id: false }
);

const PriceSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: 'current' },
    currency: { type: String, default: 'PHP' },
    items: { type: Map, of: PriceItemSchema, default: undefined },
  },
  { timestamps: true }
);

// ---------- helpers ----------

// ✅ parse NPK from: "46-0-0", "46 – 0 – 0", "UREA_46_0_0", "NPK_14_14_14"
function parseNpkAny(text) {
  const s = String(text || '').toUpperCase();

  // dash: 46-0-0 or 46 – 0 – 0
  let m = s.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s*[-–]\s*(\d{1,2})/);
  if (m) return { N: Number(m[1]), P: Number(m[2]), K: Number(m[3]) };

  // underscore: UREA_46_0_0 / NPK_14_14_14 / DAP_18_46_0 / MOP_0_0_60
  m = s.match(/(\d{1,2})_(\d{1,2})_(\d{1,2})/);
  if (m) return { N: Number(m[1]), P: Number(m[2]), K: Number(m[3]) };

  return null;
}

function canonicalKeyFromNpk(npk) {
  if (!npk) return null;
  const N = Number(npk.N || 0);
  const P = Number(npk.P || 0);
  const K = Number(npk.K || 0);

  if (N === 46 && P === 0 && K === 0) return 'UREA_46_0_0';
  if (N === 18 && P === 46 && K === 0) return 'DAP_18_46_0';
  if (N === 0 && P === 0 && K === 60) return 'MOP_0_0_60';
  if (N === 21 && P === 0 && K === 0) return 'AMMOSUL_21_0_0';
  if (N === 16 && P === 20 && K === 0) return 'NPK_16_20_0';
  if (N === 14 && P === 14 && K === 14) return 'NPK_14_14_14';

  return `NPK_${N}_${P}_${K}`;
}

function npkLooksEmpty(npk) {
  return (
    !npk ||
    (Number(npk.N || 0) === 0 &&
      Number(npk.P || 0) === 0 &&
      Number(npk.K || 0) === 0)
  );
}

// ✅ REQUIRED fertilizers for your DA + alternatives (must exist)
const REQUIRED_DEFAULTS = new Map([
  [
    'UREA_46_0_0',
    {
      label: 'Urea (46-0-0)',
      pricePerBag: 1530,
      bagKg: 50,
      npk: { N: 46, P: 0, K: 0 },
      active: true,
    },
  ],
  [
    'DAP_18_46_0',
    {
      label: '18-46-0 (DAP)',
      pricePerBag: 2380,
      bagKg: 50,
      npk: { N: 18, P: 46, K: 0 },
      active: true,
    },
  ],
  [
    'MOP_0_0_60',
    {
      label: '0-0-60 (MOP)',
      pricePerBag: 1345,
      bagKg: 50,
      npk: { N: 0, P: 0, K: 60 },
      active: true,
    },
  ],
  [
    'AMMOSUL_21_0_0',
    {
      label: '21-0-0 (Ammosul)',
      pricePerBag: 680,
      bagKg: 50,
      npk: { N: 21, P: 0, K: 0 },
      active: true,
    },
  ],
  [
    'NPK_16_20_0',
    {
      label: '16-20-0',
      pricePerBag: 1335,
      bagKg: 50,
      npk: { N: 16, P: 20, K: 0 },
      active: true,
    },
  ],
  [
    'NPK_14_14_14',
    {
      label: '14-14-14 (Complete)',
      pricePerBag: 1435,
      bagKg: 50,
      npk: { N: 14, P: 14, K: 14 },
      active: true,
    },
  ],
]);

/**
 * ✅ infer NPK from:
 * - rawKey (like UREA_46_0_0)
 * - label (like "Urea (46-0-0)")
 * - label that is actually a code (like "UREA_46_0_0")
 */
function inferNpk(rawKey, label) {
  return (
    parseNpkAny(rawKey) ||
    parseNpkAny(label) ||
    // label is sometimes a code string (ex: "UREA_46_0_0")
    parseNpkAny(String(label || '').replace(/\s+/g, '_'))
  );
}

PriceSettingsSchema.statics.ensureSeeded = async function () {
  let doc = await this.findOne({ key: 'current' });

  // 1) create if missing
  if (!doc) {
    doc = await this.create({
      key: 'current',
      currency: 'PHP',
      items: new Map([...REQUIRED_DEFAULTS.entries()]),
    });
    return doc;
  }

  // 2) normalize current map
  const cur =
    doc.items instanceof Map ? doc.items : new Map(Object.entries(doc.items || {}));

  const next = new Map();
  let changed = false;

  for (const [rawKey, rawVal] of cur.entries()) {
    if (!rawVal) continue;

    const label = String(rawVal.label || rawKey);

    // ✅ infer/repair npk (even if it says 0-0-0 but label/key suggests otherwise)
    let npk = rawVal.npk;

    const inferred = inferNpk(rawKey, label);
    if (npkLooksEmpty(npk) && inferred) {
      npk = inferred;
      changed = true;
    }

    // ✅ KEY REPAIR:
    // If key is wrong (ex: NPK_0_0_0) but inferred triple exists → fix key
    let canon = canonicalKeyFromNpk(npk);
    if (!canon && inferred) canon = canonicalKeyFromNpk(inferred);

    // fallback: normalize rawKey
    if (!canon) canon = String(rawKey).replace(/\s+/g, '_').toUpperCase();

    if (canon !== rawKey) changed = true;

    // ✅ Avoid keeping a bogus NPK_0_0_0 entry when we can classify it
    // (if inferred exists, canon won't be NPK_0_0_0)
    next.set(canon, {
      label,
      pricePerBag: Number(rawVal.pricePerBag || 0),
      bagKg: Number(rawVal.bagKg || 50),
      npk: {
        N: Number((npk || inferred)?.N || 0),
        P: Number((npk || inferred)?.P || 0),
        K: Number((npk || inferred)?.K || 0),
      },
      active: rawVal.active !== false,
    });
  }

  // 3) ✅ MERGE REQUIRED DEFAULTS if missing (fixes missing DAP/MOP/UREA/etc.)
  for (const [k, v] of REQUIRED_DEFAULTS.entries()) {
    if (!next.has(k)) {
      next.set(k, v);
      changed = true;
    }
  }

  // 4) ✅ If there is still an NPK_0_0_0 entry, drop it (it is always garbage for your app)
  // (Keeps DB clean and stops “free” totals.)
  if (next.has('NPK_0_0_0')) {
    next.delete('NPK_0_0_0');
    changed = true;
  }

  if (changed) {
    doc.items = next;
    await doc.save();
  }

  return doc;
};

module.exports = mongoose.model('PriceSettings', PriceSettingsSchema);
