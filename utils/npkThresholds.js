// backend/utils/npkThresholds.js
// NOTE: These are sensor classification thresholds (ppm) — fill/adjust when you finalize.
// For now, you can still bypass classification by sending nClass/pClass/kClass directly.

const NPK_THRESHOLDS = {
  N: [
    // TODO: Replace these ppm ranges with your final N thresholds
    // Example placeholder only:
    { code: 'L', label: 'Low',    min: 0,   max: 40,  unit: 'ppm' },
    { code: 'M', label: 'Medium', min: 41,  max: 80,  unit: 'ppm' },
    { code: 'H', label: 'High',   min: 81,  max: null, unit: 'ppm' },
  ],
  P: [
    // TODO: Replace with your final P thresholds
    // Example placeholder only:
    { code: 'L', label: 'Low',    min: 0,  max: 10,  unit: 'ppm' },
    { code: 'M', label: 'Medium', min: 11, max: 20,  unit: 'ppm' },
    { code: 'H', label: 'High',   min: 21, max: null, unit: 'ppm' },
  ],
  K: [
    // Your current K thresholds (ppm)
    { code: 'L', label: 'Low',    min: 0,   max: 117, unit: 'ppm' },
    { code: 'M', label: 'Medium', min: 118, max: 235, unit: 'ppm' },
    { code: 'H', label: 'High',   min: 236, max: null, unit: 'ppm' },
  ],
};

function classifyNutrient(nutrient, value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;

  const ranges = NPK_THRESHOLDS[nutrient] || [];
  for (const r of ranges) {
    const aboveMin = r.min == null ? true : v >= r.min;
    const belowMax = r.max == null ? true : v <= r.max;
    if (aboveMin && belowMax) return r;
  }
  return null;
}

function classifyN(value) {
  return classifyNutrient('N', value)?.code || null;
}
function classifyP(value) {
  return classifyNutrient('P', value)?.code || null;
}
function classifyK(value) {
  return classifyNutrient('K', value)?.code || null;
}

module.exports = { NPK_THRESHOLDS, classifyNutrient, classifyN, classifyP, classifyK };
