/*
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticateUser } = require('../middleware/auth'); // ✅ ADD THIS


router.get('/unread', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = req.query.limit || 10;

    console.log(`📬 Fetching unread notifications for user ${userId}`);

    const notifications = await notificationController.getUnreadNotifications(userId, limit);

    res.json({
      success: true,
      data: notifications,
      count: notifications.length
    });
  } catch (err) {
    console.error('Error getting unread notifications:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching unread notifications',
      error: err.message
    });
  }
});


router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const page = req.query.page || 1;
    const limit = req.query.limit || 15;

    const notifications = await notificationController.getAllNotifications(userId, page, limit);

    res.json({
      success: true,
      data: notifications,
      page: page,
      limit: limit
    });
  } catch (err) {
    console.error('Error getting all notifications:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications',
      error: err.message
    });
  }
});


router.get('/count/unread', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const count = await notificationController.getUnreadCount(userId);

    res.json({
      success: true,
      unreadCount: count
    });
  } catch (err) {
    console.error('Error getting unread count:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching unread count',
      error: err.message
    });
  }
});


router.put('/:id/read', authenticateUser, async (req, res) => {
  try {
    const notificationId = req.params.id;
    
    console.log(`✅ Marking notification ${notificationId} as read`);

    const result = await notificationController.markAsRead(notificationId);

    if (result) {
      res.json({
        success: true,
        message: 'Notification marked as read'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
  } catch (err) {
    console.error('Error marking notification as read:', err);
    res.status(500).json({
      success: false,
      message: 'Error marking notification as read',
      error: err.message
    });
  }
});


router.put('/mark-all-read', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log(`✅ Marking all notifications as read for user ${userId}`);

    const result = await notificationController.markAllAsRead(userId);

    res.json({
      success: true,
      message: result ? 'All notifications marked as read' : 'No unread notifications'
    });
  } catch (err) {
    console.error('Error marking all notifications as read:', err);
    res.status(500).json({
      success: false,
      message: 'Error marking all notifications as read',
      error: err.message
    });
  }
});


router.delete('/:id', authenticateUser, async (req, res) => {
  try {
    const notificationId = req.params.id;
    
    console.log(`🗑️ Deleting notification ${notificationId}`);

    const result = await notificationController.deleteNotification(notificationId);

    if (result) {
      res.json({
        success: true,
        message: 'Notification deleted'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
  } catch (err) {
    console.error('Error deleting notification:', err);
    res.status(500).json({
      success: false,
      message: 'Error deleting notification',
      error: err.message
    });
  }
});


router.delete('/clear-all', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log(`🗑️ Clearing all notifications for user ${userId}`);

    const result = await notificationController.clearAllNotifications(userId);

    res.json({
      success: true,
      message: result ? 'All notifications cleared' : 'No notifications to clear'
    });
  } catch (err) {
    console.error('Error clearing notifications:', err);
    res.status(500).json({
      success: false,
      message: 'Error clearing notifications',
      error: err.message
    });
  }
});

module.exports = router;
*/
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticateUser } = require('../middleware/auth');

/**
 * ⚠️ IMPORTANT: Order matters! Specific routes BEFORE dynamic routes
 */

/**
 * GET /api/notifications/unread
 * Get unread notifications for logged-in user
 */
router.get('/unread', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = req.query.limit || 10;

    console.log(`📬 Fetching unread notifications for user ${userId}`);

    const notifications = await notificationController.getUnreadNotifications(userId, limit);

    res.json({
      success: true,
      data: notifications,
      count: notifications.length
    });
  } catch (err) {
    console.error('Error getting unread notifications:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching unread notifications',
      error: err.message
    });
  }
});

/**
 * GET /api/notifications/count/unread
 * Get unread notification count
 */
router.get('/count/unread', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const count = await notificationController.getUnreadCount(userId);

    res.json({
      success: true,
      unreadCount: count
    });
  } catch (err) {
    console.error('Error getting unread count:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching unread count',
      error: err.message
    });
  }
});

/**
 * GET /api/notifications
 * Get all notifications for logged-in user (paginated)
 * Query: ?page=1&limit=10
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;

    console.log(`📥 Fetching all notifications for user ${userId}, page ${page}, limit ${limit}`);

    const notifications = await notificationController.getAllNotifications(userId, page, limit);

    res.json({
      success: true,
      data: notifications,
      page: page,
      limit: limit,
      count: notifications.length
    });
  } catch (err) {
    console.error('Error getting all notifications:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications',
      error: err.message
    });
  }
});

/**
 * PUT /api/notifications/mark-all-read
 * Mark all notifications as read for user (is_read = 1)
 */
router.put('/mark-all-read', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log(`✅ Marking all notifications as read for user ${userId}`);

    const result = await notificationController.markAllAsRead(userId);

    res.json({
      success: true,
      message: result ? 'All notifications marked as read' : 'No unread notifications'
    });
  } catch (err) {
    console.error('Error marking all notifications as read:', err);
    res.status(500).json({
      success: false,
      message: 'Error marking all notifications as read',
      error: err.message
    });
  }
});

/**
 * DELETE /api/notifications/clear-all
 * Clear all notifications for user
 */
router.delete('/clear-all', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log(`🗑️ Clearing all notifications for user ${userId}`);

    const result = await notificationController.clearAllNotifications(userId);

    res.json({
      success: true,
      message: result ? 'All notifications cleared' : 'No notifications to clear'
    });
  } catch (err) {
    console.error('Error clearing notifications:', err);
    res.status(500).json({
      success: false,
      message: 'Error clearing notifications',
      error: err.message
    });
  }
});

/**
 * PUT /api/notifications/:id/read
 * Mark a notification as read (is_read = 1)
 */
router.put('/:id/read', authenticateUser, async (req, res) => {
  try {
    const notificationId = req.params.id;
    
    console.log(`✅ Marking notification ${notificationId} as read`);

    const result = await notificationController.markAsRead(notificationId);

    if (result) {
      res.json({
        success: true,
        message: 'Notification marked as read',
        notificationId: notificationId,
        is_read: 1
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
  } catch (err) {
    console.error('Error marking notification as read:', err);
    res.status(500).json({
      success: false,
      message: 'Error marking notification as read',
      error: err.message
    });
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete a notification
 */
router.delete('/:id', authenticateUser, async (req, res) => {
  try {
    const notificationId = req.params.id;
    
    console.log(`🗑️ Deleting notification ${notificationId}`);

    const result = await notificationController.deleteNotification(notificationId);

    if (result) {
      res.json({
        success: true,
        message: 'Notification deleted'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
  } catch (err) {
    console.error('Error deleting notification:', err);
    res.status(500).json({
      success: false,
      message: 'Error deleting notification',
      error: err.message
    });
  }
});

module.exports = router;