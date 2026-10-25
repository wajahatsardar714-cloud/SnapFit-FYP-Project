const express = require('express');
const { body, param } = require('express-validator');
const { protect, requireMerchant } = require('../middlewares/authMiddleware');
const ProductMapping = require('../models/ProductMapping');
const { uploadProductImage } = require('../utils/productImageUpload');
const {
  mapProduct,
  getProductMappings,
  removeMapping,
  setProductImage,
  deleteProductImage,
  saveAnchorPoints,
  getAnchorPointsForProduct,
} = require('../controllers/productMappingController');

const router = express.Router();

const mappingIdValidation = [param('id').isMongoId().withMessage('Invalid product mapping ID')];

const mapValidation = [
  body('productId').trim().notEmpty().withMessage('Product ID is required'),
  body('productName').optional({ checkFalsy: true }).trim(),
  body('sizeChartId')
    .notEmpty()
    .withMessage('Size chart is required')
    .bail()
    .isMongoId()
    .withMessage('Invalid size chart ID'),
  body('garmentLength')
    .optional()
    .isIn(ProductMapping.schema.path('garmentLength').enumValues)
    .withMessage('Garment length must be cropped, regular or long'),
];

// Internal, service-to-service lookup for the AI microservice's try-on endpoint
// (Phase 12 / Prompt 30) -- no merchant credential exists in that context, so this
// is deliberately not behind `protect`. It only discloses a product photo URL and
// its click points, not merchant account data, which keeps the exposure low for an
// FYP-scope deployment; a hardened production setup would put this behind a
// shared internal secret or network-level isolation instead.
router.get('/anchor-points', getAnchorPointsForProduct);

router.use(protect, requireMerchant);

// Accepts JSON, or multipart with an optional `image` (the product photo).
router.post('/map', uploadProductImage(), mapValidation, mapProduct);
router.get('/mappings', getProductMappings);
router.delete('/map/:id', mappingIdValidation, removeMapping);
router.put('/:id/image', uploadProductImage({ required: true }), mappingIdValidation, setProductImage);
router.delete('/:id/image', mappingIdValidation, deleteProductImage);
router.put('/:id/anchor-points', uploadProductImage(), mappingIdValidation, saveAnchorPoints);

module.exports = router;
