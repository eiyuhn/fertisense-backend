// models/Reading.js
const mongoose = require('mongoose');

const FertilizerPlanSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    cost: { type: String, default: '' },
    details: { type: [String], default: [] },
  },
  { _id: false }
);

const readingSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // link this reading to a specific farmer (optional)
    farmerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', default: null },

    source: { type: String, enum: ['esp32', 'manual'], default: 'manual' },

    N: { type: Number, default: 0 },
    P: { type: Number, default: 0 },
    K: { type: Number, default: 0 },
    pH: { type: Number, default: null },

    // ✅ stored narrative for History screen
    recommendationText: { type: String, default: '' },
    englishText: { type: String, default: '' },
    currency: { type: String, default: 'PHP' },

    // ✅ stored plan list (History screen expects this)
    fertilizerPlans: { type: [FertilizerPlanSchema], default: [] },

    // ✅ optional DA debug/store (safe even if you don’t use it yet)
    daSchedule: { type: mongoose.Schema.Types.Mixed, default: null },
    daCost: { type: mongoose.Schema.Types.Mixed, default: null },
    npkClass: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Reading', readingSchema);
