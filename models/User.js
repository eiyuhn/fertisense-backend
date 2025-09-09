const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String },
  address: { type: String },
  farmLocation: { type: String },
  mobile: { type: String },
  email: { type: String, unique: true, required: true, lowercase: true, trim: true },
  role: { type: String, enum: ["stakeholder", "admin"], default: "stakeholder" },
  passwordHash: { type: String, required: true }   // <<-- THIS MUST EXIST
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
