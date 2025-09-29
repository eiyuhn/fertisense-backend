const mongoose = require('mongoose');

const farmerSchema = new mongoose.Schema(
  {
    // who created/owns this farmer card (usually admin user)
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    name: { type: String, required: true },
    address: { type: String, default: '' },
    farmLocation: { type: String, default: '' },
    mobile: { type: String, default: '' },

    // optional extra fields you already collect in the app
    cropType: { type: String, enum: ['hybrid', 'inbred', 'pareho', '', null], default: '' },
    cropStyle: { type: String, enum: ['irrigated', 'rainfed', 'pareho', '', null], default: '' },
    landAreaHa: { type: Number, default: 0 }, // hectares, optional
    code: { type: String, index: true },      // your generated farmer code (optional)
  },
  { timestamps: true }
);

module.exports = mongoose.model('Farmer', farmerSchema);
