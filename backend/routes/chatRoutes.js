// ============================================
// CHAT ROUTES - FULLY FIXED WITH EXISTING MULTER CONFIG
// File: routes/chatRoutes.js
// ============================================
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { uploadSingle, handleMulterError } = require('../config/multerConfig');

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
 * POST /api/chat/attach-file
 * Attach a file to a conversation
 * Multipart form data with file field
 * Body: { conversationId: number }
 * Returns: Message object with file details
 */
router.post(
  '/attach-file',
  uploadSingle('file'),
  handleMulterError,
  chatController.attachFile
);

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
// UNREAD MESSAGE ROUTES
// ============================================
/**
 * GET /api/chat/unread/:conversationId
 * Get unread message count for a specific conversation
 * Returns: { conversationId: number, unreadCount: number }
 */
router.get('/unread/:conversationId', chatController.getUnreadCount);

/**
 * GET /api/chat/unread-all
 * Get all unread messages across all conversations for the logged-in user
 * Returns: Array of unread messages with conversation details
 */
router.get('/unread-all', chatController.getAllUnreadMessages);

// ============================================
// TYPING STATUS ROUTES
// ============================================
/**
 * GET /api/chat/typing/:conversationId
 * Get typing status for a conversation
 * Returns: { conversationId, isTyping, users: [...] }
 */
router.get('/typing/:conversationId', chatController.getTypingStatus);

/**
 * POST /api/chat/typing
 * Set typing status
 * Body: { conversationId: number, isTyping: boolean }
 * Returns: { message: string, conversationId, isTyping }
 */
router.post('/typing', chatController.setTypingStatus);

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
// FILE UPLOAD ROUTE
// ============================================
/**
 * POST /api/chat/upload
 * Upload a file (standalone endpoint)
 * Multipart form data with file field
 * Returns: { fileUrl, fileName, fileSize, fileType, message }
 */
router.post(
  '/upload',
  uploadSingle('file'),
  handleMulterError,
  (req, res) => {
    console.log('🔍 [uploadFile] Started');
    
    if (!req.file) {
      console.warn('⚠️ No file provided');
      return res.status(400).json({ error: 'No file provided' });
    }

    try {
      const fileUrl = `/uploads/${req.file.filename}`;
      
      console.log(`✅ File uploaded successfully: ${req.file.filename}`);
      
      return res.status(201).json({
        fileUrl,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        fileType: req.file.mimetype,
        message: 'File uploaded successfully'
      });
    } catch (err) {
      console.error('❌ [uploadFile] Error:', err.message);
      return res.status(500).json({ error: 'Failed to upload file', details: err.message });
    }
  }
);

// ============================================
// MESSAGE REACTIONS ROUTES
// Add after DELETE /api/chat/message/:messageId route
// ============================================
/**
 * POST /api/chat/reactions
 * Add a reaction to a message
 * Body: { messageId: number, emoji: string }
 * Returns: { messageId, reactions: [...], message: string }
 */
router.post('/reactions', chatController.addReaction);

/**
 * DELETE /api/chat/reactions
 * Remove a reaction from a message
 * Body: { messageId: number, emoji: string }
 * Returns: { messageId, reactions: [...], message: string }
 */
router.delete('/reactions', chatController.removeReaction);

/**
 * GET /api/chat/messages/:messageId/reactions
 * Get all reactions for a specific message
 * Returns: { messageId, reactions: [{ emoji, count, users, currentUserReacted }] }
 */
router.get('/messages/:messageId/reactions', chatController.getMessageReactions);

/**
 * GET /api/chat/emojis
 * Get default emoji reactions available
 * Returns: Array of { emoji, label }
 */
router.get('/emojis', chatController.getDefaultEmojis);

// ============================================
// ERROR HANDLING MIDDLEWARE
// ============================================
router.use((err, req, res, next) => {
  console.error('🔴 Chat route error:', err);

  // If error not handled by handleMulterError, handle it here
  if (err) {
    return res.status(500).json({ 
      error: 'An error occurred in chat routes',
      message: err.message,
      code: err.code
    });
  }

  next();
});

module.exports = router;