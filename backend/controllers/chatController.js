//const inhouseDb = require('../inhouseDb');
const inhouseDb = require("../dbInhouse");

// ============================================
// HELPER: Log query execution time
// ============================================
const logQuery = (functionName, duration) => {
  console.log(`⏱️  [${functionName}] Query took ${duration}ms`);
};

// ============================================
// 1. GET ALL CONVERSATIONS FOR A USER
// ============================================
exports.getConversations = async (req, res) => {
  const startTime = Date.now();
  const userId = req.user.id;

  console.log(`\n🔍 [getConversations] Started for userId: ${userId}`);

  try {
    const query = `
      SELECT DISTINCT
        c.id,
        c.conversationName, 
        c.conversationType,
        c.createdAt,
        u.id as otherUserId,
        u.name,
        u.user_name,
        u.email,
        u.position,  -- ✅ ADD THIS LINE
        m.content as lastMessage,
        m.createdAt as lastMessageTime,
        us.isOnline,
        COALESCE(us.isOnline, FALSE) as isOnline,
        COUNT(CASE WHEN msg.isRead = FALSE AND msg.senderId != ? THEN 1 END) as unreadCount
      FROM conversations c
      INNER JOIN conversation_members cm ON c.id = cm.conversationId
      LEFT JOIN conversation_members cm2 ON c.id = cm2.conversationId AND cm2.userId != ?
      LEFT JOIN users u ON cm2.userId = u.id
      LEFT JOIN messages m ON m.conversationId = c.id 
        AND m.id = (
          SELECT id FROM messages 
          WHERE conversationId = c.id
          ORDER BY createdAt DESC LIMIT 1
        )
      LEFT JOIN messages msg ON msg.conversationId = c.id
      LEFT JOIN user_status us ON us.userId = u.id
      WHERE cm.userId = ?
      GROUP BY c.id, u.id
      ORDER BY COALESCE(m.createdAt, c.createdAt) DESC
      LIMIT 50
    `;

    console.log(`📝 Executing query with positions...`);
    const [results] = await inhouseDb.query(query, [userId, userId, userId]);

    const duration = Date.now() - startTime;
    console.log(`⏱️  [getConversations] Query took ${duration}ms`);
    console.log(`✅ [getConversations] Returned ${results.length} conversations\n`);

    results.forEach(r => {
      console.log(`  - Conversation ${r.id}: position="${r.position}", unread=${r.unreadCount}`);
    });

    res.json(results || []);
  } catch (err) {
    console.error('❌ [getConversations] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch conversations', details: err.message });
  }
};

// ============================================
// 2. GET MESSAGES FOR A CONVERSATION
// ============================================
exports.getMessages = async (req, res) => {
  const startTime = Date.now();
  const { conversationId } = req.params;
  const userId = req.user.id;
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  console.log(`\n🔍 [getMessages] Started for conversationId: ${conversationId}`);

  try {
    const verifyQuery = `
      SELECT id FROM conversation_members 
      WHERE conversationId = ? AND userId = ?
      LIMIT 1
    `;

    const [verification] = await inhouseDb.query(verifyQuery, [conversationId, userId]);

    if (verification.length === 0) {
      console.error(`❌ User ${userId} is not a member of conversation ${conversationId}`);
      return res.status(403).json({ error: 'You are not a member of this conversation' });
    }

    const messageQuery = `
      SELECT 
        m.id,
        m.conversationId,
        m.senderId,
        m.content,
        m.messageType,
        m.fileUrl,
        m.fileName,
        m.fileSize,
        m.fileType,
        m.isRead,
        m.isDeleted,
        m.createdAt,
        u.id as userId,
        u.user_name,
        u.name,
        u.email,
        u.position  -- ✅ ADD THIS LINE
      FROM messages m
      JOIN users u ON m.senderId = u.id
      WHERE m.conversationId = ?
      ORDER BY m.createdAt DESC
      LIMIT ? OFFSET ?
    `;

    console.log(`📝 Fetching messages with positions...`);
    const [results] = await inhouseDb.query(messageQuery, [conversationId, limit, offset]);

    const duration = Date.now() - startTime;
    console.log(`⏱️  [getMessages] Query took ${duration}ms`);
    console.log(`✅ [getMessages] Returned ${results.length} messages\n`);
    
    res.json(results.reverse());
  } catch (err) {
    console.error('❌ [getMessages] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch messages', details: err.message });
  }
};

// ============================================
// 3. SEND A MESSAGE
// ============================================
exports.sendMessage = async (req, res) => {
  const startTime = Date.now();
  const { conversationId, content, messageType, fileUrl } = req.body;
  const senderId = req.user.id;

  console.log(`\n🔍 [sendMessage] Started`);
  console.log(`👤 Sender: ${senderId}, Conversation: ${conversationId}`);
  console.log(`📝 Content: ${content?.substring(0, 50)}...`);
  console.log(`🏷️  Type: ${messageType || 'text'}`);

  if (!conversationId || !content) {
    console.warn(`⚠️  Missing required fields`);
    return res.status(400).json({ error: 'conversationId and content are required' });
  }

  try {
    const verifyQuery = `
      SELECT id FROM conversation_members 
      WHERE conversationId = ? AND userId = ?
      LIMIT 1
    `;

    console.log(`🔐 Verifying membership...`);
    const [verification] = await inhouseDb.query(verifyQuery, [conversationId, senderId]);

    if (verification.length === 0) {
      console.error(`❌ User ${senderId} not a member of conversation ${conversationId}`);
      return res.status(403).json({ error: 'You are not a member of this conversation' });
    }

    console.log(`✅ Membership verified`);

    const insertQuery = `
      INSERT INTO messages (conversationId, senderId, content, messageType, fileUrl, createdAt)
      VALUES (?, ?, ?, ?, ?, NOW())
    `;

    const type = messageType || 'text';
    console.log(`📝 Inserting message...`);
    const [result] = await inhouseDb.query(insertQuery, [conversationId, senderId, content, type, fileUrl || null]);

    console.log(`✅ Message inserted with ID: ${result.insertId}`);

    // ✅ FIXED: Added fileName, fileSize, fileType to SELECT
    const selectQuery = `
      SELECT 
        m.id,
        m.conversationId,
        m.senderId,
        m.content,
        m.messageType,
        m.fileUrl,
        m.fileName,
        m.fileSize,
        m.fileType,
        m.isRead,
        m.createdAt,
        u.id as userId,
        u.user_name,
        u.name,
        u.email
      FROM messages m
      JOIN users u ON m.senderId = u.id
      WHERE m.id = ?
      LIMIT 1
    `;

    const [messageData] = await inhouseDb.query(selectQuery, [result.insertId]);

    logQuery('sendMessage', Date.now() - startTime);
    console.log(`✅ [sendMessage] Message sent successfully\n`);
    res.status(201).json(messageData[0]);
  } catch (err) {
    console.error('❌ [sendMessage] Error:', err.message);
    res.status(500).json({ error: 'Failed to send message', details: err.message });
  }
};

// ============================================
// 4. MARK MESSAGES AS READ
// ============================================
exports.markAsRead = async (req, res) => {
  const startTime = Date.now();
  const { conversationId } = req.body;
  const userId = req.user.id;

  console.log(`\n🔍 [markAsRead] Started for conversationId: ${conversationId}, userId: ${userId}`);

  if (!conversationId) {
    console.warn(`⚠️  conversationId is required`);
    return res.status(400).json({ error: 'conversationId is required' });
  }

  try {
    // Mark all unread messages from OTHER users as read
    const query = `
      UPDATE messages 
      SET isRead = TRUE
      WHERE conversationId = ? AND senderId != ? AND isDeleted = FALSE
    `;

    console.log(`📝 Marking messages as read...`);
    const [result] = await inhouseDb.query(query, [conversationId, userId]);

    logQuery('markAsRead', Date.now() - startTime);
    console.log(`✅ [markAsRead] Marked ${result.affectedRows} messages as read\n`);
    res.json({ message: 'Messages marked as read', affectedRows: result.affectedRows });
  } catch (err) {
    console.error('❌ [markAsRead] Error:', err.message);
    res.status(500).json({ error: 'Failed to mark messages as read', details: err.message });
  }
};

// ============================================
// 5. CREATE OR GET DIRECT CONVERSATION
// ============================================
exports.createConversation = async (req, res) => {
  const startTime = Date.now();
  const { otherUserId } = req.body;
  const userId = req.user.id;

  console.log(`\n🔍 [createConversation] Started`);
  console.log(`👤 Current user: ${userId}, Target user: ${otherUserId}`);

  if (!otherUserId) {
    console.warn(`⚠️  otherUserId is required`);
    return res.status(400).json({ error: 'otherUserId is required' });
  }

  if (userId === parseInt(otherUserId)) {
    console.warn(`⚠️  User cannot chat with themselves`);
    return res.status(400).json({ error: 'Cannot create conversation with yourself' });
  }

  try {
    console.log(`🔐 Checking if user exists...`);
    // ✅ FIX: Get position from user
    const userCheckQuery = `SELECT id, user_name, name, position FROM users WHERE id = ? LIMIT 1`;
    const [userData] = await inhouseDb.query(userCheckQuery, [otherUserId]);

    if (userData.length === 0) {
      console.error(`❌ User ${otherUserId} not found`);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`✅ User found: ${userData[0].position || userData[0].user_name}`);
    console.log(`🔍 Checking if conversation already exists...`);

    const checkQuery = `
      SELECT c.id
      FROM conversations c
      INNER JOIN conversation_members cm1 ON c.id = cm1.conversationId AND cm1.userId = ?
      INNER JOIN conversation_members cm2 ON c.id = cm2.conversationId AND cm2.userId = ?
      WHERE c.conversationType = 'direct'
      LIMIT 1
    `;

    const [existing] = await inhouseDb.query(checkQuery, [userId, otherUserId]);

    if (existing.length > 0) {
      console.log(`✅ Existing conversation found: ${existing[0].id}`);
      const duration = Date.now() - startTime;
      console.log(`⏱️  [createConversation] Query took ${duration}ms`);
      return res.json({ id: existing[0].id, isNew: false });
    }

    console.log(`📝 Creating new conversation...`);

    // ✅ FIX: Use position as primary display name
    const conversationName = userData[0].position 
      ? `${userData[0].position}`
      : userData[0].name || userData[0].user_name;
    
    const createQuery = `
      INSERT INTO conversations (conversationName, conversationType, createdBy, createdAt)
      VALUES (?, ?, ?, NOW())
    `;

    const [createResult] = await inhouseDb.query(createQuery, [conversationName, 'direct', userId]);
    const conversationId = createResult.insertId;
    console.log(`✅ Conversation created with ID: ${conversationId}`);

    console.log(`👥 Adding members to conversation...`);

    const memberQuery = `
      INSERT INTO conversation_members (conversationId, userId, joinedAt)
      VALUES (?, ?, NOW()), (?, ?, NOW())
    `;

    await inhouseDb.query(memberQuery, [conversationId, userId, conversationId, otherUserId]);

    const duration = Date.now() - startTime;
    console.log(`⏱️  [createConversation] Query took ${duration}ms`);
    console.log(`✅ [createConversation] Conversation created successfully\n`);
    
    res.status(201).json({ id: conversationId, isNew: true });
  } catch (err) {
    console.error('❌ [createConversation] Error:', err.message);
    res.status(500).json({ error: 'Failed to create conversation', details: err.message });
  }
};

// ============================================
// 6. DELETE A MESSAGE (SOFT DELETE)
// ============================================
exports.deleteMessage = async (req, res) => {
  const startTime = Date.now();
  const { messageId } = req.params;
  const userId = req.user.id;

  console.log(`\n🔍 [deleteMessage] Started for messageId: ${messageId}, userId: ${userId}`);

  if (!messageId) {
    console.warn(`⚠️  messageId is required`);
    return res.status(400).json({ error: 'messageId is required' });
  }

  try {
    // ✅ STEP 1: Get the original message
    const getMessageQuery = `
      SELECT id, content, messageType, senderId
      FROM messages
      WHERE id = ? AND senderId = ?
      LIMIT 1
    `;

    console.log(`📝 Fetching original message...`);
    const [messageData] = await inhouseDb.query(getMessageQuery, [messageId, userId]);

    if (messageData.length === 0) {
      console.error(`❌ User ${userId} cannot delete message ${messageId}`);
      return res.status(403).json({ error: 'Unauthorized - You can only delete your own messages' });
    }

    const originalMessage = messageData[0];
    console.log(`✅ Original message found: "${originalMessage.content}"`);

    // ✅ STEP 2: Set content to "This message was removed" for display
    // Keep original with (removed) for backtracking if needed
    const modifiedContent = 'This message was removed';

    // ✅ STEP 3: Update the message with modified content and mark as deleted
    const updateQuery = `
      UPDATE messages
      SET 
        content = ?,
        isDeleted = TRUE, 
        deletedAt = NOW()
      WHERE id = ? AND senderId = ?
    `;

    console.log(`📝 Updating message with modified content: "${modifiedContent}"`);
    const [result] = await inhouseDb.query(updateQuery, [modifiedContent, messageId, userId]);

    if (result.affectedRows === 0) {
      console.error(`❌ Failed to update message ${messageId}`);
      return res.status(500).json({ error: 'Failed to delete message' });
    }

    logQuery('deleteMessage', Date.now() - startTime);
    console.log(`✅ [deleteMessage] Message deleted and marked for display\n`);

    res.json({
      message: 'Message deleted successfully',
      messageId: messageId,
      modifiedContent: modifiedContent
    });
  } catch (err) {
    console.error('❌ [deleteMessage] Error:', err.message);
    res.status(500).json({ error: 'Failed to delete message', details: err.message });
  }
};

// ============================================
// 7. UPDATE USER ONLINE STATUS
// ============================================
exports.updateUserStatus = async (req, res) => {
  const startTime = Date.now();
  const { isOnline } = req.body;
  const userId = req.user.id;

  console.log(`\n🔍 [updateUserStatus] Started for userId: ${userId}, isOnline: ${isOnline}`);

  if (isOnline === undefined) {
    console.warn(`⚠️  isOnline is required`);
    return res.status(400).json({ error: 'isOnline is required' });
  }

  try {
    const query = `
      INSERT INTO user_status (userId, isOnline, lastSeen)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE
      isOnline = VALUES(isOnline),
      lastSeen = NOW()
    `;

    console.log(`📝 Updating status...`);
    await inhouseDb.query(query, [userId, isOnline]);

    logQuery('updateUserStatus', Date.now() - startTime);
    console.log(`✅ [updateUserStatus] Status updated to ${isOnline}\n`);
    res.json({ message: 'Status updated successfully', isOnline });
  } catch (err) {
    console.error('❌ [updateUserStatus] Error:', err.message);
    res.status(500).json({ error: 'Failed to update status', details: err.message });
  }
};

// ============================================
// 8. GET ALL USERS ONLINE STATUS
// ============================================
exports.getUserStatus = async (req, res) => {
  const startTime = Date.now();

  console.log(`\n🔍 [getUserStatus] Started`);

  try {
    const query = `
      SELECT 
        u.id as userId,
        u.user_name,
        u.name,
        COALESCE(us.isOnline, FALSE) as isOnline,
        us.lastSeen
      FROM users u
      LEFT JOIN user_status us ON u.id = us.userId
      ORDER BY us.isOnline DESC, us.lastSeen DESC
      LIMIT 100
    `;

    console.log(`📝 Fetching user status...`);
    const [results] = await inhouseDb.query(query);

    logQuery('getUserStatus', Date.now() - startTime);
    console.log(`✅ [getUserStatus] Returned status for ${results.length} users\n`);
    res.json(results);
  } catch (err) {
    console.error('❌ [getUserStatus] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch user status', details: err.message });
  }
};

// ============================================
// 9. SEARCH MESSAGES IN A CONVERSATION
// ============================================
exports.searchMessages = async (req, res) => {
  const startTime = Date.now();
  const { conversationId, searchTerm } = req.query;
  const userId = req.user.id;

  console.log(`\n🔍 [searchMessages] Started`);
  console.log(`🔎 Search term: "${searchTerm}", conversationId: ${conversationId}, userId: ${userId}`);

  if (!conversationId || !searchTerm) {
    console.warn(`⚠️  conversationId and searchTerm are required`);
    return res.status(400).json({ error: 'conversationId and searchTerm are required' });
  }

  try {
    const verifyQuery = `
      SELECT id FROM conversation_members 
      WHERE conversationId = ? AND userId = ?
      LIMIT 1
    `;

    console.log(`🔐 Verifying membership...`);
    const [verification] = await inhouseDb.query(verifyQuery, [conversationId, userId]);

    if (verification.length === 0) {
      console.error(`❌ User ${userId} not a member of conversation ${conversationId}`);
      return res.status(403).json({ error: 'You are not a member of this conversation' });
    }

    console.log(`✅ Membership verified, searching...`);

    const searchQuery = `
      SELECT 
        m.id,
        m.conversationId,
        m.senderId,
        m.content,
        m.messageType,
        m.createdAt,
        u.user_name,
        u.name
      FROM messages m
      JOIN users u ON m.senderId = u.id
      WHERE m.conversationId = ? AND m.content LIKE ? AND m.isDeleted = FALSE
      ORDER BY m.createdAt DESC
      LIMIT 50
    `;

    console.log(`📝 Searching messages...`);
    const [results] = await inhouseDb.query(searchQuery, [conversationId, `%${searchTerm}%`]);

    logQuery('searchMessages', Date.now() - startTime);
    console.log(`✅ [searchMessages] Found ${results.length} results\n`);
    res.json(results);
  } catch (err) {
    console.error('❌ [searchMessages] Error:', err.message);
    res.status(500).json({ error: 'Failed to search messages', details: err.message });
  }
};

// ============================================
// 10. ATTACH FILE TO MESSAGE
// ============================================
// ============================================
// ATTACH FILE TO MESSAGE - IMPROVED (JavaScript)
// ============================================
exports.attachFile = async (req, res) => {
  const startTime = Date.now();
  const { conversationId } = req.body;
  const userId = req.user.id;
  const file = req.file;

  console.log(`\n🔍 [attachFile] Started`);
  console.log(`📎 conversationId: ${conversationId}`);
  console.log(`👤 userId: ${userId}`);

  if (file) {
    console.log(`📁 File received:`, {
      filename: file.filename,
      originalname: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      path: file.path
    });
  } else {
    console.warn(`⚠️ No file in request`);
  }

  // Validate required fields
  if (!conversationId) {
    console.warn(`⚠️ conversationId is required`);
    return res.status(400).json({ error: 'conversationId is required' });
  }

  if (!file) {
    console.warn(`⚠️ No file provided`);
    return res.status(400).json({ error: 'File is required' });
  }

  try {
    // Convert conversationId to number
    const convId = parseInt(conversationId);

    if (isNaN(convId)) {
      console.warn(`⚠️ Invalid conversationId: ${conversationId}`);
      return res.status(400).json({ error: 'Invalid conversationId' });
    }

    console.log(`🔐 Verifying membership for user ${userId} in conversation ${convId}...`);

    const verifyQuery = `
      SELECT id FROM conversation_members 
      WHERE conversationId = ? AND userId = ?
      LIMIT 1
    `;

    const [verification] = await inhouseDb.query(verifyQuery, [convId, userId]);

    if (verification.length === 0) {
      console.error(`❌ User ${userId} is not a member of conversation ${convId}`);
      return res.status(403).json({ error: 'You are not a member of this conversation' });
    }

    console.log(`✅ Membership verified`);

    // ✅ IMPROVED: Get correct MIME type
    const fileUrl = `/uploads/${file.filename}`;
    const fileName = file.originalname;
    const fileSize = file.size;

    // ✅ Use the MIME type provided by multer
    let fileType = file.mimetype || 'application/octet-stream';

    // ✅ Fallback: Detect from file extension if MIME type is generic
    if (!fileType || fileType === 'application/octet-stream') {
      const ext = fileName.split('.').pop()?.toLowerCase();
      const mimeTypes = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'svg': 'image/svg+xml',
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'avi': 'video/x-msvideo',
        'mov': 'video/quicktime',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'pdf': 'application/pdf',
        'txt': 'text/plain',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'zip': 'application/zip',
        'rar': 'application/x-rar-compressed',
        '7z': 'application/x-7z-compressed'
      };

      if (ext && mimeTypes[ext]) {
        fileType = mimeTypes[ext];
        console.log(`✅ Detected MIME type from extension: ${ext} -> ${fileType}`);
      }
    }

    // ✅ Determine message type based on file type
    const messageType = fileType.startsWith('image/') ? 'image' : 'file';
    const messageContent = messageType === 'image'
      ? `Shared an image: ${fileName}`
      : `Shared a file: ${fileName}`;

    console.log(`📝 Preparing to insert file message`);
    console.log(`   - URL: ${fileUrl}`);
    console.log(`   - Type: ${fileType}`);
    console.log(`   - MessageType: ${messageType}`);

    // Insert message into database
    const insertQuery = `
      INSERT INTO messages (conversationId, senderId, content, messageType, fileUrl, fileName, fileSize, fileType, isRead, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    console.log(`📝 Inserting file message...`);
    const [result] = await inhouseDb.query(insertQuery, [
      convId,
      userId,
      messageContent,
      messageType,
      fileUrl,
      fileName,
      fileSize,
      fileType,
      false
    ]);

    console.log(`✅ File message inserted with ID: ${result.insertId}`);

    // Fetch the inserted message with sender details
    const selectQuery = `
      SELECT 
        m.id,
        m.conversationId,
        m.senderId,
        m.content,
        m.messageType,
        m.fileUrl,
        m.fileName,
        m.fileSize,
        m.fileType,
        m.isRead,
        m.createdAt,
        u.id as userId,
        u.user_name,
        u.name,
        u.email
      FROM messages m
      JOIN users u ON m.senderId = u.id
      WHERE m.id = ?
      LIMIT 1
    `;

    console.log(`📝 Fetching inserted message...`);
    const [messageData] = await inhouseDb.query(selectQuery, [result.insertId]);

    if (!messageData || messageData.length === 0) {
      console.error(`❌ Failed to retrieve inserted message`);
      return res.status(500).json({ error: 'Failed to retrieve uploaded file message' });
    }

    // Log for debugging
    const msg = messageData[0];
    console.log(`✅ Message retrieved:`, {
      id: msg.id,
      fileName: msg.fileName,
      fileType: msg.fileType,
      messageType: msg.messageType
    });

    const duration = Date.now() - startTime;
    console.log(`⏱️  [attachFile] Query took ${duration}ms`);
    console.log(`✅ [attachFile] File attached successfully\n`);

    res.status(201).json(messageData[0]);
  } catch (err) {
    console.error('❌ [attachFile] Error:', err.message);
    console.error('❌ Full error:', err);

    // Cleanup uploaded file on error
    if (req.file) {
      try {
        const fs = require('fs');
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
          console.log(`🧹 Cleaned up failed upload: ${req.file.path}`);
        }
      } catch (cleanupErr) {
        console.error('Error cleaning up file:', cleanupErr);
      }
    }

    res.status(500).json({
      error: 'Failed to attach file',
      details: err.message,
      code: err.code
    });
  }
};

// ============================================
// 11. GET UNREAD MESSAGES COUNT
// ============================================
exports.getUnreadCount = async (req, res) => {
  const startTime = Date.now();
  const { conversationId } = req.params;
  const userId = req.user.id;

  console.log(`\n🔍 [getUnreadCount] Started for conversationId: ${conversationId}, userId: ${userId}`);

  if (!conversationId) {
    console.warn(`⚠️  conversationId is required`);
    return res.status(400).json({ error: 'conversationId is required' });
  }

  try {
    const verifyQuery = `
      SELECT id FROM conversation_members 
      WHERE conversationId = ? AND userId = ?
      LIMIT 1
    `;

    console.log(`🔐 Verifying membership...`);
    const [verification] = await inhouseDb.query(verifyQuery, [conversationId, userId]);

    if (verification.length === 0) {
      console.error(`❌ User ${userId} is not a member of conversation ${conversationId}`);
      return res.status(403).json({ error: 'You are not a member of this conversation' });
    }

    console.log(`✅ Membership verified`);

    const countQuery = `
      SELECT COUNT(*) as unreadCount
      FROM messages
      WHERE conversationId = ? AND isRead = FALSE AND senderId != ? AND isDeleted = FALSE
    `;

    console.log(`📝 Counting unread messages...`);
    const [result] = await inhouseDb.query(countQuery, [conversationId, userId]);

    logQuery('getUnreadCount', Date.now() - startTime);
    console.log(`✅ [getUnreadCount] Found ${result[0].unreadCount} unread messages\n`);
    res.json({ conversationId, unreadCount: result[0].unreadCount });
  } catch (err) {
    console.error('❌ [getUnreadCount] Error:', err.message);
    res.status(500).json({ error: 'Failed to get unread count', details: err.message });
  }
};

// ============================================
// 12. GET ALL UNREAD MESSAGES FOR USER
// ============================================
exports.getAllUnreadMessages = async (req, res) => {
  const startTime = Date.now();
  const userId = req.user.id;

  console.log(`\n🔍 [getAllUnreadMessages] Started for userId: ${userId}`);

  try {
    const query = `
      SELECT 
        m.id,
        m.conversationId,
        m.senderId,
        m.content,
        m.messageType,
        m.fileUrl,
        m.createdAt,
        u.id as userId,
        u.user_name,
        u.name,
        u.email,
        c.conversationName,
        c.conversationType,
        COUNT(m.id) OVER (PARTITION BY m.conversationId) as conversationUnreadCount
      FROM messages m
      JOIN users u ON m.senderId = u.id
      JOIN conversations c ON m.conversationId = c.id
      JOIN conversation_members cm ON c.id = cm.conversationId AND cm.userId = ?
      WHERE m.isRead = FALSE AND m.senderId != ? AND m.isDeleted = FALSE
      ORDER BY m.conversationId, m.createdAt DESC
    `;

    console.log(`📝 Fetching all unread messages...`);
    const [results] = await inhouseDb.query(query, [userId, userId]);

    logQuery('getAllUnreadMessages', Date.now() - startTime);
    console.log(`✅ [getAllUnreadMessages] Returned ${results.length} unread messages\n`);
    res.json(results);
  } catch (err) {
    console.error('❌ [getAllUnreadMessages] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch unread messages', details: err.message });
  }
};

// ============================================
// 13. GET TYPING STATUS FOR A CONVERSATION
// ============================================
exports.getTypingStatus = async (req, res) => {
  const startTime = Date.now();
  const { conversationId } = req.params;
  const userId = req.user.id;

  console.log(`\n🔍 [getTypingStatus] Started for conversationId: ${conversationId}`);

  if (!conversationId) {
    console.warn(`⚠️  conversationId is required`);
    return res.status(400).json({ error: 'conversationId is required' });
  }

  try {
    // Verify user is member of conversation
    const verifyQuery = `
      SELECT id FROM conversation_members 
      WHERE conversationId = ? AND userId = ?
      LIMIT 1
    `;

    const [verification] = await inhouseDb.query(verifyQuery, [conversationId, userId]);

    if (verification.length === 0) {
      console.error(`❌ User ${userId} is not a member of conversation ${conversationId}`);
      return res.status(403).json({ error: 'You are not a member of this conversation' });
    }

    // Get typing users for this conversation
    const typingQuery = `
      SELECT DISTINCT
        u.id,
        u.user_name,
        u.name
      FROM typing_status ts
      JOIN users u ON ts.userId = u.id
      WHERE ts.conversationId = ? AND ts.isTyping = TRUE 
        AND ts.userId != ?
        AND ts.lastUpdated > DATE_SUB(NOW(), INTERVAL 5 SECOND)
    `;

    console.log(`📝 Fetching typing users...`);
    const [typingUsers] = await inhouseDb.query(typingQuery, [conversationId, userId]);

    logQuery('getTypingStatus', Date.now() - startTime);
    console.log(`✅ [getTypingStatus] Found ${typingUsers.length} typing users\n`);

    res.json({
      conversationId,
      isTyping: typingUsers.length > 0,
      users: typingUsers.map(u => u.user_name)
    });
  } catch (err) {
    console.error('❌ [getTypingStatus] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch typing status', details: err.message });
  }
};

// ============================================
// 14. SET TYPING STATUS
// ============================================
exports.setTypingStatus = async (req, res) => {
  const startTime = Date.now();
  const { conversationId, isTyping } = req.body;
  const userId = req.user.id;

  console.log(`\n🔍 [setTypingStatus] Started for conversationId: ${conversationId}, isTyping: ${isTyping}`);

  if (!conversationId || isTyping === undefined) {
    console.warn(`⚠️  conversationId and isTyping are required`);
    return res.status(400).json({ error: 'conversationId and isTyping are required' });
  }

  try {
    // Verify user is member of conversation
    const verifyQuery = `
      SELECT id FROM conversation_members 
      WHERE conversationId = ? AND userId = ?
      LIMIT 1
    `;

    const [verification] = await inhouseDb.query(verifyQuery, [conversationId, userId]);

    if (verification.length === 0) {
      console.error(`❌ User ${userId} is not a member of conversation ${conversationId}`);
      return res.status(403).json({ error: 'You are not a member of this conversation' });
    }

    const query = `
      INSERT INTO typing_status (conversationId, userId, isTyping, lastUpdated)
      VALUES (?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
      isTyping = VALUES(isTyping),
      lastUpdated = NOW()
    `;

    console.log(`📝 Updating typing status...`);
    await inhouseDb.query(query, [conversationId, userId, isTyping]);

    logQuery('setTypingStatus', Date.now() - startTime);
    console.log(`✅ [setTypingStatus] Status updated\n`);
    res.json({ message: 'Typing status updated', conversationId, isTyping });
  } catch (err) {
    console.error('❌ [setTypingStatus] Error:', err.message);
    res.status(500).json({ error: 'Failed to update typing status', details: err.message });
  }
};

// ============================================
// 15. UPLOAD FILE ENDPOINT
// ============================================
exports.uploadFile = async (req, res) => {
  const startTime = Date.now();

  console.log(`\n🔍 [uploadFile] Started`);
  console.log(`📁 File: ${req.file?.filename}, Size: ${req.file?.size} bytes`);

  if (!req.file) {
    console.warn(`⚠️  No file provided`);
    return res.status(400).json({ error: 'No file provided' });
  }

  try {
    const fileUrl = `/uploads/${req.file.filename}`;
    
    logQuery('uploadFile', Date.now() - startTime);
    console.log(`✅ [uploadFile] File uploaded successfully\n`);
    
    res.status(201).json({
      fileUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      message: 'File uploaded successfully'
    });
  } catch (err) {
    console.error('❌ [uploadFile] Error:', err.message);
    res.status(500).json({ error: 'Failed to upload file', details: err.message });
  }
};

// ============================================
// MESSAGE REACTIONS
// ============================================
// 1. ADD REACTION TO MESSAGE
// ============================================
exports.addReaction = async (req, res) => {
  const startTime = Date.now();
  const { messageId, emoji } = req.body;
  const userId = req.user.id;

  console.log(`\n🔍 [addReaction] Started`);
  console.log(`💬 messageId: ${messageId}, emoji: ${emoji}, userId: ${userId}`);

  if (!messageId || !emoji) {
    console.warn(`⚠️  messageId and emoji are required`);
    return res.status(400).json({ error: 'messageId and emoji are required' });
  }

  try {
    const verifyQuery = `
      SELECT m.id, m.conversationId
      FROM messages m
      JOIN conversation_members cm ON m.conversationId = cm.conversationId
      WHERE m.id = ? AND cm.userId = ? AND m.isDeleted = FALSE
      LIMIT 1
    `;

    console.log(`🔐 Verifying message access...`);
    const [messageData] = await inhouseDb.query(verifyQuery, [messageId, userId]);

    if (messageData.length === 0) {
      console.error(`❌ Message ${messageId} not found or access denied`);
      return res.status(404).json({ error: 'Message not found or access denied' });
    }

    console.log(`✅ Message verified`);

    const reactionQuery = `
      INSERT INTO message_reactions (messageId, userId, emoji, createdAt)
      VALUES (?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
      createdAt = NOW()
    `;

    console.log(`📝 Adding reaction: ${emoji}...`);
    const [result] = await inhouseDb.query(reactionQuery, [messageId, userId, emoji]);
    console.log(`✅ Reaction inserted`);

    const getAllReactionsQuery = `
      SELECT 
        emoji,
        COUNT(*) as count,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'userId', u.id,
            'userName', u.user_name,
            'name', u.name
          )
        ) as users
      FROM message_reactions mr
      JOIN users u ON mr.userId = u.id
      WHERE mr.messageId = ?
      GROUP BY emoji
      ORDER BY mr.createdAt DESC
    `;

    console.log(`📝 Fetching all reactions...`);
    const [reactions] = await inhouseDb.query(getAllReactionsQuery, [messageId]);
    console.log(`✅ Reactions fetched:`, reactions);

    const formattedReactions = (reactions || []).map(r => ({
      emoji: r.emoji,
      count: r.count,
      users: typeof r.users === 'string' ? JSON.parse(r.users) : r.users
    }));

    const duration = Date.now() - startTime;
    console.log(`⏱️  [addReaction] Query took ${duration}ms`);
    console.log(`✅ [addReaction] Reaction added successfully\n`);

    res.status(201).json({
      messageId,
      reactions: formattedReactions,
      message: 'Reaction added successfully'
    });
  } catch (err) {
    console.error('❌ [addReaction] Error:', err);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: 'Failed to add reaction', details: err.message });
  }
};

// ============================================
// 2. REMOVE REACTION FROM MESSAGE
// ============================================
exports.removeReaction = async (req, res) => {
  const startTime = Date.now();
  const { messageId, emoji } = req.body;
  const userId = req.user.id;

  console.log(`\n🔍 [removeReaction] Started`);
  console.log(`💬 messageId: ${messageId}, emoji: ${emoji}, userId: ${userId}`);

  if (!messageId || !emoji) {
    console.warn(`⚠️  messageId and emoji are required`);
    return res.status(400).json({ error: 'messageId and emoji are required' });
  }

  try {
    // ✅ STEP 1: Verify message exists
    const verifyQuery = `
      SELECT m.id, m.conversationId
      FROM messages m
      JOIN conversation_members cm ON m.conversationId = cm.conversationId
      WHERE m.id = ? AND cm.userId = ? AND m.isDeleted = FALSE
      LIMIT 1
    `;

    console.log(`🔐 Verifying message access...`);
    const [messageData] = await inhouseDb.query(verifyQuery, [messageId, userId]);

    if (messageData.length === 0) {
      console.error(`❌ Message ${messageId} not found or access denied`);
      return res.status(404).json({ error: 'Message not found or access denied' });
    }

    console.log(`✅ Message verified`);

    // ✅ STEP 2: Delete the reaction (only from current user)
    const deleteQuery = `
      DELETE FROM message_reactions
      WHERE messageId = ? AND userId = ? AND emoji = ?
    `;

    console.log(`📝 Removing reaction: ${emoji}...`);
    const [result] = await inhouseDb.query(deleteQuery, [messageId, userId, emoji]);

    if (result.affectedRows === 0) {
      console.warn(`⚠️  Reaction not found`);
      return res.status(404).json({ error: 'Reaction not found' });
    }

    console.log(`✅ Reaction removed`);

    // ✅ STEP 3: Get remaining reactions for this message
    const getAllReactionsQuery = `
      SELECT 
        emoji,
        COUNT(*) as count,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'userId', u.id,
            'userName', u.user_name,
            'name', u.name
          )
        ) as users
      FROM message_reactions mr
      JOIN users u ON mr.userId = u.id
      WHERE mr.messageId = ?
      GROUP BY emoji
      ORDER BY mr.createdAt DESC
    `;

    console.log(`📝 Fetching remaining reactions...`);
    const [reactions] = await inhouseDb.query(getAllReactionsQuery, [messageId]);

    const duration = Date.now() - startTime;
    console.log(`⏱️  [removeReaction] Query took ${duration}ms`);
    console.log(`✅ [removeReaction] Reaction removed successfully\n`);

    res.json({
      messageId,
      reactions: reactions.map(r => ({
        emoji: r.emoji,
        count: r.count,
        users: JSON.parse(r.users)
      })) || [],
      message: 'Reaction removed successfully'
    });
  } catch (err) {
    console.error('❌ [removeReaction] Error:', err.message);
    res.status(500).json({ error: 'Failed to remove reaction', details: err.message });
  }
};

// ============================================
// 3. GET ALL REACTIONS FOR A MESSAGE
// ============================================
exports.getMessageReactions = async (req, res) => {
  const startTime = Date.now();
  const { messageId } = req.params;
  const userId = req.user.id;

  console.log(`\n🔍 [getMessageReactions] Started for messageId: ${messageId}`);

  if (!messageId) {
    console.warn(`⚠️  messageId is required`);
    return res.status(400).json({ error: 'messageId is required' });
  }

  try {
    // ✅ Verify user has access to message
    const verifyQuery = `
      SELECT m.id, m.conversationId
      FROM messages m
      JOIN conversation_members cm ON m.conversationId = cm.conversationId
      WHERE m.id = ? AND cm.userId = ? AND m.isDeleted = FALSE
      LIMIT 1
    `;

    console.log(`🔐 Verifying message access...`);
    const [messageData] = await inhouseDb.query(verifyQuery, [messageId, userId]);

    if (messageData.length === 0) {
      console.error(`❌ Message ${messageId} not found or access denied`);
      return res.status(404).json({ error: 'Message not found or access denied' });
    }

    // ✅ Get all reactions grouped by emoji
    const reactionsQuery = `
      SELECT 
        emoji,
        COUNT(*) as count,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'userId', u.id,
            'userName', u.user_name,
            'name', u.name
          )
        ) as users,
        MAX(CASE WHEN mr.userId = ? THEN 1 ELSE 0 END) as currentUserReacted
      FROM message_reactions mr
      JOIN users u ON mr.userId = u.id
      WHERE mr.messageId = ?
      GROUP BY emoji
      ORDER BY mr.createdAt DESC
    `;

    console.log(`📝 Fetching reactions...`);
    const [reactions] = await inhouseDb.query(reactionsQuery, [userId, messageId]);

    // ✅ Parse JSON arrays
    const formattedReactions = reactions.map(r => ({
      emoji: r.emoji,
      count: r.count,
      users: JSON.parse(r.users),
      currentUserReacted: r.currentUserReacted === 1
    }));

    const duration = Date.now() - startTime;
    console.log(`⏱️  [getMessageReactions] Query took ${duration}ms`);
    console.log(`✅ [getMessageReactions] Returned ${formattedReactions.length} reaction types\n`);

    res.json({
      messageId,
      reactions: formattedReactions
    });
  } catch (err) {
    console.error('❌ [getMessageReactions] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch reactions', details: err.message });
  }
};

// ============================================
// 4. GET DEFAULT EMOJI REACTIONS
// ============================================
exports.getDefaultEmojis = async (req, res) => {
  const startTime = Date.now();

  console.log(`\n🔍 [getDefaultEmojis] Started`);

  try {
    const query = `
      SELECT emoji, label
      FROM reaction_emojis
      ORDER BY id ASC
    `;

    console.log(`📝 Fetching default emojis...`);
    const [emojis] = await inhouseDb.query(query);

    const duration = Date.now() - startTime;
    console.log(`⏱️  [getDefaultEmojis] Query took ${duration}ms`);
    console.log(`✅ [getDefaultEmojis] Returned ${emojis.length} emojis\n`);

    res.json(emojis);
  } catch (err) {
    console.error('❌ [getDefaultEmojis] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch emojis', details: err.message });
  }
};