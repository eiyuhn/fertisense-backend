const mongoose = require('mongoose');

const FarmerSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Types.ObjectId, ref: 'User', index: true, required: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, default: '', trim: true },
    farmLocation: { type: String, default: '', trim: true },
    mobile: { type: String, default: '', trim: true },
    cropType: { type: String, enum: ['', 'hybrid', 'inbred', 'pareho'], default: '' },
    cropStyle: { type: String, enum: ['', 'irrigated', 'rainfed', 'pareho'], default: '' },
    landAreaHa: { type: Number, default: 0 },
    code: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

// Optional but recommended: unique code per owner
FarmerSchema.index({ ownerId: 1, code: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Farmer', FarmerSchema);
