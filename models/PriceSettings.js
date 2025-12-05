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
    items: { type: Map, of: PriceItemSchema, default: undefined },
  },
  { timestamps: true }
);


PriceSettingsSchema.statics.ensureSeeded = async function () {
  let doc = await this.findOne({ key: 'current' });

  if (!doc) {
    doc = await this.create({
      key: 'current',
      currency: 'PHP',
      items: new Map([
        // 46-0-0 (Urea)
        [
          'UREA_46_0_0',
          {
            label: 'Urea (46-0-0)',
            pricePerBag: 1530, // from LGU list
            bagKg: 50,
            npk: { N: 46, P: 0, K: 0 },
            active: true,
          },
        ],

        // 18-46-0 (DAP)
        [
          'DAP_18_46_0',
          {
            label: '18-46-0 (DAP)',
            pricePerBag: 2380, // from LGU list
            bagKg: 50,
            npk: { N: 18, P: 46, K: 0 },
            active: true,
          },
        ],

        // 14-14-14 (Complete)
        [
          'NPK_14_14_14',
          {
            label: '14-14-14',
            pricePerBag: 1435,
            bagKg: 50,
            npk: { N: 14, P: 14, K: 14 },
            active: true,
          },
        ],

        // 0-0-60 (MOP)
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

        // 16-20-0 (LGU fertilizer)
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

        // 21-0-0 (Ammosul)
        [
          'AMMOSUL_21_0_0',
          {
            label: '21-0-0',
            pricePerBag: 680,
            bagKg: 50,
            npk: { N: 21, P: 0, K: 0 },
            active: true,
          },
        ],
      ]),
    });
  }

  return doc;
};

module.exports = mongoose.model('PriceSettings', PriceSettingsSchema);
