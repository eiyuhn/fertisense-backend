// fertisense-backend/fertisense-backend/scripts/seed-admin.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');

(async () => {
  try {
    const [emailArg, passArg, nameArg = 'Admin'] = process.argv.slice(2);
    if (!emailArg || !passArg) {
      console.log('Usage: node scripts/seed-admin.js <email> <password> [name]');
      process.exit(1);
    }
    const email = String(emailArg).toLowerCase().trim();
    const passwordHash = await bcrypt.hash(passArg, 10);

    await mongoose.connect(process.env.MONGODB_URI);
    const up = await User.findOneAndUpdate(
      { email },
      { $set: { email, passwordHash, role: 'admin', name: nameArg } },
      { new: true, upsert: true }
    );
    console.log('Seeded ADMIN:', { id: up._id.toString(), email: up.email, role: up.role });
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error('Seed admin error:', e.message);
    process.exit(1);
  }
})();
