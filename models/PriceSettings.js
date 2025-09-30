// fertisense-backend/models/PriceSettings.js
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
    // Map<string, PriceItem>
    items: { type: Map, of: PriceItemSchema, default: undefined },
  },
  { timestamps: true }
);

// Seed a default document if none exists
PriceSettingsSchema.statics.ensureSeeded = async function () {
  let doc = await this.findOne({ key: 'current' });
  if (!doc) {
    doc = await this.create({
      key: 'current',
      currency: 'PHP',
      items: new Map([
        ['UREA_46_0_0', {
          label: 'Urea 46-0-0',
          pricePerBag: 1500,
          bagKg: 50,
          npk: { N: 46, P: 0, K: 0 },
          active: true,
        }],
        ['COMPLETE_14_14_14', {
          label: 'Complete 14-14-14',
          pricePerBag: 1700,
          bagKg: 50,
          npk: { N: 14, P: 14, K: 14 },
          active: true,
        }],
        ['MOP_0_0_60', {
          label: 'Muriate of Potash 0-0-60',
          pricePerBag: 1800,
          bagKg: 50,
          npk: { N: 0, P: 0, K: 60 },
          active: true,
        }],
        ['DAP_18_46_0', {
          label: 'DAP 18-46-0',
          pricePerBag: 2200,
          bagKg: 50,
          npk: { N: 18, P: 46, K: 0 },
          active: true,
        }],
        ['SSP_0_18_0', {
          label: 'SSP 0-18-0',
          pricePerBag: 1400,
          bagKg: 50,
          npk: { N: 0, P: 18, K: 0 },
          active: true,
        }],
      ]),
    });
  }
  return doc;
};

module.exports = mongoose.model('PriceSettings', PriceSettingsSchema);
