// models/Farmer.js
const mongoose = require('mongoose');

const ReadingSchema = new mongoose.Schema(
  {
    source: { type: String, default: 'esp32' }, // or 'manual'
    n: Number,
    p: Number,
    k: Number,
    ph: Number,
    moisture: Number,
    ec: Number,
    temperature: Number,
    raw: mongoose.Schema.Types.Mixed, // optional: keep full ESP32 payload
  },
  { timestamps: true }
);

const FarmerSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Types.ObjectId, ref: 'User', index: true, required: true },
    name: { type: String, required: true, trim: true },
    farmLocation: { type: String, default: '', trim: true },
    cropType: { type: String, enum: ['', 'hybrid', 'inbred', 'pareho'], default: '' },
    cropStyle: { type: String, enum: ['', 'irrigated', 'rainfed', 'pareho'], default: '' },
    landAreaHa: { type: Number, default: 0 },
    code: { type: String, default: '', trim: true },

    // NEW: history of soil measurements
    readings: { type: [ReadingSchema], default: [] },
  },
  { timestamps: true }
);

// Unique code per owner (optional but useful)
FarmerSchema.index({ ownerId: 1, code: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Farmer', FarmerSchema);
