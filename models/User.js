// models/User.js
const mongoose = require('mongoose');

const securityQuestionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    answerHash: { type: String, required: true },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    // 🔑 New unique login field
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    name: { type: String },
    address: { type: String },
    farmLocation: { type: String },
    mobile: { type: String },

    // Email is now OPTIONAL (not required for login)
    email: {
      type: String,
      unique: false,
      required: false,
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

    // 🔐 Security questions for password reset
    securityQuestions: {
      type: [securityQuestionSchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
