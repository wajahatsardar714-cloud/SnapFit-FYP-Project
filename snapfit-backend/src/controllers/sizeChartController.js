const SizeChart = require('../models/SizeChart');
const Merchant = require('../models/Merchant');
const { PLANS } = require('./subscriptionController');

const MEASUREMENT_KEYS = ['chest', 'waist', 'hip', 'shoulderWidth', 'torsoLength', 'inseam'];

function validateChartData({ name, category, sizes }) {
  const errors = [];

  if (!name || !String(name).trim()) {
    errors.push('Chart name is required');
  }

  const allowedCategories = SizeChart.schema.path('category').enumValues;
  if (!allowedCategories.includes(category)) {
    errors.push(`Category must be one of: ${allowedCategories.join(', ')}`);
  }

  if (!Array.isArray(sizes) || sizes.length < 2) {
    errors.push('At least 2 sizes are required');
    return errors;
  }

  sizes.forEach((size, index) => {
    const sizeLabel = size?.label && String(size.label).trim();
    if (!sizeLabel) {
      errors.push(`Size #${index + 1} is missing a label`);
    }

    const measurements = size?.measurements || {};
    MEASUREMENT_KEYS.forEach((key) => {
      const range = measurements[key];
      if (!range || range.min == null || range.max == null) return;

      if (range.min < 0) {
        errors.push(`${sizeLabel || `Size #${index + 1}`}: ${key} min cannot be negative`);
      }
      if (range.max <= range.min) {
        errors.push(`${sizeLabel || `Size #${index + 1}`}: ${key} max must be greater than min`);
      }
    });
  });

  MEASUREMENT_KEYS.forEach((key) => {
    const entries = sizes
      .map((size) => ({ label: size?.label, range: size?.measurements?.[key] }))
      .filter((entry) => entry.range && entry.range.min != null && entry.range.max != null)
      .sort((a, b) => a.range.min - b.range.min);

    for (let i = 1; i < entries.length; i += 1) {
      const prev = entries[i - 1];
      const curr = entries[i];
      if (curr.range.min > prev.range.max) {
        errors.push(
          `Gap in ${key} measurements between "${prev.label}" (up to ${prev.range.max}) and "${curr.label}" (from ${curr.range.min})`
        );
      }
    }
  });

  return errors;
}

async function createChart(req, res) {
  const errors = validateChartData(req.body);
  if (errors.length) {
    return res.status(400).json({ message: 'Validation failed', errors });
  }

  try {
    const merchant = await Merchant.findById(req.merchant.merchantId);
    if (!merchant) {
      return res.status(404).json({ message: 'Merchant not found' });
    }

    const chartsLimit = PLANS[merchant.subscription.plan]?.chartsLimit;
    if (chartsLimit != null) {
      const activeCount = await SizeChart.countDocuments({ merchantId: merchant._id, isActive: true });
      if (activeCount >= chartsLimit) {
        return res.status(403).json({
          message: `Your ${merchant.subscription.plan} plan allows up to ${chartsLimit} size chart${
            chartsLimit === 1 ? '' : 's'
          }. Upgrade to add more.`,
        });
      }
    }

    const { name, category, gender, unit, sizes } = req.body;
    const chart = await SizeChart.create({ merchantId: merchant._id, name, category, gender, unit, sizes });

    return res.status(201).json({ chart });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to create size chart', error: err.message });
  }
}

async function getCharts(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip = (page - 1) * limit;

    const filter = { merchantId: req.merchant.merchantId };
    if (req.query.category) {
      filter.category = req.query.category;
    }

    const [charts, total] = await Promise.all([
      SizeChart.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      SizeChart.countDocuments(filter),
    ]);

    return res.status(200).json({
      charts,
      pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch size charts', error: err.message });
  }
}

async function getChartById(req, res) {
  try {
    const chart = await SizeChart.findOne({ _id: req.params.id, merchantId: req.merchant.merchantId });
    if (!chart) {
      return res.status(404).json({ message: 'Size chart not found' });
    }

    return res.status(200).json({ chart });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(404).json({ message: 'Size chart not found' });
    }
    return res.status(500).json({ message: 'Failed to fetch size chart', error: err.message });
  }
}

async function updateChart(req, res) {
  const errors = validateChartData(req.body);
  if (errors.length) {
    return res.status(400).json({ message: 'Validation failed', errors });
  }

  try {
    const { name, category, gender, unit, sizes } = req.body;
    const chart = await SizeChart.findOneAndUpdate(
      { _id: req.params.id, merchantId: req.merchant.merchantId },
      { name, category, gender, unit, sizes },
      { new: true, runValidators: true }
    );

    if (!chart) {
      return res.status(404).json({ message: 'Size chart not found' });
    }

    return res.status(200).json({ chart });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(404).json({ message: 'Size chart not found' });
    }
    return res.status(500).json({ message: 'Failed to update size chart', error: err.message });
  }
}

async function deleteChart(req, res) {
  try {
    const chart = await SizeChart.findOneAndUpdate(
      { _id: req.params.id, merchantId: req.merchant.merchantId },
      { isActive: false },
      { new: true }
    );

    if (!chart) {
      return res.status(404).json({ message: 'Size chart not found' });
    }

    return res.status(200).json({ message: 'Size chart deleted', chart });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(404).json({ message: 'Size chart not found' });
    }
    return res.status(500).json({ message: 'Failed to delete size chart', error: err.message });
  }
}

module.exports = { createChart, getCharts, getChartById, updateChart, deleteChart, validateChartData };
