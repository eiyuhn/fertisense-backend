

PriceSettingsSchema.statics.ensureSeeded = async function () {
  let doc = await this.findOne({ key: 'current' });
  if (!doc) {
    doc = await this.create({
      key: 'current',
      currency: 'PHP',
      items: new Map([
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
          'NPK_14_14_14',
          {
            label: '14-14-14',
            pricePerBag: 1435,
            bagKg: 50,
            npk: { N: 14, P: 14, K: 14 },
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
