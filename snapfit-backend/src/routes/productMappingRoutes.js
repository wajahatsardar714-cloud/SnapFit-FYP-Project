const express = require('express');
const { protect } = require('../middlewares/authMiddleware');
const { mapProduct, getProductMappings, removeMapping } = require('../controllers/productMappingController');

const router = express.Router();

router.use(protect);

router.post('/map', mapProduct);
router.get('/mappings', getProductMappings);
router.delete('/map/:id', removeMapping);

module.exports = router;
