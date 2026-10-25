require('dotenv').config();

const app = require('./src/app');
const connectDB = require('./src/config/db');
const { ensureSuperAdmin } = require('./src/config/superAdmin');

const PORT = process.env.PORT || 5000;

connectDB().then(async (connected) => {
  if (connected) await ensureSuperAdmin();

  app.listen(PORT, () => {
    console.log(`snapfit-backend listening on port ${PORT}`);
  });
});
