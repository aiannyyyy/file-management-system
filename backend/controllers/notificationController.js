//notificationController.js
const db = require("../config/db");

class NotificationController {
  /**
   * Create notification for a single user
   * (Used internally or for single shares)
   */
  async createShareNotification(userId, sharedWithId, fileName, fileId = null, categoryFileId = null) {
    try {
      console.log('Creating notification for user:', sharedWithId);

      const type = fileId ? 'FILE_SHARED' : 'CATEGORY_FILE_SHARED';
      const message = `A file was shared with you: ${fileName}`;
      const now = new Date();

      const insertQuery = `INSERT INTO notifications (user_id, type, action_by, file_id, category_file_id, file_name, message, is_read, created_at) 
                           VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8)
                           RETURNING id`;
      
      const [result] = await db.query(insertQuery, [
        sharedWithId, 
        type, 
        userId, 
        fileId, 
        categoryFileId, 
        fileName, 
        message,
        now
      ]);
      
      console.log('Notification created with ID:', result.insertId, 'at', now);
      return { success: true, notificationId: result.insertId };

    } catch (err) {
      console.error('Error creating notification:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Create notifications for MANY users at once (Bulk insert)
   */
  async createShareNotificationsForMany(userId, userIds, fileName, fileId = null, categoryFileId = null) {
    try {
      if (!userIds || userIds.length === 0) {
        console.warn('No users provided for notifications');
        return { success: true, count: 0 };
      }

      console.log('Creating notifications for', userIds.length, 'users');

      const type = fileId ? 'FILE_SHARED' : 'CATEGORY_FILE_SHARED';
      const message = `A file was shared with you: ${fileName}`;
      const now = new Date();
      let count = 0;

      for (const sharedWithId of userIds) {
        await db.query(
          `INSERT INTO notifications (user_id, type, action_by, file_id, category_file_id, file_name, message, is_read, created_at) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8)`,
          [sharedWithId, type, userId, fileId, categoryFileId, fileName, message, now]
        );
        count++;
      }
      
      console.log(`${count} notifications created in bulk at`, now);
      return { success: true, count };

    } catch (err) {
      console.error('Error creating bulk notifications:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Get unread notifications for a user
   */
  async getUnreadNotifications(userId, limit = 10) {
    try {
      console.log(`Fetching unread notifications for user ${userId}`);

      const query = `SELECT n.id, n.type, n.message, n.file_name, n.is_read, n.created_at,
              u.name as shared_by_name, u.user_name
       FROM notifications n
       JOIN users u ON n.action_by = u.id
       WHERE n.user_id = $1 AND n.is_read = 0
       ORDER BY n.created_at DESC
       LIMIT $2`;

      const [results] = await db.query(query, [userId, limit]);
      console.log(`Found ${results.length} unread notifications`);
      
      if (results.length > 0) {
        console.log('Sample notification timestamp:', results[0].created_at);
      }
      
      return results || [];

    } catch (err) {
      console.error('Error fetching unread notifications:', err);
      return [];
    }
  }

  /**
   * Get all notifications for a user (paginated)
   */
  async getAllNotifications(userId, page = 1, limit = 10) {
    try {
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const offset = (pageNum - 1) * limitNum;

      console.log(`Fetching notifications for user ${userId}, page ${pageNum}, limit ${limitNum}`);

      const query = `SELECT n.id, n.type, n.message, n.file_name, n.is_read, n.created_at, n.read_at,
              u.name as shared_by_name, u.user_name
       FROM notifications n
       JOIN users u ON n.action_by = u.id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT $2 OFFSET $3`;

      const [results] = await db.query(query, [userId, limitNum, offset]);
      console.log(`Found ${results.length} notifications`);
      
      if (results.length > 0) {
        console.log('Sample notification timestamp:', results[0].created_at);
      }
      
      return results || [];

    } catch (err) {
      console.error('Error fetching all notifications:', err);
      return [];
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId) {
    try {
      const query = 'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = $1';

      const [result] = await db.query(query, [notificationId]);
      console.log(`Notification ${notificationId} marked as read`);
      return result.affectedRows > 0;

    } catch (err) {
      console.error('Error marking notification as read:', err);
      return false;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId) {
    try {
      const query = 'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = $1 AND is_read = 0';

      const [result] = await db.query(query, [userId]);
      console.log(`All notifications for user ${userId} marked as read`);
      return result.affectedRows > 0;

    } catch (err) {
      console.error('Error marking all notifications as read:', err);
      return false;
    }
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId) {
    try {
      const query = 'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = 0';

      const [results] = await db.query(query, [userId]);
      const count = parseInt(results[0].count, 10) || 0;
      console.log(`Unread count for user ${userId}: ${count}`);
      return count;

    } catch (err) {
      console.error('Error getting unread count:', err);
      return 0;
    }
  }

  /**
   * Delete a notification
   */
  async deleteNotification(notificationId) {
    try {
      const query = 'DELETE FROM notifications WHERE id = $1';

      const [result] = await db.query(query, [notificationId]);
      console.log(`Notification ${notificationId} deleted`);
      return result.affectedRows > 0;

    } catch (err) {
      console.error('Error deleting notification:', err);
      return false;
    }
  }

  /**
   * Clear all notifications for a user
   */
  async clearAllNotifications(userId) {
    try {
      const query = 'DELETE FROM notifications WHERE user_id = $1';

      const [result] = await db.query(query, [userId]);
      console.log(`All notifications cleared for user ${userId}`);
      return result.affectedRows > 0;

    } catch (err) {
      console.error('Error clearing notifications:', err);
      return false;
    }
  }
}

module.exports = new NotificationController();
