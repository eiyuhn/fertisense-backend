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

// helpers
function parseNpkFromText(text) {
  const s = String(text || '');
  const m = s.match(/(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})/);
  if (!m) return null;
  return { N: Number(m[1]), P: Number(m[2]), K: Number(m[3]) };
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
  return !npk || (Number(npk.N || 0) === 0 && Number(npk.P || 0) === 0 && Number(npk.K || 0) === 0);
}

PriceSettingsSchema.statics.ensureSeeded = async function () {
  let doc = await this.findOne({ key: 'current' });

  if (!doc) {
    doc = await this.create({
      key: 'current',
      currency: 'PHP',
      items: new Map([
        ['UREA_46_0_0', { label: 'Urea (46-0-0)', pricePerBag: 1530, bagKg: 50, npk: { N: 46, P: 0, K: 0 }, active: true }],
        ['DAP_18_46_0', { label: '18-46-0 (DAP)', pricePerBag: 2380, bagKg: 50, npk: { N: 18, P: 46, K: 0 }, active: true }],
        ['NPK_14_14_14', { label: '14-14-14 (Complete)', pricePerBag: 1435, bagKg: 50, npk: { N: 14, P: 14, K: 14 }, active: true }],
        ['MOP_0_0_60', { label: '0-0-60 (MOP)', pricePerBag: 1345, bagKg: 50, npk: { N: 0, P: 0, K: 60 }, active: true }],
        ['NPK_16_20_0', { label: '16-20-0', pricePerBag: 1335, bagKg: 50, npk: { N: 16, P: 20, K: 0 }, active: true }],
        ['AMMOSUL_21_0_0', { label: '21-0-0 (Ammosul)', pricePerBag: 680, bagKg: 50, npk: { N: 21, P: 0, K: 0 }, active: true }],
      ]),
    });
    return doc;
  }

  // auto-repair
  const cur = doc.items instanceof Map ? doc.items : new Map(Object.entries(doc.items || {}));
  const next = new Map();
  let changed = false;

  for (const [rawKey, rawVal] of cur.entries()) {
    if (!rawVal) continue;

    const label = String(rawVal.label || rawKey);

    let npk = rawVal.npk;
    if (npkLooksEmpty(npk)) {
      const parsed = parseNpkFromText(rawKey) || parseNpkFromText(label);
      if (parsed) {
        npk = parsed;
        changed = true;
      }
    }

    const canon = canonicalKeyFromNpk(npk) || String(rawKey).replace(/\s+/g, '_').toUpperCase();
    if (canon !== rawKey) changed = true;

    next.set(canon, {
      label,
      pricePerBag: Number(rawVal.pricePerBag || 0),
      bagKg: Number(rawVal.bagKg || 50),
      npk: {
        N: Number(npk?.N || 0),
        P: Number(npk?.P || 0),
        K: Number(npk?.K || 0),
      },
      active: rawVal.active !== false,
    });
  }

  if (changed) {
    doc.items = next;
    await doc.save();
  }

  return doc;
};

module.exports = mongoose.model('PriceSettings', PriceSettingsSchema);
