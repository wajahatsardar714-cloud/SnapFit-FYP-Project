const mongoose = require('mongoose');

// Resolves true once connected, false when there is no database to use.
async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('MONGODB_URI not set — skipping database connection for now');
    return false;
  }

  try {
    await mongoose.connect(uri);
    console.log('MongoDB connected');
    return true;
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    return false;
  }
}

module.exports = connectDB;
