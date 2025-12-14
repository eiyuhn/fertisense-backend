// controllers/priceController.js
const PriceSettings = require('../models/PriceSettings');

// helper: parse npk from "46-0-0" OR "UREA_46_0_0" OR "NPK_14_14_14"
function parseNpkAny(text) {
  const s = String(text || '').toUpperCase();

  // dash style: 46-0-0 or 46 – 0 – 0
  let m = s.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s*[-–]\s*(\d{1,2})/);
  if (m) return { N: Number(m[1]), P: Number(m[2]), K: Number(m[3]) };

  // underscore style: UREA_46_0_0, NPK_14_14_14
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

function toSafeNpk(v) {
  return {
    N: Number(v?.N || 0),
    P: Number(v?.P || 0),
    K: Number(v?.K || 0),
  };
}

/**
 * ✅ Extract NPK robustly:
 * - from rawCode
 * - from label
 * - from label that is actually a code (ex: "UREA_46_0_0")
 * - fallback to rawVal.npk
 */
function detectNpk(rawCode, rawLabel, rawVal) {
  return (
    parseNpkAny(rawCode) ||
    parseNpkAny(rawLabel) ||
    // label might be "UREA_46_0_0" (contains underscore triple)
    parseNpkAny(String(rawLabel).replace(/\s+/g, '_')) ||
    // if client sends npk (but maybe wrong), accept it as last fallback
    (rawVal?.npk ? toSafeNpk(rawVal.npk) : null)
  );
}

/**
 * PUBLIC
 * GET /api/prices
 */
exports.getPublicPrices = async (_req, res) => {
  try {
    const doc = await PriceSettings.ensureSeeded();

    res.json({
      currency: doc.currency,
      items: Object.fromEntries([...doc.items.entries()].map(([k, v]) => [k, v])),
      updatedAt: doc.updatedAt,
    });
  } catch (e) {
    console.error('[getPublicPrices]', e);
    res.status(500).json({ error: 'Failed to load prices' });
  }
};

/**
 * ADMIN
 * GET /api/prices/admin
 */
exports.getAdminPrices = async (_req, res) => {
  try {
    const doc = await PriceSettings.ensureSeeded();
    res.json(doc);
  } catch (e) {
    console.error('[getAdminPrices]', e);
    res.status(500).json({ error: 'Failed to load admin prices' });
  }
};

/**
 * ADMIN
 * PUT /api/prices/admin
 * Fixes:
 * - Canonicalizes keys (UREA_46_0_0 etc.)
 * - Repairs wrong npk (e.g. NPK_0_0_0 with label UREA_46_0_0)
 * - Ensures DA/Alternatives always have prices via ensureSeeded() merge
 */
exports.updateAdminPrices = async (req, res) => {
  try {
    const { items, currency } = req.body || {};
    const doc = await PriceSettings.ensureSeeded();

    if (currency) doc.currency = String(currency).toUpperCase();

    if (items && typeof items === 'object') {
      const next = new Map();

      for (const [rawCode, rawVal] of Object.entries(items)) {
        if (!rawVal) continue;

        const rawLabel = String(rawVal.label || rawCode).trim();

        // ✅ detect npk from code OR label OR label-as-code OR fallback rawVal.npk
        const parsed = detectNpk(rawCode, rawLabel, rawVal);

        // ✅ decide canonical key
        const canonCode =
          canonicalKeyFromNpk(parsed) ||
          String(rawCode).replace(/\s+/g, '_').toUpperCase();

        next.set(canonCode, {
          label: rawLabel,
          pricePerBag: Number(rawVal.pricePerBag || 0),
          bagKg: Number(rawVal.bagKg || 50),
          npk: parsed ? toSafeNpk(parsed) : { N: 0, P: 0, K: 0 },
          active: rawVal.active !== false,
        });
      }

      doc.items = next;
    }

    await doc.save();

    // ✅ IMPORTANT: repair + merge required defaults (DAP/MOP/etc) after save
    const finalDoc = await PriceSettings.ensureSeeded();
    res.json(finalDoc);
  } catch (e) {
    console.error('[updateAdminPrices]', e);
    res.status(500).json({ error: 'Failed to update prices' });
  }
};
