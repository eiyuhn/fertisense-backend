// models/Farmer.js
const mongoose = require('mongoose');

const ReadingSchema = new mongoose.Schema(
  {
    source: { type: String, enum: ['esp32', 'manual'], default: 'esp32' },
    // Only NPK + pH
    n: { type: Number, required: true },
    p: { type: Number, required: true },
    k: { type: Number, required: true },
    ph: { type: Number, default: null },
    // Keep raw for debugging/ESP32 payload if you like
    raw: mongoose.Schema.Types.Mixed,
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

    // IMPORTANT: undefined (not empty string) so the sparse unique index works
    code: { type: String, trim: true, default: undefined },

    // Embedded readings (only NPK + pH)
    readings: { type: [ReadingSchema], default: [] },
  },
  { timestamps: true }
);

// Unique per owner when code exists
FarmerSchema.index({ ownerId: 1, code: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Farmer', FarmerSchema);
