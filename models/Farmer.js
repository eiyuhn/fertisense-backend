const mongoose = require('mongoose');

const ReadingSchema = new mongoose.Schema(
  {
    source: { type: String, enum: ['esp32', 'manual'], default: 'esp32' },
    n: { type: Number, required: true },
    p: { type: Number, required: true },
    k: { type: Number, required: true },
    ph: { type: Number, default: null },
    moisture: { type: Number, default: null },
    raw: mongoose.Schema.Types.Mixed,
    batchId: { type: String, default: null },
  },
  { timestamps: true }
);

const SummarySchema = new mongoose.Schema({
  batchId: String,
  count: Number,
  meta: mongoose.Schema.Types.Mixed,
  avg: mongoose.Schema.Types.Mixed,
  min: mongoose.Schema.Types.Mixed,
  max: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const FarmerSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Types.ObjectId, ref: 'User', index: true, required: true },
    name: { type: String, required: true, trim: true },
    farmLocation: { type: String, default: '', trim: true },
    cropType: { type: String, enum: ['', 'hybrid', 'inbred', 'pareho'], default: '' },
    cropStyle: { type: String, enum: ['', 'irrigated', 'rainfed', 'pareho'], default: '' },
    landAreaHa: { type: Number, default: 0 },
    code: { type: String, trim: true, default: undefined },
    readings: { type: [ReadingSchema], default: [] },
    readingSummaries: { type: [SummarySchema], default: [] }
  },
  { timestamps: true }
);

FarmerSchema.index({ ownerId: 1, code: 1 }, { unique: true, sparse: true });
module.exports = mongoose.model('Farmer', FarmerSchema);
