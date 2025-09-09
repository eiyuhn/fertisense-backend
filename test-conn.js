require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  try {
    console.log('URI (masked):', process.env.MONGODB_URI.replace(/\/\/.*?:.*?@/, '//<user>:<pass>@'));
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    console.log('✅ Connected!');
    await mongoose.disconnect();
  } catch (e) {
    console.error('❌ Connect error:', e.message);
    process.exit(1);
  }
})();
