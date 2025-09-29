const mongoose = require('mongoose');

const farmerSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    address: { type: String, default: '' },
    farmLocation: { type: String, default: '' },
    mobile: { type: String, default: '' },
    cropType: { type: String, enum: ['hybrid', 'inbred', 'pareho', ''], default: '' },
    cropStyle: { type: String, enum: ['irrigated', 'rainfed', 'pareho', ''], default: '' },
    landAreaHa: { type: Number, default: 0 },
    code: { type: String, index: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Farmer', farmerSchema);
