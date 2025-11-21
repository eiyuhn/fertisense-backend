// models/Reading.js
const mongoose = require('mongoose');

const readingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // 🔹 NEW: link this reading to a specific farmer
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
  },
  { timestamps: true }
);

module.exports = mongoose.model('Reading', readingSchema);
