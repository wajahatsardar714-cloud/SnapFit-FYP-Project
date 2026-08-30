const express = require('express');
const { body } = require('express-validator');
const { updateProfile, changePassword, deleteAccount } = require('../controllers/merchantController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

const profileValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('businessName').trim().notEmpty().withMessage('Business name is required'),
  body('businessType')
    .optional({ checkFalsy: true })
    .isIn(['clothing', 'footwear', 'accessories'])
    .withMessage('Invalid business type'),
];

const passwordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
];

router.put('/profile', protect, profileValidation, updateProfile);
router.put('/password', protect, passwordValidation, changePassword);
router.delete('/account', protect, deleteAccount);

module.exports = router;
