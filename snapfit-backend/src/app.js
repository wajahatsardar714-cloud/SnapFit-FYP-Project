const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const apiKeyRoutes = require('./routes/apiKeyRoutes');
const sizeChartRoutes = require('./routes/sizeChartRoutes');
const productMappingRoutes = require('./routes/productMappingRoutes');
const recommendRoutes = require('./routes/recommendRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/merchant/api-key', apiKeyRoutes);
app.use('/api/charts', sizeChartRoutes);
app.use('/api/products', productMappingRoutes);
app.use('/api/recommend', recommendRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/feedback', feedbackRoutes);

module.exports = app;
