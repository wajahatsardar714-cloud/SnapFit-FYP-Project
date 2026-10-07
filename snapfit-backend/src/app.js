const express = require('express');
const cors = require('cors');
const os = require('os');

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
const { PRODUCTS_DIR } = require('./utils/productImageUpload');

const app = express();

app.use(cors());
app.use(express.json());
// Persisted product flat-lay images (Phase 12 virtual try-on) — served by URL so
// both the dashboard and the AI microservice can fetch them.
app.use('/uploads/products', express.static(PRODUCTS_DIR));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Non-sensitive local-network hint for the QR-code phone handoff (Prompt: mobile
// capture handoff) -- lets the widget build a phone-reachable URL when the
// desktop page is loaded over "localhost", which a phone can never resolve.
// Virtual adapters (WSL/Hyper-V, Docker, VMs) and link-local 169.254.x addresses
// are never reachable from a phone, so skip them and prefer typical home/office
// LAN ranges -- otherwise the first adapter found (often vEthernet (WSL)) wins.
const VIRTUAL_ADAPTER_PATTERN = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|Docker|Loopback|Bluetooth/i;

function lanIpPriority(address) {
  if (address.startsWith('192.168.')) return 0;
  if (address.startsWith('10.')) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2;
  return 3;
}

app.get('/api/network-info', (req, res) => {
  const candidates = Object.entries(os.networkInterfaces())
    .filter(([name]) => !VIRTUAL_ADAPTER_PATTERN.test(name))
    .flatMap(([, addresses]) => addresses)
    .filter((iface) => iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254.'))
    .map((iface) => iface.address)
    .sort((a, b) => lanIpPriority(a) - lanIpPriority(b));
  res.json({ lanIp: candidates[0] || null });
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
