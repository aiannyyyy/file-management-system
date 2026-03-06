const db = require('../db');

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

    console.log(`📝 Executing query...`);
    const [results] = await db.query(query, [userId, userId]);
    
    // ✅ ADD THIS LINE HERE TO SEE WHAT'S BEING RETURNED
    console.log('📊 Results sample:', JSON.stringify(results[0], null, 2));
    
    logQuery('getConversations', Date.now() - startTime);
    console.log(`✅ [getConversations] Returned ${results.length} conversations\n`);
    
    // Log the results to see what's being returned
    results.forEach(r => {
      console.log(`  - Conversation ${r.id}: name="${r.name}", user_name="${r.user_name}"`);
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

  console.log(`\n🔍 [getMessages] Started for conversationId: ${conversationId}, userId: ${userId}`);
  console.log(`📊 Pagination: limit=${limit}, offset=${offset}`);

  try {
    // Verify membership
    const verifyQuery = `
      SELECT id FROM conversation_members 
      WHERE conversationId = ? AND userId = ?
      LIMIT 1
    `;

    const [verification] = await db.query(verifyQuery, [conversationId, userId]);

    if (verification.length === 0) {
      console.error(`❌ User ${userId} is not a member of conversation ${conversationId}`);
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

    console.log(`📝 Fetching messages...`);
    const [results] = await db.query(messageQuery, [conversationId, limit, offset]);

    logQuery('getMessages', Date.now() - startTime);
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
    // Verify membership
    const verifyQuery = `
      SELECT id FROM conversation_members 
      WHERE conversationId = ? AND userId = ?
      LIMIT 1
    `;

    console.log(`🔐 Verifying membership...`);
    const [verification] = await db.query(verifyQuery, [conversationId, senderId]);

    if (verification.length === 0) {
      console.error(`❌ User ${senderId} not a member of conversation ${conversationId}`);
      return res.status(403).json({ error: 'You are not a member of this conversation' });
    }

    console.log(`✅ Membership verified`);

    // Insert message
    const insertQuery = `
      INSERT INTO messages (conversationId, senderId, content, messageType, fileUrl, createdAt)
      VALUES (?, ?, ?, ?, ?, NOW())
    `;

    const type = messageType || 'text';
    console.log(`📝 Inserting message...`);
    const [result] = await db.query(insertQuery, [conversationId, senderId, content, type, fileUrl || null]);

    console.log(`✅ Message inserted with ID: ${result.insertId}`);

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
    const query = `
      UPDATE messages 
      SET isRead = TRUE
      WHERE conversationId = ? AND senderId != ? AND isDeleted = FALSE
    `;

    console.log(`📝 Marking messages as read...`);
    const [result] = await db.query(query, [conversationId, userId]);

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
    const userCheckQuery = `SELECT id, user_name FROM users WHERE id = ? LIMIT 1`;
    const [userData] = await db.query(userCheckQuery, [otherUserId]);

    if (userData.length === 0) {
      console.error(`❌ User ${otherUserId} not found`);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`✅ User found: ${userData[0].user_name}`);
    console.log(`🔍 Checking if conversation already exists...`);

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
      console.log(`✅ Existing conversation found: ${existing[0].id}`);
      logQuery('createConversation', Date.now() - startTime);
      return res.json({ id: existing[0].id, isNew: false });
    }

    console.log(`📝 Creating new conversation...`);

    const conversationName = `Direct Chat with ${userData[0].user_name}`;
    const createQuery = `
      INSERT INTO conversations (conversationName, conversationType, createdBy, createdAt)
      VALUES (?, ?, ?, NOW())
    `;

    const [createResult] = await db.query(createQuery, [conversationName, 'direct', userId]);
    const conversationId = createResult.insertId;
    console.log(`✅ Conversation created with ID: ${conversationId}`);

    console.log(`👥 Adding members to conversation...`);

    const memberQuery = `
      INSERT INTO conversation_members (conversationId, userId, joinedAt)
      VALUES (?, ?, NOW()), (?, ?, NOW())
    `;

    await db.query(memberQuery, [conversationId, userId, conversationId, otherUserId]);

    logQuery('createConversation', Date.now() - startTime);
    console.log(`✅ [createConversation] Conversation created and members added\n`);
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
    const query = `
      UPDATE messages
      SET isDeleted = TRUE, deletedAt = NOW()
      WHERE id = ? AND senderId = ?
    `;

    console.log(`📝 Deleting message...`);
    const [result] = await db.query(query, [messageId, userId]);

    if (result.affectedRows === 0) {
      console.error(`❌ User ${userId} cannot delete message ${messageId}`);
      return res.status(403).json({ error: 'Unauthorized - You can only delete your own messages' });
    }

    logQuery('deleteMessage', Date.now() - startTime);
    console.log(`✅ [deleteMessage] Message deleted successfully\n`);
    res.json({ message: 'Message deleted successfully' });
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
    await db.query(query, [userId, isOnline]);

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
    const [results] = await db.query(query);

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
    // Verify membership
    const verifyQuery = `
      SELECT id FROM conversation_members 
      WHERE conversationId = ? AND userId = ?
      LIMIT 1
    `;

    console.log(`🔐 Verifying membership...`);
    const [verification] = await db.query(verifyQuery, [conversationId, userId]);

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
    const [results] = await db.query(searchQuery, [conversationId, `%${searchTerm}%`]);

    logQuery('searchMessages', Date.now() - startTime);
    console.log(`✅ [searchMessages] Found ${results.length} results\n`);
    res.json(results);
  } catch (err) {
    console.error('❌ [searchMessages] Error:', err.message);
    res.status(500).json({ error: 'Failed to search messages', details: err.message });
  }
};