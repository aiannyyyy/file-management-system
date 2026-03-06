//shareController.js
const inhouseDb = require("../dbInhouse");
const notificationController = require('./notificationController');

// ================== Helper: Add Activity Log ==================
async function addActivityLog(userId, action, targetType, targetId, targetName, additionalInfo = null) {
  try {
    const actionMap = {
      'create': 'CREATE',
      'upload': 'CREATE',
      'update': 'UPDATE',
      'rename': 'RENAME',
      'move': 'MOVE',
      'move_rename': 'MOVE',
      'delete': 'DELETE',
      'download': 'DOWNLOAD',
      'copy': 'COPY',
      'share': 'SHARED'
    };

    const entityTypeMap = {
      'category': 'CATEGORY',
      'folder': 'FOLDER',
      'file': 'FILE'
    };

    const mappedAction = actionMap[action] || 'CREATE';
    const mappedEntityType = entityTypeMap[targetType] || 'FILE';

    await inhouseDb.query(
      `INSERT INTO activity_logs (user_id, action, target_type, target_id, target_name, additional_info, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [userId, mappedAction, mappedEntityType, targetId, targetName, additionalInfo]
    );

    console.log(`📝 Log: ${mappedAction} ${mappedEntityType} (${targetName}) by user ${userId}`);
  } catch (error) {
    console.error("💥 Error adding activity log:", error);
  }
}

// ================== Share a regular file (from files table) ==================
exports.shareFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { userIds } = req.body;
    const sharedBy = req.user.id;

    console.log('🔍 DEBUG: shareFile() called');
    console.log('📋 Request params:', { fileId, userIds, sharedBy });

    // Validate input
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      console.warn('⚠️ DEBUG: Invalid userIds input');
      return res.status(400).json({ error: 'Please select at least one user' });
    }

    // Check if file exists and user owns it
    const [files] = await inhouseDb.query(
      'SELECT created_by, file_name FROM files WHERE id = ?',
      [fileId]
    );

    console.log('🔍 DEBUG: File query result:', files);

    if (files.length === 0) {
      console.warn('⚠️ DEBUG: File not found, fileId:', fileId);
      return res.status(404).json({ error: 'File not found' });
    }

    const fileOwnerId = String(files[0].created_by);
    const currentUserId = String(sharedBy);

    console.log('🔐 DEBUG: Ownership Check');
    console.log('  - File Owner ID:', fileOwnerId);
    console.log('  - Current User ID:', currentUserId);
    console.log('  - Are Equal?:', fileOwnerId === currentUserId);

    if (fileOwnerId !== currentUserId) {
      console.error('❌ DEBUG: Ownership mismatch! User cannot share this file');
      return res.status(403).json({ 
        error: 'Only file owner can share this file'
      });
    }

    console.log('✅ DEBUG: Ownership verified');

    // Remove self from userIds
    const validUserIds = userIds.filter(id => String(id) !== currentUserId);

    console.log('🔍 DEBUG: After filtering self');
    console.log('  - Original userIds:', userIds);
    console.log('  - Valid userIds:', validUserIds);

    if (validUserIds.length === 0) {
      console.warn('⚠️ DEBUG: No valid users after filtering');
      return res.status(400).json({ error: 'Cannot share file with yourself' });
    }

    // ✅ FIXED: Prepare values for bulk insert WITH created_at timestamp
    const now = new Date();
    const values = validUserIds.map(userId => [
      fileId,        // file_id
      null,          // category_file_id (NULL for regular files)
      sharedBy,      // shared_by
      userId,        // shared_with
      now            // created_at - EXPLICITLY SET
    ]);

    console.log('🔍 DEBUG: Prepared insert values with timestamp');
    console.log('  - Timestamp:', now);

    // ✅ FIXED: Insert shares with created_at column
    const [insertResult] = await inhouseDb.query(
      'INSERT IGNORE INTO file_shares (file_id, category_file_id, shared_by, shared_with, created_at) VALUES ?',
      [values]
    );

    console.log('✅ DEBUG: Insert result:', insertResult);
    console.log('  - Affected rows:', insertResult.affectedRows);

    // Log the share action
    const sharedWithNames = validUserIds.join(', ');
    await addActivityLog(
      sharedBy,
      'share',
      'file',
      fileId,
      files[0].file_name,
      `Shared with ${validUserIds.length} user(s): ${sharedWithNames}`
    );

    console.log('✅ DEBUG: Activity log created');

    // Respond immediately
    res.json({
      success: true,
      message: 'File shared successfully',
      sharedWith: validUserIds.length
    });

    // Create notifications in BULK (async - won't block response)
    console.log('📬 Creating bulk notifications for', validUserIds.length, 'user(s)');
    notificationController.createShareNotificationsForMany(
      sharedBy,
      validUserIds,
      files[0].file_name,
      fileId,
      null
    ).catch(err => {
      console.error(`⚠️ Bulk notification error:`, err.message);
    });
    console.log(`📤 Notifications queued for ${validUserIds.length} user(s)`);

  } catch (error) {
    console.error('❌ ERROR: Error sharing file:', error);
    res.status(500).json({ 
      error: 'Failed to share file',
      details: error.message
    });
  }
};

// ================== Share a category file (from categories_files table) ==================
exports.shareCategoryFile = async (req, res) => {
  try {
    const { categoryFileId } = req.params;
    const { userIds } = req.body;
    const sharedBy = req.user.id;

    // Validate input
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'Please select at least one user' });
    }

    // Check if file exists and user owns it
    const [files] = await inhouseDb.query(
      'SELECT created_by, name, original_name FROM categories_files WHERE id = ?',
      [categoryFileId]
    );

    if (files.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const fileOwnerId = String(files[0].created_by);
    const currentUserId = String(sharedBy);

    if (fileOwnerId !== currentUserId) {
      return res.status(403).json({ error: 'Only file owner can share this file' });
    }

    // Remove self from userIds
    const validUserIds = userIds.filter(id => String(id) !== currentUserId);

    if (validUserIds.length === 0) {
      return res.status(400).json({ error: 'Cannot share file with yourself' });
    }

    // ✅ FIXED: Prepare values for bulk insert WITH created_at timestamp
    const now = new Date();
    const values = validUserIds.map(userId => [
      null,              // file_id (NULL for category files)
      categoryFileId,    // category_file_id
      sharedBy,          // shared_by
      userId,            // shared_with
      now                // created_at - EXPLICITLY SET
    ]);

    // ✅ FIXED: Insert shares with created_at column
    const [insertResult] = await inhouseDb.query(
      'INSERT IGNORE INTO file_shares (file_id, category_file_id, shared_by, shared_with, created_at) VALUES ?',
      [values]
    );

    // Log the share action
    const sharedWithNames = validUserIds.join(', ');
    await addActivityLog(
      sharedBy,
      'share',
      'file',
      categoryFileId,
      files[0].name,
      `Shared with ${validUserIds.length} user(s): ${sharedWithNames}`
    );

    // Respond immediately
    res.json({
      success: true,
      message: 'File shared successfully',
      sharedWith: validUserIds.length
    });

    // Create notifications asynchronously
    console.log('📬 Creating notifications for', validUserIds.length, 'users');
    notificationController.createShareNotificationsForMany(
      sharedBy,
      validUserIds,
      files[0].name,
      null,
      categoryFileId
    ).catch(err => {
      console.error(`⚠️ Bulk notification error:`, err.message);
    });

  } catch (error) {
    console.error('Error sharing category file:', error);
    res.status(500).json({ error: 'Failed to share file' });
  }
};

// ================== Share entire category with users ==================
exports.shareCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { userIds } = req.body;
    const sharedBy = req.user.id;

    // Validate input
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'Please select at least one user' });
    }

    // Check if category exists
    const [categories] = await inhouseDb.query(
      'SELECT id, name FROM categories WHERE id = ?',
      [categoryId]
    );

    if (categories.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const category = categories[0];

    // Get all files in this category
    const [files] = await inhouseDb.query(
      'SELECT id FROM categories_files WHERE category_id = ?',
      [categoryId]
    );

    if (files.length === 0) {
      return res.status(400).json({ error: 'Category has no files to share' });
    }

    const validUserIds = userIds.filter(id => String(id) !== String(sharedBy));

    if (validUserIds.length === 0) {
      return res.status(400).json({ error: 'Cannot share with yourself' });
    }

    // ✅ FIXED: Prepare bulk insert values WITH created_at timestamp
    const now = new Date();
    const values = [];
    for (const fileId of files) {
      for (const userId of validUserIds) {
        values.push([
          null,        // file_id (NULL for category files)
          fileId.id,   // category_file_id
          sharedBy,    // shared_by
          userId,      // shared_with
          now          // created_at - EXPLICITLY SET
        ]);
      }
    }

    // ✅ FIXED: Insert shares with created_at column
    const [insertResult] = await inhouseDb.query(
      'INSERT IGNORE INTO file_shares (file_id, category_file_id, shared_by, shared_with, created_at) VALUES ?',
      [values]
    );

    // Log the category share action
    const sharedWithNames = validUserIds.join(', ');
    await addActivityLog(
      sharedBy,
      'share',
      'category',
      categoryId,
      category.name,
      `Shared category with ${validUserIds.length} user(s) (${files.length} files): ${sharedWithNames}`
    );

    // Respond immediately
    res.json({
      success: true,
      message: 'Category shared successfully',
      categoryName: category.name,
      filesShared: files.length,
      sharedWith: validUserIds.length
    });

    // Create notifications asynchronously
    console.log('📬 Creating category share notifications for', validUserIds.length, 'users');
    notificationController.createShareNotificationsForMany(
      sharedBy,
      validUserIds,
      `Category: ${category.name}`,
      null,
      null
    ).catch(err => {
      console.error(`⚠️ Bulk notification error:`, err.message);
    });

  } catch (error) {
    console.error('Error sharing category:', error);
    res.status(500).json({ error: 'Failed to share category' });
  }
};

// ================== Get all files shared with current user ==================
exports.getSharedWithMe = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('📥 Fetching files shared with user:', userId);

    // Get regular files shared with user
    const [regularFiles] = await inhouseDb.query(
      `SELECT 
        f.id,
        f.file_name,
        f.file_path,
        f.file_type,
        f.file_size,
        f.created_at,
        fs.created_at as shared_at,
        u.name as owner_name,
        u.email as owner_email,
        u.department as owner_department,
        COALESCE(u2.name, u.name) as shared_by_name,
        'regular' as source_type
       FROM file_shares fs
       INNER JOIN files f ON fs.file_id = f.id
       INNER JOIN users u ON f.created_by = u.id
       LEFT JOIN users u2 ON fs.shared_by = u2.id
       WHERE fs.shared_with = ?
       ORDER BY fs.created_at DESC`,
      [userId]
    );

    console.log('✅ Regular files found:', regularFiles.length);

    // Get category files shared with user
    const [categoryFiles] = await inhouseDb.query(
      `SELECT 
        cf.id,
        cf.name as file_name,
        cf.original_name,
        cf.file_path,
        cf.file_type,
        cf.file_size,
        cf.created_at,
        fs.created_at as shared_at,
        u.name as owner_name,
        u.email as owner_email,
        u.department as owner_department,
        COALESCE(u2.name, u.name) as shared_by_name,
        'category' as source_type
       FROM file_shares fs
       INNER JOIN categories_files cf ON fs.category_file_id = cf.id
       INNER JOIN users u ON cf.created_by = u.id
       LEFT JOIN users u2 ON fs.shared_by = u2.id
       WHERE fs.shared_with = ?
       ORDER BY fs.created_at DESC`,
      [userId]
    );

    console.log('✅ Category files found:', categoryFiles.length);

    const allSharedFiles = [...regularFiles, ...categoryFiles];
    allSharedFiles.sort((a, b) => 
      new Date(b.shared_at).getTime() - new Date(a.shared_at).getTime()
    );

    console.log('✅ Total shared files:', allSharedFiles.length);

    res.json({
      success: true,
      data: allSharedFiles,
      count: allSharedFiles.length
    });

  } catch (error) {
    console.error('❌ Error fetching shared files:', error);
    res.status(500).json({ 
      error: 'Failed to fetch shared files',
      details: error.message
    });
  }
};

// ================== Get who has access to a regular file ==================
exports.getFileShares = async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.id;

    const [files] = await inhouseDb.query(
      'SELECT created_by FROM files WHERE id = ?',
      [fileId]
    );

    if (files.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (files[0].created_by !== userId) {
      return res.status(403).json({ error: 'Only file owner can view shares' });
    }

    const [shares] = await inhouseDb.query(
      `SELECT 
        fs.id,
        fs.shared_with,
        fs.created_at,
        u.name as username,
        u.user_name,
        u.email,
        u.department,
        u.position
       FROM file_shares fs
       INNER JOIN users u ON fs.shared_with = u.id
       WHERE fs.file_id = ?
       ORDER BY fs.created_at DESC`,
      [fileId]
    );

    res.json({
      success: true,
      data: shares,
      count: shares.length
    });

  } catch (error) {
    console.error('Error fetching file shares:', error);
    res.status(500).json({ error: 'Failed to fetch file shares' });
  }
};

// ================== Get who has access to a category file ==================
exports.getCategoryFileShares = async (req, res) => {
  try {
    const { categoryFileId } = req.params;
    const userId = req.user.id;

    const [files] = await inhouseDb.query(
      'SELECT created_by FROM categories_files WHERE id = ?',
      [categoryFileId]
    );

    if (files.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (files[0].created_by !== userId) {
      return res.status(403).json({ error: 'Only file owner can view shares' });
    }

    const [shares] = await inhouseDb.query(
      `SELECT 
        fs.id,
        fs.shared_with,
        fs.created_at,
        u.name as username,
        u.user_name,
        u.email,
        u.department,
        u.position
       FROM file_shares fs
       INNER JOIN users u ON fs.shared_with = u.id
       WHERE fs.category_file_id = ?
       ORDER BY fs.created_at DESC`,
      [categoryFileId]
    );

    res.json({
      success: true,
      data: shares,
      count: shares.length
    });

  } catch (error) {
    console.error('Error fetching file shares:', error);
    res.status(500).json({ error: 'Failed to fetch file shares' });
  }
};

// ================== Remove share access ==================
exports.removeShare = async (req, res) => {
  try {
    const { shareId } = req.params;
    const userId = req.user.id;

    const [shares] = await inhouseDb.query(
      `SELECT 
        fs.*,
        COALESCE(f.created_by, cf.created_by) as file_owner,
        COALESCE(f.file_name, cf.name) as file_name
       FROM file_shares fs
       LEFT JOIN files f ON fs.file_id = f.id
       LEFT JOIN categories_files cf ON fs.category_file_id = cf.id
       WHERE fs.id = ?`,
      [shareId]
    );

    if (shares.length === 0) {
      return res.status(404).json({ error: 'Share not found' });
    }

    const fileOwner = String(shares[0].file_owner);
    const currentUser = String(userId);

    if (fileOwner !== currentUser) {
      return res.status(403).json({ error: 'Only file owner can remove shares' });
    }

    const share = shares[0];

    await inhouseDb.query('DELETE FROM file_shares WHERE id = ?', [shareId]);

    await addActivityLog(
      userId,
      'share',
      'file',
      share.file_id || share.category_file_id,
      share.file_name,
      `Removed share access for user ID: ${share.shared_with}`
    );

    res.json({
      success: true,
      message: 'Share removed successfully'
    });

  } catch (error) {
    console.error('Error removing share:', error);
    res.status(500).json({ error: 'Failed to remove share' });
  }
};

// ================== Get all users for sharing dropdown ==================
exports.getAllUsers = async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const [users] = await inhouseDb.query(
      `SELECT 
        id, 
        user_name, 
        name, 
        email,
        department,
        position
       FROM users 
       WHERE id != ?
       ORDER BY name ASC`,
      [currentUserId]
    );

    res.json({
      success: true,
      data: users,
      count: users.length
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// ================== Check if user has access to a file ==================
exports.checkFileAccess = async (req, res) => {
  try {
    const { fileId, type } = req.params;
    const userId = req.user.id;

    let query, params;

    if (type === 'regular') {
      query = 'SELECT created_by FROM files WHERE id = ?';
      params = [fileId];
    } else {
      query = 'SELECT created_by FROM categories_files WHERE id = ?';
      params = [fileId];
    }

    const [files] = await inhouseDb.query(query, params);

    if (files.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (files[0].created_by === userId) {
      return res.json({
        success: true,
        hasAccess: true,
        isOwner: true
      });
    }

    let shareQuery, shareParams;

    if (type === 'regular') {
      shareQuery = 'SELECT id FROM file_shares WHERE file_id = ? AND shared_with = ?';
      shareParams = [fileId, userId];
    } else {
      shareQuery = 'SELECT id FROM file_shares WHERE category_file_id = ? AND shared_with = ?';
      shareParams = [fileId, userId];
    }

    const [shares] = await inhouseDb.query(shareQuery, shareParams);

    if (shares.length > 0) {
      return res.json({
        success: true,
        hasAccess: true,
        isOwner: false
      });
    }

    res.json({
      success: true,
      hasAccess: false,
      isOwner: false
    });

  } catch (error) {
    console.error('Error checking file access:', error);
    res.status(500).json({ error: 'Failed to check access' });
  }
};

// ================== Get who has access to a category ==================
exports.getCategoryShares = async (req, res) => {
  try {
    const { categoryId } = req.params;

    const [shares] = await inhouseDb.query(
      `SELECT DISTINCT
        fs.id,
        fs.shared_with,
        fs.created_at,
        u.name as username,
        u.user_name,
        u.email,
        u.department,
        u.position,
        COUNT(DISTINCT fs.category_file_id) as files_shared
       FROM file_shares fs
       INNER JOIN categories_files cf ON fs.category_file_id = cf.id
       INNER JOIN users u ON fs.shared_with = u.id
       WHERE cf.category_id = ?
       GROUP BY fs.shared_with, u.id, u.name
       ORDER BY fs.created_at DESC`,
      [categoryId]
    );

    res.json({
      success: true,
      data: shares,
      count: shares.length
    });

  } catch (error) {
    console.error('Error fetching category shares:', error);
    res.status(500).json({ error: 'Failed to fetch category shares' });
  }
};

// ================== Get categories shared with me ==================
exports.getSharedCategoriesWithMe = async (req, res) => {
  try {
    const userId = req.user.id;

    const [categories] = await inhouseDb.query(
      `SELECT DISTINCT
        c.id,
        c.name,
        c.description,
        c.color,
        c.icon,
        u.name as created_by_name,
        u.email as created_by_email,
        u.department as created_by_department,
        COUNT(DISTINCT fs.id) as files_shared,
        MAX(fs.created_at) as last_shared
       FROM file_shares fs
       INNER JOIN categories_files cf ON fs.category_file_id = cf.id
       INNER JOIN categories c ON cf.category_id = c.id
       INNER JOIN users u ON c.created_by = u.id
       WHERE fs.shared_with = ? AND fs.category_file_id IS NOT NULL
       GROUP BY c.id, c.name, c.description
       ORDER BY fs.created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: categories,
      count: categories.length
    });

  } catch (error) {
    console.error('Error fetching shared categories:', error);
    res.status(500).json({ error: 'Failed to fetch shared categories' });
  }
};

// ================== Remove all access for a user to a category ==================
exports.removeCategoryShare = async (req, res) => {
  try {
    const { categoryId, userId } = req.params;
    const currentUserId = req.user.id;

    const [categories] = await inhouseDb.query(
      'SELECT id, name FROM categories WHERE id = ?',
      [categoryId]
    );

    if (categories.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const category = categories[0];

    const [result] = await inhouseDb.query(
      `DELETE fs FROM file_shares fs
       INNER JOIN categories_files cf ON fs.category_file_id = cf.id
       WHERE cf.category_id = ? AND fs.shared_with = ?`,
      [categoryId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'No shares found to remove' });
    }

    await addActivityLog(
      currentUserId,
      'share',
      'category',
      categoryId,
      category.name,
      `Removed share access for user ID: ${userId} (${result.affectedRows} files)`
    );

    res.json({
      success: true,
      message: 'Category access removed successfully',
      sharesDeleted: result.affectedRows
    });

  } catch (error) {
    console.error('Error removing category share:', error);
    res.status(500).json({ error: 'Failed to remove category share' });
  }
};

module.exports = exports;