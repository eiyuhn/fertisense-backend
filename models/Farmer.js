// fertisense-backend/fertisense-backend/models/Farmer.js
const mongoose = require('mongoose');

const farmerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },       // Pangalan ng Magsasaka
    farmLocation: { type: String, default: '', trim: true },  // Lokasyon ng Sakahan
    farmSizeHa: { type: Number, min: 0 },                     // Laki ng Sakahan (hectares)
    riceType: {                                               // Uri ng Palay
      type: String,
      enum: ['hybrid', 'inbred', 'pareho'],
      default: 'pareho',
    },
    plantingStyle: {                                          // Estilo ng Pagtatanim
      type: String,
      enum: ['irrigated', 'rainfed', 'pareho'],
      default: 'pareho',
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // admin who created
  },
  { timestamps: true }
);

// quick text search on name/location
farmerSchema.index({ name: 'text', farmLocation: 'text' });

module.exports = mongoose.model('Farmer', farmerSchema);
