
const db = require("../config/db");

// ============================================
// HELPER: Log query execution time
// ============================================
const logQuery = (functionName, duration) => {
  console.log(`â±ï¸  [${functionName}] Query took ${duration}ms`);
};

// ============================================
// 1. GET ALL CONVERSATIONS FOR A USER
// ============================================
exports.getConversations = async (req, res) => {
  const startTime = Date.now();
  const userId = req.user.id;

  console.log(`\nðŸ” [getConversations] Started for userId: ${userId}`);

  try {
    const query = `
      SELECT
        c.id,
        c."conversationName",
        c."conversationType",
        c."createdAt",
        u.id as "otherUserId",
        u.name,
        u.user_name,
        u.email,
        u.position,
        m.content as "lastMessage",
        m."createdAt" as "lastMessageTime",
        COALESCE(us."isOnline", FALSE) as "isOnline",
        COUNT(CASE WHEN msg."isRead" = FALSE AND msg."senderId" != $1 THEN 1 END) as "unreadCount"
      FROM conversations c
      INNER JOIN conversation_members cm ON c.id = cm."conversationId"
      LEFT JOIN conversation_members cm2 ON c.id = cm2."conversationId" AND cm2."userId" != $1
      LEFT JOIN users u ON cm2."userId" = u.id
      LEFT JOIN messages m ON m."conversationId" = c.id
        AND m.id = (
          SELECT id FROM messages
          WHERE "conversationId" = c.id
          ORDER BY "createdAt" DESC
          LIMIT 1
        )
      LEFT JOIN messages msg ON msg."conversationId" = c.id
      LEFT JOIN user_status us ON us."userId" = u.id
      WHERE cm."userId" = $1
      GROUP BY
        c.id, c."conversationName", c."conversationType", c."createdAt",
        u.id, u.name, u.user_name, u.email, u.position,
        m.content, m."createdAt", us."isOnline"
      ORDER BY COALESCE(m."createdAt", c."createdAt") DESC NULLS LAST
      LIMIT 50
    `;

    console.log(`Executing conversations query...`);
    const [results] = await db.query(query, [userId]);

    const duration = Date.now() - startTime;
    console.log(`â±ï¸  [getConversations] Query took ${duration}ms`);
    console.log(`âœ… [getConversations] Returned ${results.length} conversations\n`);

    results.forEach(r => {
      console.log(`  - Conversation ${r.id}: position="${r.position}", unread=${r.unreadCount}`);
    });

    res.json(results || []);
  } catch (err) {
    console.error('âŒ [getConversations] Error:', err.message);
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

  console.log(`\nðŸ” [getMessages] Started for conversationId: ${conversationId}`);

  try {
    const verifyQuery = `
      SELECT id FROM conversation_members 
      WHERE conversationId = ? AND userId = ?
      LIMIT 1
    `;

    const [verification] = await db.query(verifyQuery, [conversationId, userId]);

    if (verification.length === 0) {
      console.error(`âŒ User ${userId} is not a member of conversation ${conversationId}`);
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
        u.position  -- âœ… ADD THIS LINE
      FROM messages m
      JOIN users u ON m.senderId = u.id
      WHERE m.conversationId = ?
      ORDER BY m.createdAt DESC
      LIMIT ? OFFSET ?
    `;

    console.log(`ðŸ“ Fetching messages with positions...`);
    const [results] = await db.query(messageQuery, [conversationId, limit, offset]);

    const duration = Date.now() - startTime;
    console.log(`â±ï¸  [getMessages] Query took ${duration}ms`);
    console.log(`âœ… [getMessages] Returned ${results.length} messages\n`);
    
    res.json(results.reverse());
  } catch (err) {
    console.error('âŒ [getMessages] Error:', err.message);
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

  console.log(`\nðŸ” [sendMessage] Started`);
  console.log(`ðŸ‘¤ Sender: ${senderId}, Conversation: ${conversationId}`);
  console.log(`ðŸ“ Content: ${content?.substring(0, 50)}...`);
  console.log(`ðŸ·ï¸  Type: ${messageType || 'text'}`);

  if (!conversationId || !content) {
    console.warn(`âš ï¸  Missing required fields`);
    return res.status(400).json({ error: 'conversationId and content are required' });
  }

  try {
    const verifyQuery = `
      SELECT id FROM conversation_members 
      WHERE conversationId = ? AND userId = ?
      LIMIT 1
    `;

    console.log(`ðŸ” Verifying membership...`);
    const [verification] = await db.query(verifyQuery, [conversationId, senderId]);

    if (verification.length === 0) {
      console.error(`âŒ User ${senderId} not a member of conversation ${conversationId}`);
      return res.status(403).json({ error: 'You are not a member of this conversation' });
    }

    console.log(`âœ… Membership verified`);

    const insertQuery = `
      INSERT INTO messages (conversationId, senderId, content, messageType, fileUrl, createdAt)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id
    `;

    const type = messageType || 'text';
    console.log(`ðŸ“ Inserting message...`);
    const [result] = await db.query(insertQuery, [conversationId, senderId, content, type, fileUrl || null]);

    console.log(`âœ… Message inserted with ID: ${result.insertId}`);

    // âœ… FIXED: Added fileName, fileSize, fileType to SELECT
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

    const [messageData] = await db.query(selectQuery, [result.insertId]);

    logQuery('sendMessage', Date.now() - startTime);
    console.log(`âœ… [sendMessage] Message sent successfully\n`);
    res.status(201).json(messageData[0]);
  } catch (err) {
    console.error('âŒ [sendMessage] Error:', err.message);
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

  console.log(`\nðŸ” [markAsRead] Started for conversationId: ${conversationId}, userId: ${userId}`);

  if (!conversationId) {
    console.warn(`âš ï¸  conversationId is required`);
    return res.status(400).json({ error: 'conversationId is required' });
  }

  try {
    // Mark all unread messages from OTHER users as read
    const query = `
      UPDATE messages 
      SET isRead = TRUE
      WHERE conversationId = ? AND senderId != ? AND isDeleted = FALSE
    `;

    console.log(`ðŸ“ Marking messages as read...`);
    const [result] = await db.query(query, [conversationId, userId]);

    logQuery('markAsRead', Date.now() - startTime);
    console.log(`âœ… [markAsRead] Marked ${result.affectedRows} messages as read\n`);
    res.json({ message: 'Messages marked as read', affectedRows: result.affectedRows });
  } catch (err) {
    console.error('âŒ [markAsRead] Error:', err.message);
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

  console.log(`\nðŸ” [createConversation] Started`);
  console.log(`ðŸ‘¤ Current user: ${userId}, Target user: ${otherUserId}`);

  if (!otherUserId) {
    console.warn(`âš ï¸  otherUserId is required`);
    return res.status(400).json({ error: 'otherUserId is required' });
  }

  if (userId === parseInt(otherUserId)) {
    console.warn(`âš ï¸  User cannot chat with themselves`);
    return res.status(400).json({ error: 'Cannot create conversation with yourself' });
  }

  try {
    console.log(`ðŸ” Checking if user exists...`);
    // âœ… FIX: Get position from user
    const userCheckQuery = `SELECT id, user_name, name, position FROM users WHERE id = ? LIMIT 1`;
    const [userData] = await db.query(userCheckQuery, [otherUserId]);

    if (userData.length === 0) {
      console.error(`âŒ User ${otherUserId} not found`);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`âœ… User found: ${userData[0].position || userData[0].user_name}`);
    console.log(`ðŸ” Checking if conversation already exists...`);

    const checkQuery = `
      SELECT c.id
      FROM conversations c
      INNER JOIN conversation_members cm1 ON c.id = cm1.conversationId AND cm1.userId = ?
      INNER JOIN conversation_members cm2 ON c.id = cm2.conversationId AND cm2.userId = ?
      WHERE c.conversationType = 'direct'
      LIMIT 1
    `;

    const [existing] = await db.query(checkQuery, [userId, otherUserId]);

    if (existing.length > 0) {
      console.log(`âœ… Existing conversation found: ${existing[0].id}`);
      const duration = Date.now() - startTime;
      console.log(`â±ï¸  [createConversation] Query took ${duration}ms`);
      return res.json({ id: existing[0].id, isNew: false });
    }

    console.log(`ðŸ“ Creating new conversation...`);

    // âœ… FIX: Use position as primary display name
    const conversationName = userData[0].position 
      ? `${userData[0].position}`
      : userData[0].name || userData[0].user_name;
    
    const createQuery = `
      INSERT INTO conversations (conversationName, conversationType, createdBy, createdAt)
      VALUES ($1, $2, $3, NOW())
      RETURNING id
    `;

    const [createResult] = await db.query(createQuery, [conversationName, 'direct', userId]);
    const conversationId = createResult.insertId;
    console.log(`âœ… Conversation created with ID: ${conversationId}`);

    console.log(`ðŸ‘¥ Adding members to conversation...`);

    const memberQuery = `
      INSERT INTO conversation_members (conversationId, userId, joinedAt)
      VALUES (?, ?, NOW()), (?, ?, NOW())
    `;

    await db.query(memberQuery, [conversationId, userId, conversationId, otherUserId]);

    const duration = Date.now() - startTime;
    console.log(`â±ï¸  [createConversation] Query took ${duration}ms`);
    console.log(`âœ… [createConversation] Conversation created successfully\n`);
    
    res.status(201).json({ id: conversationId, isNew: true });
  } catch (err) {
    console.error('âŒ [createConversation] Error:', err.message);
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

  console.log(`\nðŸ” [deleteMessage] Started for messageId: ${messageId}, userId: ${userId}`);

  if (!messageId) {
    console.warn(`âš ï¸  messageId is required`);
    return res.status(400).json({ error: 'messageId is required' });
  }

  try {
    // âœ… STEP 1: Get the original message
    const getMessageQuery = `
      SELECT id, content, messageType, senderId
      FROM messages
      WHERE id = ? AND senderId = ?
      LIMIT 1
    `;

    console.log(`ðŸ“ Fetching original message...`);
    const [messageData] = await db.query(getMessageQuery, [messageId, userId]);

    if (messageData.length === 0) {
      console.error(`âŒ User ${userId} cannot delete message ${messageId}`);
      return res.status(403).json({ error: 'Unauthorized - You can only delete your own messages' });
    }

    const originalMessage = messageData[0];
    console.log(`âœ… Original message found: "${originalMessage.content}"`);

    // âœ… STEP 2: Set content to "This message was removed" for display
    // Keep original with (removed) for backtracking if needed
    const modifiedContent = 'This message was removed';

    // âœ… STEP 3: Update the message with modified content and mark as deleted
    const updateQuery = `
      UPDATE messages
      SET 
        content = ?,
        isDeleted = TRUE, 
        deletedAt = NOW()
      WHERE id = ? AND senderId = ?
    `;

    console.log(`ðŸ“ Updating message with modified content: "${modifiedContent}"`);
    const [result] = await db.query(updateQuery, [modifiedContent, messageId, userId]);

    if (result.affectedRows === 0) {
      console.error(`âŒ Failed to update message ${messageId}`);
      return res.status(500).json({ error: 'Failed to delete message' });
    }

    logQuery('deleteMessage', Date.now() - startTime);
    console.log(`âœ… [deleteMessage] Message deleted and marked for display\n`);

    res.json({
      message: 'Message deleted successfully',
      messageId: messageId,
      modifiedContent: modifiedContent
    });
  } catch (err) {
    console.error('âŒ [deleteMessage] Error:', err.message);
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

  console.log(`\nðŸ” [updateUserStatus] Started for userId: ${userId}, isOnline: ${isOnline}`);

  if (isOnline === undefined) {
    console.warn(`âš ï¸  isOnline is required`);
    return res.status(400).json({ error: 'isOnline is required' });
  }

  try {
    const query = `
      INSERT INTO user_status ("userId", "isOnline", "lastSeen")
      VALUES ($1, $2, NOW())
      ON CONFLICT ("userId") DO UPDATE SET
      "isOnline" = EXCLUDED."isOnline",
      "lastSeen" = NOW()
    `;

    console.log(`ðŸ“ Updating status...`);
    await db.query(query, [userId, isOnline]);

    logQuery('updateUserStatus', Date.now() - startTime);
    console.log(`âœ… [updateUserStatus] Status updated to ${isOnline}\n`);
    res.json({ message: 'Status updated successfully', isOnline });
  } catch (err) {
    console.error('âŒ [updateUserStatus] Error:', err.message);
    res.status(500).json({ error: 'Failed to update status', details: err.message });
  }
};

// ============================================
// 8. GET ALL USERS ONLINE STATUS
// ============================================
exports.getUserStatus = async (req, res) => {
  const startTime = Date.now();

  console.log(`\nðŸ” [getUserStatus] Started`);

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

    console.log(`ðŸ“ Fetching user status...`);
    const [results] = await db.query(query);

    logQuery('getUserStatus', Date.now() - startTime);
    console.log(`âœ… [getUserStatus] Returned status for ${results.length} users\n`);
    res.json(results);
  } catch (err) {
    console.error('âŒ [getUserStatus] Error:', err.message);
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

  console.log(`\nðŸ” [searchMessages] Started`);
  console.log(`ðŸ”Ž Search term: "${searchTerm}", conversationId: ${conversationId}, userId: ${userId}`);

  if (!conversationId || !searchTerm) {
    console.warn(`âš ï¸  conversationId and searchTerm are required`);
    return res.status(400).json({ error: 'conversationId and searchTerm are required' });
  }

  try {
    const verifyQuery = `
      SELECT id FROM conversation_members 
      WHERE conversationId = ? AND userId = ?
      LIMIT 1
    `;

    console.log(`ðŸ” Verifying membership...`);
    const [verification] = await db.query(verifyQuery, [conversationId, userId]);

    if (verification.length === 0) {
      console.error(`âŒ User ${userId} not a member of conversation ${conversationId}`);
      return res.status(403).json({ error: 'You are not a member of this conversation' });
    }

    console.log(`âœ… Membership verified, searching...`);

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

    console.log(`ðŸ“ Searching messages...`);
    const [results] = await db.query(searchQuery, [conversationId, `%${searchTerm}%`]);

    logQuery('searchMessages', Date.now() - startTime);
    console.log(`âœ… [searchMessages] Found ${results.length} results\n`);
    res.json(results);
  } catch (err) {
    console.error('âŒ [searchMessages] Error:', err.message);
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

  console.log(`\nðŸ” [attachFile] Started`);
  console.log(`ðŸ“Ž conversationId: ${conversationId}`);
  console.log(`ðŸ‘¤ userId: ${userId}`);

  if (file) {
    console.log(`ðŸ“ File received:`, {
      filename: file.filename,
      originalname: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      path: file.path
    });
  } else {
    console.warn(`âš ï¸ No file in request`);
  }

  // Validate required fields
  if (!conversationId) {
    console.warn(`âš ï¸ conversationId is required`);
    return res.status(400).json({ error: 'conversationId is required' });
  }

  if (!file) {
    console.warn(`âš ï¸ No file provided`);
    return res.status(400).json({ error: 'File is required' });
  }

  try {
    // Convert conversationId to number
    const convId = parseInt(conversationId);

    if (isNaN(convId)) {
      console.warn(`âš ï¸ Invalid conversationId: ${conversationId}`);
      return res.status(400).json({ error: 'Invalid conversationId' });
    }

    console.log(`ðŸ” Verifying membership for user ${userId} in conversation ${convId}...`);

    const verifyQuery = `
      SELECT id FROM conversation_members 
      WHERE conversationId = ? AND userId = ?
      LIMIT 1
    `;

    const [verification] = await db.query(verifyQuery, [convId, userId]);

    if (verification.length === 0) {
      console.error(`âŒ User ${userId} is not a member of conversation ${convId}`);
      return res.status(403).json({ error: 'You are not a member of this conversation' });
    }

    console.log(`âœ… Membership verified`);

    // âœ… IMPROVED: Get correct MIME type
    const fileUrl = `/uploads/${file.filename}`;
    const fileName = file.originalname;
    const fileSize = file.size;

    // âœ… Use the MIME type provided by multer
    let fileType = file.mimetype || 'application/octet-stream';

    // âœ… Fallback: Detect from file extension if MIME type is generic
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
        console.log(`âœ… Detected MIME type from extension: ${ext} -> ${fileType}`);
      }
    }

    // âœ… Determine message type based on file type
    const messageType = fileType.startsWith('image/') ? 'image' : 'file';
    const messageContent = messageType === 'image'
      ? `Shared an image: ${fileName}`
      : `Shared a file: ${fileName}`;

    console.log(`ðŸ“ Preparing to insert file message`);
    console.log(`   - URL: ${fileUrl}`);
    console.log(`   - Type: ${fileType}`);
    console.log(`   - MessageType: ${messageType}`);

    // Insert message into database
    const insertQuery = `
      INSERT INTO messages (conversationId, senderId, content, messageType, fileUrl, fileName, fileSize, fileType, isRead, createdAt)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING id
    `;

    console.log(`ðŸ“ Inserting file message...`);
    const [result] = await db.query(insertQuery, [
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

    console.log(`âœ… File message inserted with ID: ${result.insertId}`);

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

    console.log(`ðŸ“ Fetching inserted message...`);
    const [messageData] = await db.query(selectQuery, [result.insertId]);

    if (!messageData || messageData.length === 0) {
      console.error(`âŒ Failed to retrieve inserted message`);
      return res.status(500).json({ error: 'Failed to retrieve uploaded file message' });
    }

    // Log for debugging
    const msg = messageData[0];
    console.log(`âœ… Message retrieved:`, {
      id: msg.id,
      fileName: msg.fileName,
      fileType: msg.fileType,
      messageType: msg.messageType
    });

    const duration = Date.now() - startTime;
    console.log(`â±ï¸  [attachFile] Query took ${duration}ms`);
    console.log(`âœ… [attachFile] File attached successfully\n`);

    res.status(201).json(messageData[0]);
  } catch (err) {
    console.error('âŒ [attachFile] Error:', err.message);
    console.error('âŒ Full error:', err);

    // Cleanup uploaded file on error
    if (req.file) {
      try {
        const fs = require('fs');
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
          console.log(`ðŸ§¹ Cleaned up failed upload: ${req.file.path}`);
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

  console.log(`\nðŸ” [getUnreadCount] Started for conversationId: ${conversationId}, userId: ${userId}`);

  if (!conversationId) {
    console.warn(`âš ï¸  conversationId is required`);
    return res.status(400).json({ error: 'conversationId is required' });
  }

  try {
    const verifyQuery = `
      SELECT id FROM conversation_members 
      WHERE conversationId = ? AND userId = ?
      LIMIT 1
    `;

    console.log(`ðŸ” Verifying membership...`);
    const [verification] = await db.query(verifyQuery, [conversationId, userId]);

    if (verification.length === 0) {
      console.error(`âŒ User ${userId} is not a member of conversation ${conversationId}`);
      return res.status(403).json({ error: 'You are not a member of this conversation' });
    }

    console.log(`âœ… Membership verified`);

    const countQuery = `
      SELECT COUNT(*) as unreadCount
      FROM messages
      WHERE conversationId = ? AND isRead = FALSE AND senderId != ? AND isDeleted = FALSE
    `;

    console.log(`ðŸ“ Counting unread messages...`);
    const [result] = await db.query(countQuery, [conversationId, userId]);

    logQuery('getUnreadCount', Date.now() - startTime);
    console.log(`âœ… [getUnreadCount] Found ${result[0].unreadCount} unread messages\n`);
    res.json({ conversationId, unreadCount: result[0].unreadCount });
  } catch (err) {
    console.error('âŒ [getUnreadCount] Error:', err.message);
    res.status(500).json({ error: 'Failed to get unread count', details: err.message });
  }
};

// ============================================
// 12. GET ALL UNREAD MESSAGES FOR USER
// ============================================
exports.getAllUnreadMessages = async (req, res) => {
  const startTime = Date.now();
  const userId = req.user.id;

  console.log(`\nðŸ” [getAllUnreadMessages] Started for userId: ${userId}`);

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

    console.log(`ðŸ“ Fetching all unread messages...`);
    const [results] = await db.query(query, [userId, userId]);

    logQuery('getAllUnreadMessages', Date.now() - startTime);
    console.log(`âœ… [getAllUnreadMessages] Returned ${results.length} unread messages\n`);
    res.json(results);
  } catch (err) {
    console.error('âŒ [getAllUnreadMessages] Error:', err.message);
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

  console.log(`\nðŸ” [getTypingStatus] Started for conversationId: ${conversationId}`);

  if (!conversationId) {
    console.warn(`âš ï¸  conversationId is required`);
    return res.status(400).json({ error: 'conversationId is required' });
  }

  try {
    // Verify user is member of conversation
    const verifyQuery = `
      SELECT id FROM conversation_members 
      WHERE conversationId = ? AND userId = ?
      LIMIT 1
    `;

    const [verification] = await db.query(verifyQuery, [conversationId, userId]);

    if (verification.length === 0) {
      console.error(`âŒ User ${userId} is not a member of conversation ${conversationId}`);
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
        AND ts."lastUpdated" > NOW() - INTERVAL '5 seconds'
    `;

    console.log(`ðŸ“ Fetching typing users...`);
    const [typingUsers] = await db.query(typingQuery, [conversationId, userId]);

    logQuery('getTypingStatus', Date.now() - startTime);
    console.log(`âœ… [getTypingStatus] Found ${typingUsers.length} typing users\n`);

    res.json({
      conversationId,
      isTyping: typingUsers.length > 0,
      users: typingUsers.map(u => u.user_name)
    });
  } catch (err) {
    console.error('âŒ [getTypingStatus] Error:', err.message);
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

  console.log(`\nðŸ” [setTypingStatus] Started for conversationId: ${conversationId}, isTyping: ${isTyping}`);

  if (!conversationId || isTyping === undefined) {
    console.warn(`âš ï¸  conversationId and isTyping are required`);
    return res.status(400).json({ error: 'conversationId and isTyping are required' });
  }

  try {
    // Verify user is member of conversation
    const verifyQuery = `
      SELECT id FROM conversation_members 
      WHERE conversationId = ? AND userId = ?
      LIMIT 1
    `;

    const [verification] = await db.query(verifyQuery, [conversationId, userId]);

    if (verification.length === 0) {
      console.error(`âŒ User ${userId} is not a member of conversation ${conversationId}`);
      return res.status(403).json({ error: 'You are not a member of this conversation' });
    }

    const query = `
      INSERT INTO typing_status ("conversationId", "userId", "isTyping", "lastUpdated")
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT ("conversationId", "userId") DO UPDATE SET
      "isTyping" = EXCLUDED."isTyping",
      "lastUpdated" = NOW()
    `;

    console.log(`ðŸ“ Updating typing status...`);
    await db.query(query, [conversationId, userId, isTyping]);

    logQuery('setTypingStatus', Date.now() - startTime);
    console.log(`âœ… [setTypingStatus] Status updated\n`);
    res.json({ message: 'Typing status updated', conversationId, isTyping });
  } catch (err) {
    console.error('âŒ [setTypingStatus] Error:', err.message);
    res.status(500).json({ error: 'Failed to update typing status', details: err.message });
  }
};

// ============================================
// 15. UPLOAD FILE ENDPOINT
// ============================================
exports.uploadFile = async (req, res) => {
  const startTime = Date.now();

  console.log(`\nðŸ” [uploadFile] Started`);
  console.log(`ðŸ“ File: ${req.file?.filename}, Size: ${req.file?.size} bytes`);

  if (!req.file) {
    console.warn(`âš ï¸  No file provided`);
    return res.status(400).json({ error: 'No file provided' });
  }

  try {
    const fileUrl = `/uploads/${req.file.filename}`;
    
    logQuery('uploadFile', Date.now() - startTime);
    console.log(`âœ… [uploadFile] File uploaded successfully\n`);
    
    res.status(201).json({
      fileUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      message: 'File uploaded successfully'
    });
  } catch (err) {
    console.error('âŒ [uploadFile] Error:', err.message);
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

  console.log(`\nðŸ” [addReaction] Started`);
  console.log(`ðŸ’¬ messageId: ${messageId}, emoji: ${emoji}, userId: ${userId}`);

  if (!messageId || !emoji) {
    console.warn(`âš ï¸  messageId and emoji are required`);
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

    console.log(`ðŸ” Verifying message access...`);
    const [messageData] = await db.query(verifyQuery, [messageId, userId]);

    if (messageData.length === 0) {
      console.error(`âŒ Message ${messageId} not found or access denied`);
      return res.status(404).json({ error: 'Message not found or access denied' });
    }

    console.log(`âœ… Message verified`);

    const reactionQuery = `
      INSERT INTO message_reactions ("messageId", "userId", emoji, "createdAt")
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT ("messageId", "userId", emoji) DO UPDATE SET
      "createdAt" = NOW()
    `;

    console.log(`ðŸ“ Adding reaction: ${emoji}...`);
    const [result] = await db.query(reactionQuery, [messageId, userId, emoji]);
    console.log(`âœ… Reaction inserted`);

    const getAllReactionsQuery = `
      SELECT 
        emoji,
        COUNT(*) as count,
        json_agg(
          json_build_object(
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

    console.log(`ðŸ“ Fetching all reactions...`);
    const [reactions] = await db.query(getAllReactionsQuery, [messageId]);
    console.log(`âœ… Reactions fetched:`, reactions);

    const formattedReactions = (reactions || []).map(r => ({
      emoji: r.emoji,
      count: r.count,
      users: typeof r.users === 'string' ? JSON.parse(r.users) : r.users
    }));

    const duration = Date.now() - startTime;
    console.log(`â±ï¸  [addReaction] Query took ${duration}ms`);
    console.log(`âœ… [addReaction] Reaction added successfully\n`);

    res.status(201).json({
      messageId,
      reactions: formattedReactions,
      message: 'Reaction added successfully'
    });
  } catch (err) {
    console.error('âŒ [addReaction] Error:', err);
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

  console.log(`\nðŸ” [removeReaction] Started`);
  console.log(`ðŸ’¬ messageId: ${messageId}, emoji: ${emoji}, userId: ${userId}`);

  if (!messageId || !emoji) {
    console.warn(`âš ï¸  messageId and emoji are required`);
    return res.status(400).json({ error: 'messageId and emoji are required' });
  }

  try {
    // âœ… STEP 1: Verify message exists
    const verifyQuery = `
      SELECT m.id, m.conversationId
      FROM messages m
      JOIN conversation_members cm ON m.conversationId = cm.conversationId
      WHERE m.id = ? AND cm.userId = ? AND m.isDeleted = FALSE
      LIMIT 1
    `;

    console.log(`ðŸ” Verifying message access...`);
    const [messageData] = await db.query(verifyQuery, [messageId, userId]);

    if (messageData.length === 0) {
      console.error(`âŒ Message ${messageId} not found or access denied`);
      return res.status(404).json({ error: 'Message not found or access denied' });
    }

    console.log(`âœ… Message verified`);

    // âœ… STEP 2: Delete the reaction (only from current user)
    const deleteQuery = `
      DELETE FROM message_reactions
      WHERE messageId = ? AND userId = ? AND emoji = ?
    `;

    console.log(`ðŸ“ Removing reaction: ${emoji}...`);
    const [result] = await db.query(deleteQuery, [messageId, userId, emoji]);

    if (result.affectedRows === 0) {
      console.warn(`âš ï¸  Reaction not found`);
      return res.status(404).json({ error: 'Reaction not found' });
    }

    console.log(`âœ… Reaction removed`);

    // âœ… STEP 3: Get remaining reactions for this message
    const getAllReactionsQuery = `
      SELECT 
        emoji,
        COUNT(*) as count,
        json_agg(
          json_build_object(
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

    console.log(`ðŸ“ Fetching remaining reactions...`);
    const [reactions] = await db.query(getAllReactionsQuery, [messageId]);

    const duration = Date.now() - startTime;
    console.log(`â±ï¸  [removeReaction] Query took ${duration}ms`);
    console.log(`âœ… [removeReaction] Reaction removed successfully\n`);

    res.json({
      messageId,
      reactions: reactions.map(r => ({
        emoji: r.emoji,
        count: r.count,
        users: typeof r.users === 'string' ? JSON.parse(r.users) : (r.users || [])
      })) || [],
      message: 'Reaction removed successfully'
    });
  } catch (err) {
    console.error('âŒ [removeReaction] Error:', err.message);
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

  console.log(`\nðŸ” [getMessageReactions] Started for messageId: ${messageId}`);

  if (!messageId) {
    console.warn(`âš ï¸  messageId is required`);
    return res.status(400).json({ error: 'messageId is required' });
  }

  try {
    // âœ… Verify user has access to message
    const verifyQuery = `
      SELECT m.id, m.conversationId
      FROM messages m
      JOIN conversation_members cm ON m.conversationId = cm.conversationId
      WHERE m.id = ? AND cm.userId = ? AND m.isDeleted = FALSE
      LIMIT 1
    `;

    console.log(`ðŸ” Verifying message access...`);
    const [messageData] = await db.query(verifyQuery, [messageId, userId]);

    if (messageData.length === 0) {
      console.error(`âŒ Message ${messageId} not found or access denied`);
      return res.status(404).json({ error: 'Message not found or access denied' });
    }

    // âœ… Get all reactions grouped by emoji
    const reactionsQuery = `
      SELECT 
        emoji,
        COUNT(*) as count,
        json_agg(
          json_build_object(
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

    console.log(`ðŸ“ Fetching reactions...`);
    const [reactions] = await db.query(reactionsQuery, [userId, messageId]);

    // âœ… Parse JSON arrays
    const formattedReactions = reactions.map(r => ({
      emoji: r.emoji,
      count: r.count,
      users: typeof r.users === 'string' ? JSON.parse(r.users) : (r.users || []),
      currentUserReacted: r.currentUserReacted === 1
    }));

    const duration = Date.now() - startTime;
    console.log(`â±ï¸  [getMessageReactions] Query took ${duration}ms`);
    console.log(`âœ… [getMessageReactions] Returned ${formattedReactions.length} reaction types\n`);

    res.json({
      messageId,
      reactions: formattedReactions
    });
  } catch (err) {
    console.error('âŒ [getMessageReactions] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch reactions', details: err.message });
  }
};

// ============================================
// 4. GET DEFAULT EMOJI REACTIONS
// ============================================
exports.getDefaultEmojis = async (req, res) => {
  const startTime = Date.now();

  console.log(`\nðŸ” [getDefaultEmojis] Started`);

  try {
    const query = `
      SELECT emoji, label
      FROM reaction_emojis
      ORDER BY id ASC
    `;

    console.log(`ðŸ“ Fetching default emojis...`);
    const [emojis] = await db.query(query);

    const duration = Date.now() - startTime;
    console.log(`â±ï¸  [getDefaultEmojis] Query took ${duration}ms`);
    console.log(`âœ… [getDefaultEmojis] Returned ${emojis.length} emojis\n`);

    res.json(emojis);
  } catch (err) {
    console.error('âŒ [getDefaultEmojis] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch emojis', details: err.message });
  }
};
