// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String },
    address: { type: String },
    farmLocation: { type: String },
    mobile: { type: String },
    email: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['stakeholder', 'admin', 'guest'],
      default: 'stakeholder',
    },
    passwordHash: { type: String, required: true },

    photoUrl: { type: String, default: '' },

    // 🔐 Forgot password fields
    resetCode: { type: String, default: null },
    resetCodeExpires: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
