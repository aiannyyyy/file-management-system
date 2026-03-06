// ============================================
// SOCKET.IO REAL-TIME MESSAGING SETUP
// File: server.js (FIXED - Promise-based DB)
// ============================================

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const http = require("http");
const socketIo = require("socket.io");
require("dotenv").config();
const mysqlDb = require("./db");
const shareRoutes = require('./routes/shareRoutes');
const filesRoutes = require("./routes/files");
const notificationRoutes = require('./routes/notification');
const chatRoutes = require('./routes/chatRoutes');

const app = express();

// Create HTTP server for Socket.io
const server = http.createServer(app);

// Socket.io initialization with CORS
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ============================================
// SERVE UPLOADED FILES AS STATIC
// ============================================
const uploadsDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Created uploads directory:', uploadsDir);
}

app.use('/uploads', express.static(uploadsDir, {
  maxAge: '1d',
  etag: false,
  setHeaders: (res, filePath) => {
    const fileName = path.basename(filePath);
    
    if (fileName.endsWith('.pdf')) {
      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', 'inline');
      console.log(`📄 Serving PDF: ${fileName}`);
    }
    else if (fileName.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
      res.set('Content-Disposition', 'inline');
      console.log(`🖼️ Serving image: ${fileName}`);
    }
    else if (fileName.match(/\.(mp4|webm|ogg|mov|avi|mkv|flv)$/i)) {
      res.set('Content-Disposition', 'inline');
      console.log(`🎥 Serving video: ${fileName}`);
    }
    else if (fileName.match(/\.(mp3|wav|flac|aac|ogg|m4a|wma)$/i)) {
      res.set('Content-Disposition', 'inline');
      console.log(`🎵 Serving audio: ${fileName}`);
    }
    else if (fileName.match(/\.(txt|csv|json|xml|html|css|js|log)$/i)) {
      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.set('Content-Disposition', 'inline');
      console.log(`📝 Serving text: ${fileName}`);
    }
    else {
      res.set('Content-Disposition', 'attachment');
      console.log(`📦 Serving download: ${fileName}`);
    }
  }
}));

console.log('📂 Uploads directory serving at /uploads');
console.log(`📂 Full path: ${uploadsDir}`);

// ============================================
// API ROUTES
// ============================================
app.use("/api/auth", require("./routes/auth"));
app.use("/api/files", filesRoutes);
app.use("/api", require("./routes/categories"));
app.use('/api/share', shareRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/chat", chatRoutes);

// ============================================
// SERVE STATIC REACT APP
// ============================================
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// SOCKET.IO EVENT HANDLERS
// ============================================

const activeUsers = new Map();
const typingUsers = new Map();

io.on('connection', (socket) => {
  console.log(`✅ New user connected: ${socket.id}`);

  socket.on('user-join', (userData) => {
    const { userId, userName, email } = userData;
    
    activeUsers.set(userId, socket.id);
    socket.userId = userId;

    console.log(`👤 User ${userId} (${userName}) joined. Active users: ${activeUsers.size}`);

    // Update user status - ASYNC/AWAIT
    (async () => {
      try {
        const updateStatusQuery = `
          INSERT INTO user_status (userId, isOnline, lastSeen)
          VALUES (?, TRUE, CURRENT_TIMESTAMP)
          ON DUPLICATE KEY UPDATE
          isOnline = TRUE,
          lastSeen = CURRENT_TIMESTAMP
        `;
        await mysqlDb.query(updateStatusQuery, [userId]);
      } catch (err) {
        console.error('Error updating user status:', err.message);
      }
    })();

    io.emit('user-online', {
      userId,
      userName,
      isOnline: true,
      timestamp: new Date()
    });
  });

  socket.on('user-disconnect', (userId) => {
    activeUsers.delete(userId);
    console.log(`👤 User ${userId} disconnected. Active users: ${activeUsers.size}`);

    (async () => {
      try {
        const updateStatusQuery = `
          UPDATE user_status
          SET isOnline = FALSE, lastSeen = CURRENT_TIMESTAMP
          WHERE userId = ?
        `;
        await mysqlDb.query(updateStatusQuery, [userId]);
      } catch (err) {
        console.error('Error updating user status:', err.message);
      }
    })();

    io.emit('user-offline', {
      userId,
      isOnline: false,
      timestamp: new Date()
    });
  });

  // ============================================
  // MESSAGE EVENTS
  // ============================================

  socket.on('send-message', (messageData) => {
    const {
      conversationId,
      senderId,
      senderName,
      content,
      messageType,
      messageId,
      timestamp,
      fileUrl,
      fileName,
      fileSize,
      fileType
    } = messageData;

    console.log(`💬 Message sent in conversation ${conversationId} by user ${senderId}`);

    io.emit('receive-message', {
      id: messageId,
      conversationId,
      senderId,
      senderName,
      content,
      messageType,
      fileUrl,
      fileName,
      fileSize,
      fileType,
      isRead: false,
      createdAt: timestamp
    });

    if (typingUsers.has(conversationId)) {
      typingUsers.get(conversationId).delete(senderId);
    }

    io.emit('user-stop-typing', {
      conversationId,
      userId: senderId
    });
  });

  socket.on('message-read', (data) => {
    const { messageId, conversationId, userId } = data;

    console.log(`✅ Message ${messageId} read by user ${userId}`);

    io.emit('message-read-update', {
      messageId,
      conversationId,
      readBy: userId,
      readAt: new Date()
    });
  });

  socket.on('delete-message', (data) => {
    const { messageId, conversationId } = data;

    console.log(`🗑️ Message ${messageId} deleted in conversation ${conversationId}`);

    io.emit('message-deleted', {
      messageId,
      conversationId,
      timestamp: new Date()
    });
  });

  // ============================================
  // TYPING INDICATOR EVENTS
  // ============================================

  socket.on('typing', (data) => {
    const { conversationId, userId, userName } = data;

    if (!typingUsers.has(conversationId)) {
      typingUsers.set(conversationId, new Set());
    }

    typingUsers.get(conversationId).add(userId);

    console.log(`⌨️ User ${userId} typing in conversation ${conversationId}`);

    io.emit('user-typing', {
      conversationId,
      userId,
      userName,
      typingUsers: Array.from(typingUsers.get(conversationId) || [])
    });
  });

  socket.on('stop-typing', (data) => {
    const { conversationId, userId } = data;

    if (typingUsers.has(conversationId)) {
      typingUsers.get(conversationId).delete(userId);
    }

    console.log(`⌨️ User ${userId} stopped typing in conversation ${conversationId}`);

    io.emit('user-stop-typing', {
      conversationId,
      userId,
      typingUsers: typingUsers.has(conversationId) ? 
        Array.from(typingUsers.get(conversationId)) : []
    });
  });

  // ============================================
  // USER STATUS EVENTS
  // ============================================

  socket.on('get-active-users', () => {
    const activeUsersList = Array.from(activeUsers.keys());
    socket.emit('active-users-list', activeUsersList);
  });

  socket.on('user-status-change', (data) => {
    const { userId, status } = data;

    console.log(`📍 User ${userId} status changed to ${status}`);

    io.emit('user-status-update', {
      userId,
      status,
      timestamp: new Date()
    });
  });

  // ============================================
  // CONVERSATION EVENTS
  // ============================================

  socket.on('join-conversation', (data) => {
    const { conversationId, userId } = data;
    const roomName = `conversation-${conversationId}`;
    
    socket.join(roomName);
    console.log(`🔗 User ${userId} joined conversation ${conversationId}`);

    socket.to(roomName).emit('user-joined-conversation', {
      conversationId,
      userId,
      timestamp: new Date()
    });
  });

  socket.on('leave-conversation', (data) => {
    const { conversationId, userId } = data;
    const roomName = `conversation-${conversationId}`;
    
    socket.leave(roomName);
    console.log(`🚪 User ${userId} left conversation ${conversationId}`);

    io.to(roomName).emit('user-left-conversation', {
      conversationId,
      userId,
      timestamp: new Date()
    });

    if (typingUsers.has(conversationId)) {
      typingUsers.get(conversationId).delete(userId);
    }
  });

  // ============================================
  // DISCONNECT EVENT
  // ============================================

  socket.on('disconnect', () => {
    const userId = socket.userId;
    
    if (userId) {
      activeUsers.delete(userId);
      console.log(`❌ User ${userId} disconnected. Active users: ${activeUsers.size}`);

      (async () => {
        try {
          const updateStatusQuery = `
            UPDATE user_status
            SET isOnline = FALSE, lastSeen = CURRENT_TIMESTAMP
            WHERE userId = ?
          `;
          await mysqlDb.query(updateStatusQuery, [userId]);
        } catch (err) {
          console.error('Error updating user status on disconnect:', err.message);
        }
      })();

      io.emit('user-offline', {
        userId,
        isOnline: false,
        timestamp: new Date()
      });
    }
  });

  socket.on('error', (error) => {
    console.error(`Socket error for user ${socket.userId}:`, error);
  });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n✅ Server running at http://localhost:${PORT}`);
  console.log(`🔌 Socket.io ready for real-time messaging`);
  console.log(`📁 Uploads available at http://localhost:${PORT}/uploads\n`);
});

module.exports = { app, server, io };