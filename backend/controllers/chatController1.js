const db = require('../config/db');

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
      SELECT DISTINCT
        c.id,
        c.conversationName, 
        c.conversationType,
        c.createdAt,
        u.id as otherUserId,
        u.name,
        u.user_name,
        u.email,
        m.content as lastMessage,
        m.createdAt as lastMessageTime,
        us.isOnline,
        COALESCE(us.isOnline, FALSE) as isOnline
      FROM conversations c
      INNER JOIN conversation_members cm ON c.id = cm.conversationId
      LEFT JOIN conversation_members cm2 ON c.id = cm2.conversationId AND cm2.userId != ?
      LEFT JOIN users u ON cm2.userId = u.id
      LEFT JOIN messages m ON m.conversationId = c.id 
        AND m.isDeleted = FALSE 
        AND m.id = (
          SELECT id FROM messages 
          WHERE conversationId = c.id AND isDeleted = FALSE 
          ORDER BY createdAt DESC LIMIT 1
        )
      LEFT JOIN user_status us ON us.userId = u.id
      WHERE cm.userId = ?
      GROUP BY c.id, u.id
      ORDER BY COALESCE(m.createdAt, c.createdAt) DESC
      LIMIT 50
    `;

    console.log(`ðŸ“ Executing query...`);
    const [results] = await db.query(query, [userId, userId]);
    
    // âœ… ADD THIS LINE HERE TO SEE WHAT'S BEING RETURNED
    console.log('ðŸ“Š Results sample:', JSON.stringify(results[0], null, 2));
    
    logQuery('getConversations', Date.now() - startTime);
    console.log(`âœ… [getConversations] Returned ${results.length} conversations\n`);
    
    // Log the results to see what's being returned
    results.forEach(r => {
      console.log(`  - Conversation ${r.id}: name="${r.name}", user_name="${r.user_name}"`);
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

  console.log(`\nðŸ” [getMessages] Started for conversationId: ${conversationId}, userId: ${userId}`);
  console.log(`ðŸ“Š Pagination: limit=${limit}, offset=${offset}`);

  try {
    // Verify membership
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

    // Fetch messages
    const messageQuery = `
      SELECT 
        m.id,
        m.conversationId,
        m.senderId,
        m.content,
        m.messageType,
        m.fileUrl,
        m.isRead,
        m.createdAt,
        u.id as userId,
        u.user_name,
        u.name,
        u.email
      FROM messages m
      JOIN users u ON m.senderId = u.id
      WHERE m.conversationId = ? AND m.isDeleted = FALSE
      ORDER BY m.createdAt DESC
      LIMIT ? OFFSET ?
    `;

    console.log(`ðŸ“ Fetching messages...`);
    const [results] = await db.query(messageQuery, [conversationId, limit, offset]);

    logQuery('getMessages', Date.now() - startTime);
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
    // Verify membership
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

    // Insert message
    const insertQuery = `
      INSERT INTO messages (conversationId, senderId, content, messageType, fileUrl, createdAt)
      VALUES (?, ?, ?, ?, ?, NOW())
    `;

    const type = messageType || 'text';
    console.log(`ðŸ“ Inserting message...`);
    const [result] = await db.query(insertQuery, [conversationId, senderId, content, type, fileUrl || null]);

    console.log(`âœ… Message inserted with ID: ${result.insertId}`);

    // Fetch the inserted message
    const selectQuery = `
      SELECT 
        m.id,
        m.conversationId,
        m.senderId,
        m.content,
        m.messageType,
        m.fileUrl,
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
    const userCheckQuery = `SELECT id, user_name FROM users WHERE id = ? LIMIT 1`;
    const [userData] = await db.query(userCheckQuery, [otherUserId]);

    if (userData.length === 0) {
      console.error(`âŒ User ${otherUserId} not found`);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`âœ… User found: ${userData[0].user_name}`);
    console.log(`ðŸ” Checking if conversation already exists...`);

    // Check if conversation exists
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
      logQuery('createConversation', Date.now() - startTime);
      return res.json({ id: existing[0].id, isNew: false });
    }

    console.log(`ðŸ“ Creating new conversation...`);

    const conversationName = `Direct Chat with ${userData[0].user_name}`;
    const createQuery = `
      INSERT INTO conversations (conversationName, conversationType, createdBy, createdAt)
      VALUES (?, ?, ?, NOW())
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

    logQuery('createConversation', Date.now() - startTime);
    console.log(`âœ… [createConversation] Conversation created and members added\n`);
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
    const query = `
      UPDATE messages
      SET isDeleted = TRUE, deletedAt = NOW()
      WHERE id = ? AND senderId = ?
    `;

    console.log(`ðŸ“ Deleting message...`);
    const [result] = await db.query(query, [messageId, userId]);

    if (result.affectedRows === 0) {
      console.error(`âŒ User ${userId} cannot delete message ${messageId}`);
      return res.status(403).json({ error: 'Unauthorized - You can only delete your own messages' });
    }

    logQuery('deleteMessage', Date.now() - startTime);
    console.log(`âœ… [deleteMessage] Message deleted successfully\n`);
    res.json({ message: 'Message deleted successfully' });
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
      INSERT INTO user_status (userId, isOnline, lastSeen)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE
      isOnline = VALUES(isOnline),
      lastSeen = NOW()
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
    // Verify membership
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
