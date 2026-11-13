const express = require('express');
const { body } = require('express-validator');
const { protect } = require('../middlewares/authMiddleware');
const { registerDevice, removeDevice } = require('../controllers/deviceController');

const router = express.Router();

const deviceValidation = [
  body('token')
    .isString()
    .withMessage('token is required')
    .trim()
    .isLength({ min: 1, max: 4096 })
    .withMessage('token is required'),
  body('platform').optional().isIn(['android', 'ios']).withMessage('platform must be android or ios'),
];

router.use(protect);

router.post('/', deviceValidation, registerDevice);
router.delete('/:token', removeDevice);

module.exports = router;
