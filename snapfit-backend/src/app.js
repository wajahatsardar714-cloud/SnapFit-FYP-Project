const express = require('express');
const cors = require('cors');
const os = require('os');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const apiKeyRoutes = require('./routes/apiKeyRoutes');
const merchantRoutes = require('./routes/merchantRoutes');
const sizeChartRoutes = require('./routes/sizeChartRoutes');
const productMappingRoutes = require('./routes/productMappingRoutes');
const recommendRoutes = require('./routes/recommendRoutes');
const tryOnRoutes = require('./routes/tryOnRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const handoffRoutes = require('./routes/handoffRoutes');

const app = express();

app.use(cors());
app.use(express.json());
// Persisted product flat-lay images (Phase 12 virtual try-on) — served by URL so
// both the dashboard and the AI microservice can fetch them.
app.use('/uploads/products', express.static(path.join(__dirname, '..', 'uploads', 'products')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Non-sensitive local-network hint for the QR-code phone handoff (Prompt: mobile
// capture handoff) -- lets the widget build a phone-reachable URL when the
// desktop page is loaded over "localhost", which a phone can never resolve.
app.get('/api/network-info', (req, res) => {
  const interfaces = os.networkInterfaces();
  const lanIp = Object.values(interfaces)
    .flat()
    .find((iface) => iface.family === 'IPv4' && !iface.internal)?.address;
  res.json({ lanIp: lanIp || null });
});

app.use('/api/auth', authRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/merchant/api-key', apiKeyRoutes);
app.use('/api/merchant', merchantRoutes);
app.use('/api/charts', sizeChartRoutes);
app.use('/api/products', productMappingRoutes);
app.use('/api/recommend', recommendRoutes);
app.use('/api/try-on', tryOnRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/handoff', handoffRoutes);

module.exports = app;
