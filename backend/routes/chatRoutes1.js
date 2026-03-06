// ============================================
// CHAT ROUTES
// File: routes/chatRoutes.js
// ============================================

const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// Try to import auth middleware
try {
  const { authenticateUser } = require('../middleware/auth');
  router.use(authenticateUser);
  console.log('✅ Auth middleware loaded for chat routes');
} catch (error) {
  console.warn('⚠️ Auth middleware not found - chat routes are public');
}


// ============================================
// CONVERSATION ROUTES
// ============================================

/**
 * GET /api/chat/conversations
 * Get all conversations for the logged-in user
 * Returns: Array of conversations with unread count and last message
 */
router.get('/conversations', chatController.getConversations);

/**
 * POST /api/chat/conversation
 * Create or get a direct conversation with another user
 * Body: { otherUserId: number }
 * Returns: { id: number, isNew: boolean }
 */
router.post('/conversation', chatController.createConversation);


// ============================================
// MESSAGE ROUTES
// ============================================

/**
 * GET /api/chat/messages/:conversationId
 * Get all messages in a conversation
 * Query params: ?limit=50&offset=0 (optional for pagination)
 * Returns: Array of messages with sender details
 */
router.get('/messages/:conversationId', chatController.getMessages);

/**
 * POST /api/chat/message
 * Send a new message in a conversation
 * Body: { 
 *   conversationId: number, 
 *   content: string, 
 *   messageType: 'text' | 'file' | 'image' (optional, default 'text'),
 *   fileUrl: string (optional, for file/image messages)
 * }
 * Returns: Message object with sender details
 */
router.post('/message', chatController.sendMessage);

/**
 * DELETE /api/chat/message/:messageId
 * Delete a message (soft delete - only your own messages)
 * Returns: { message: string }
 */
router.delete('/message/:messageId', chatController.deleteMessage);

/**
 * PUT /api/chat/mark-read
 * Mark all messages in a conversation as read
 * Body: { conversationId: number }
 * Returns: { message: string, affectedRows: number }
 */
router.put('/mark-read', chatController.markAsRead);

/**
 * GET /api/chat/search
 * Search messages in a conversation
 * Query params: ?conversationId=1&searchTerm=hello
 * Returns: Array of matching messages
 */
router.get('/search', chatController.searchMessages);


// ============================================
// USER STATUS ROUTES
// ============================================

/**
 * GET /api/chat/status
 * Get online status of all users
 * Returns: Array of users with isOnline and lastSeen status
 */
router.get('/status', chatController.getUserStatus);

/**
 * PUT /api/chat/status
 * Update the logged-in user's online status
 * Body: { isOnline: boolean }
 * Returns: { message: string, isOnline: boolean }
 */
router.put('/status', chatController.updateUserStatus);


// ============================================
// ERROR HANDLING MIDDLEWARE
// ============================================
router.use((err, req, res, next) => {
  console.error('Chat route error:', err);
  res.status(500).json({ 
    error: 'An error occurred in chat routes',
    message: err.message 
  });
});


module.exports = router;