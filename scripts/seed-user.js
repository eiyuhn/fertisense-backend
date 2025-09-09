// scripts/seed-user.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');

(async () => {
  try {
    const [emailArg, passArg] = process.argv.slice(2);
    if (!emailArg || !passArg) {
      console.log('Usage: node scripts/seed-user.js <email> <password>');
      process.exit(1);
    }
    const email = String(emailArg).toLowerCase().trim();
    const passwordHash = await bcrypt.hash(passArg, 10);

    await mongoose.connect(process.env.MONGODB_URI);

    const up = await User.findOneAndUpdate(
      { email },
      { $set: { email, passwordHash, role: 'stakeholder', name: 'Donna' } },
      { new: true, upsert: true }
    );

    console.log('Seeded user:', { id: up._id.toString(), email: up.email, hasHash: !!up.passwordHash });
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error('Seed error:', e.message);
    process.exit(1);
  }
})();
