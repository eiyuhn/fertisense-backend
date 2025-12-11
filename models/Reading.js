// models/Reading.js
const mongoose = require('mongoose');

const readingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // link this reading to a specific farmer
    farmerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Farmer',
    },

    source: {
      type: String,
      enum: ['esp32', 'manual'],
      default: 'manual',
    },

    N: Number,
    P: Number,
    K: Number,
    pH: Number,

    // NEW: store recommendation + plans so history is not only on the device
    recommendationText: { type: String },
    englishText: { type: String },
    currency: { type: String },

    fertilizerPlans: [
      {
        name: String,     // "LGU Option 1"
        cost: String,     // "PHP 12,345.67"
        details: [String] // ["Urea: 4.43 bags (221.50 kg)", ...]
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Reading', readingSchema);
