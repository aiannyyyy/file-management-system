//notificationController.js
const inhouseDb = require("../dbInhouse");

class NotificationController {
  /**
   * Create notification for a single user
   * (Used internally or for single shares)
   */
  async createShareNotification(userId, sharedWithId, fileName, fileId = null, categoryFileId = null) {
    try {
      console.log('📬 Creating notification for user:', sharedWithId);

      const type = fileId ? 'FILE_SHARED' : 'CATEGORY_FILE_SHARED';
      const message = `A file was shared with you: ${fileName}`;
      const now = new Date(); // ✅ FIXED: Explicitly set timestamp

      // ✅ FIXED: Include created_at in INSERT
      const insertQuery = `INSERT INTO notifications (user_id, type, action_by, file_id, category_file_id, file_name, message, is_read, created_at) 
                           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`;
      
      const [result] = await inhouseDb.query(insertQuery, [
        sharedWithId, 
        type, 
        userId, 
        fileId, 
        categoryFileId, 
        fileName, 
        message,
        now  // ✅ FIXED: Add timestamp
      ]);
      
      console.log('✅ Notification created with ID:', result.insertId, 'at', now);
      return { success: true, notificationId: result.insertId };

    } catch (err) {
      console.error('❌ Error creating notification:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Create notifications for MANY users at once (Bulk insert)
   * ✅ BEST for sharing with multiple users
   */
  async createShareNotificationsForMany(userId, userIds, fileName, fileId = null, categoryFileId = null) {
    try {
      if (!userIds || userIds.length === 0) {
        console.warn('⚠️ No users provided for notifications');
        return { success: true, count: 0 };
      }

      console.log('📬 Creating notifications for', userIds.length, 'users');

      const type = fileId ? 'FILE_SHARED' : 'CATEGORY_FILE_SHARED';
      const message = `A file was shared with you: ${fileName}`;
      const now = new Date(); // ✅ FIXED: Explicitly set timestamp

      // ✅ FIXED: Include created_at in values array
      const values = userIds.map(sharedWithId => [
        sharedWithId,    // user_id
        type,            // type
        userId,          // action_by
        fileId,          // file_id
        categoryFileId,  // category_file_id
        fileName,        // file_name
        message,         // message
        0,               // is_read
        now              // ✅ FIXED: created_at timestamp
      ]);

      // ✅ FIXED: Include created_at in column list
      const insertQuery = `INSERT INTO notifications (user_id, type, action_by, file_id, category_file_id, file_name, message, is_read, created_at) 
                           VALUES ?`;
      
      const [result] = await inhouseDb.query(insertQuery, [values]);
      
      console.log(`✅ ${result.affectedRows} notifications created in bulk at`, now);
      return { success: true, count: result.affectedRows };

    } catch (err) {
      console.error('❌ Error creating bulk notifications:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Get unread notifications for a user
   * @param userId - User ID
   * @param limit - Number of notifications to fetch
   */
  async getUnreadNotifications(userId, limit = 10) {
    try {
      console.log(`📥 Fetching unread notifications for user ${userId}`);

      const query = `SELECT n.id, n.type, n.message, n.file_name, n.is_read, n.created_at,
              u.name as shared_by_name, u.user_name
       FROM notifications n
       JOIN users u ON n.action_by = u.id
       WHERE n.user_id = ? AND n.is_read = 0
       ORDER BY n.created_at DESC
       LIMIT ?`;

      const [results] = await inhouseDb.query(query, [userId, limit]);
      console.log(`✅ Found ${results.length} unread notifications`);
      
      // ✅ DEBUG: Log sample timestamp
      if (results.length > 0) {
        console.log('📅 Sample notification timestamp:', results[0].created_at);
      }
      
      return results || [];

    } catch (err) {
      console.error('❌ Error fetching unread notifications:', err);
      return [];
    }
  }

  /**
   * Get all notifications for a user (paginated)
   * @param userId - User ID
   * @param page - Page number
   * @param limit - Items per page
   */
  async getAllNotifications(userId, page = 1, limit = 10) {
    try {
      // ✅ Convert to numbers to avoid SQL errors
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;

      console.log(`📥 Fetching notifications for user ${userId}, page ${pageNum}, limit ${limitNum}`);

      const query = `SELECT n.id, n.type, n.message, n.file_name, n.is_read, n.created_at, n.read_at,
              u.name as shared_by_name, u.user_name
       FROM notifications n
       JOIN users u ON n.action_by = u.id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT ?, ?`;

      const [results] = await inhouseDb.query(query, [userId, offset, limitNum]);
      console.log(`✅ Found ${results.length} notifications`);
      
      // ✅ DEBUG: Log sample timestamp
      if (results.length > 0) {
        console.log('📅 Sample notification timestamp:', results[0].created_at);
      }
      
      return results || [];

    } catch (err) {
      console.error('❌ Error fetching all notifications:', err);
      return [];
    }
  }

  /**
   * Mark notification as read
   * @param notificationId - Notification ID
   */
  async markAsRead(notificationId) {
    try {
      // ✅ FIXED: Use NOW() for MySQL 5.2 compatibility
      const query = 'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ?';

      const [result] = await inhouseDb.query(query, [notificationId]);
      console.log(`✅ Notification ${notificationId} marked as read`);
      return result.affectedRows > 0;

    } catch (err) {
      console.error('❌ Error marking notification as read:', err);
      return false;
    }
  }

  /**
   * Mark all notifications as read for a user
   * @param userId - User ID
   */
  async markAllAsRead(userId) {
    try {
      // ✅ FIXED: Use NOW() for MySQL 5.2 compatibility
      const query = 'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0';

      const [result] = await inhouseDb.query(query, [userId]);
      console.log(`✅ All notifications for user ${userId} marked as read`);
      return result.affectedRows > 0;

    } catch (err) {
      console.error('❌ Error marking all notifications as read:', err);
      return false;
    }
  }

  /**
   * Get unread notification count for a user
   * @param userId - User ID
   */
  async getUnreadCount(userId) {
    try {
      const query = 'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0';

      const [results] = await inhouseDb.query(query, [userId]);
      const count = results[0].count || 0;
      console.log(`✅ Unread count for user ${userId}: ${count}`);
      return count;

    } catch (err) {
      console.error('❌ Error getting unread count:', err);
      return 0;
    }
  }

  /**
   * Delete a notification
   * @param notificationId - Notification ID
   */
  async deleteNotification(notificationId) {
    try {
      const query = 'DELETE FROM notifications WHERE id = ?';

      const [result] = await inhouseDb.query(query, [notificationId]);
      console.log(`✅ Notification ${notificationId} deleted`);
      return result.affectedRows > 0;

    } catch (err) {
      console.error('❌ Error deleting notification:', err);
      return false;
    }
  }

  /**
   * Clear all notifications for a user
   * @param userId - User ID
   */
  async clearAllNotifications(userId) {
    try {
      const query = 'DELETE FROM notifications WHERE user_id = ?';

      const [result] = await inhouseDb.query(query, [userId]);
      console.log(`✅ All notifications cleared for user ${userId}`);
      return result.affectedRows > 0;

    } catch (err) {
      console.error('❌ Error clearing notifications:', err);
      return false;
    }
  }
}

module.exports = new NotificationController();