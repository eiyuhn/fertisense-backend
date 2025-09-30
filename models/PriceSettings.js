// fertisense-backend/models/PriceSetting.js
const mongoose = require('mongoose');

const PriceSettingSchema = new mongoose.Schema(
  {
    // One document to rule them all
    key: { type: String, unique: true, default: 'current' },

    currency: { type: String, default: 'PHP' }, // or 'DKK' etc.

    // Prices PER 50 kg bag (your recommendation logic uses 50 kg)
    items: {
      type: Map,
      of: new mongoose.Schema(
        {
          label: { type: String, required: true }, // e.g., "Urea 46-0-0"
          pricePerBag: { type: Number, required: true, min: 0 }, // PHP per 50 kg bag
          bagKg: { type: Number, default: 50 }, // keep 50 for consistency
          npk: {
            N: { type: Number, default: 0 }, // % nutrient
            P: { type: Number, default: 0 },
            K: { type: Number, default: 0 },
          },
          active: { type: Boolean, default: true },
        },
        { _id: false }
      ),
      default: () => ({
        // Sensible defaults (edit as you like)
        UREA_46_0_0: {
          label: 'Urea 46-0-0',
          pricePerBag: 1500,
          bagKg: 50,
          npk: { N: 46, P: 0, K: 0 },
          active: true,
        },
        COMPLETE_14_14_14: {
          label: 'Complete 14-14-14',
          pricePerBag: 1700,
          bagKg: 50,
          npk: { N: 14, P: 14, K: 14 },
          active: true,
        },
        MOP_0_0_60: {
          label: 'Muriate of Potash 0-0-60',
          pricePerBag: 1800,
          bagKg: 50,
          npk: { N: 0, P: 0, K: 60 },
          active: true,
        },
        DAP_18_46_0: {
          label: 'DAP 18-46-0',
          pricePerBag: 2200,
          bagKg: 50,
          npk: { N: 18, P: 46, K: 0 },
          active: true,
        },
      }),
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PriceSetting', PriceSettingSchema);
