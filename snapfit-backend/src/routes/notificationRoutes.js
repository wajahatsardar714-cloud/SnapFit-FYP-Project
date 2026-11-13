const express = require('express');
const { query } = require('express-validator');
const { protect } = require('../middlewares/authMiddleware');
const {
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  deleteNotification,
  getPreferences,
  updatePreferences,
} = require('../controllers/notificationController');

const router = express.Router();

const listValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer').toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be an integer between 1 and 100')
    .toInt(),
  query('unread').optional().isBoolean().withMessage('unread must be true or false').toBoolean(true),
];

// Merchants and the super admin alike: each sees only their own.
router.use(protect);

router.get('/', listValidation, listNotifications);
router.get('/unread-count', getUnreadCount);
router.get('/preferences', getPreferences);
router.put('/preferences', updatePreferences);
router.post('/read-all', markAllRead);
router.patch('/:id/read', markRead);
router.delete('/:id', deleteNotification);

module.exports = router;
