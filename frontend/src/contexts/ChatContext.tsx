// ============================================
// COMPLETE FIXED CHAT CONTEXT
// File: contexts/ChatContext.tsx
// ============================================

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import io, { Socket } from 'socket.io-client';

// Type Definitions
export interface User {
  id: number;
  user_name: string;
  name: string;
  email: string;
  position?: string;
  isOnline?: boolean;
  lastSeen?: string;
}

export interface Message {
  id: number;
  conversationId: number;
  senderId: number;
  content: string;
  messageType: 'text' | 'file' | 'image' | 'document' | 'deleted';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  isRead: boolean;
  isDeleted?: boolean;
  createdAt: string;
  userId?: number;
  user_name?: string;
  name?: string;
  position?: string;
  email?: string;
}

export interface Conversation {
  id: number;
  conversationName: string;
  conversationType: 'direct' | 'group';
  createdAt: string;
  otherUserId?: number;
  user_name?: string;
  name?: string;
  email?: string;
  position?: string;  // ✅ ADD THIS
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount: number;
  isOnline?: boolean;
}

export interface ChatContextType {
  conversations: Conversation[];
  messages: Message[];
  activeConversation: number | null;
  currentUser: User | null;
  typingUsers: { [key: number]: string[] };
  onlineUsers: number[];
  socket: Socket | null;
  isConnected: boolean;

  initializeSocket: (userId: number, userData: User) => void;
  getConversations: () => Promise<void>;
  getMessages: (conversationId: number) => Promise<void>;
  sendMessage: (conversationId: number, content: string, messageType?: string, fileUrl?: string) => Promise<void>;
  createConversation: (otherUserId: number) => Promise<number | null>;
  setActiveConversation: (conversationId: number | null) => void;
  markAsRead: (conversationId: number) => Promise<void>;
  deleteMessage: (messageId: number) => Promise<void>;
  setTyping: (conversationId: number, isTyping: boolean) => void;
  disconnectSocket: () => void;
  getUnreadCount: (conversationId: number) => Promise<number>;
  getAllUnreadMessages: () => Promise<Message[]>;
  attachFile: (conversationId: number, file: File) => Promise<string | null>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode; userId?: number }> = ({ children, userId }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeConversation, setActiveConversation] = useState<number | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [typingUsers, setTypingUsers] = useState<{ [key: number]: string[] }>({});
  const [onlineUsers, setOnlineUsers] = useState<number[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const activeConversationRef = useRef<number | null>(null);
  const currentUserRef = useRef<User | null>(null);
  const lastReadConversationRef = useRef<number | null>(null); // ✅ NEW

  const typingPollInterval = useRef<NodeJS.Timeout | null>(null);
  const conversationsPollInterval = useRef<NodeJS.Timeout | null>(null);
  const conversationsPollFailures = useRef(0);

  const API_URL = import.meta.env.VITE_API_URL || "${import.meta.env.VITE_API_URL || "http://localhost:3002"}";
  const token = localStorage.getItem('token') || localStorage.getItem('authToken');

  // Update refs when state changes
  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // ============================================
  // 1️⃣ GET CONVERSATIONS
  // ============================================
  const getConversations = useCallback(async () => {
    try {
      console.log('📤 Fetching conversations...');
      const response = await fetch(`${API_URL}/api/chat/conversations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch conversations');
      const data = await response.json();
      console.log('✅ Conversations fetched:', data.length);
      setConversations(data);
    } catch (error) {
      console.error('❌ Error fetching conversations:', error);
    }
  }, [API_URL, token]);

  // ============================================
  // 2️⃣ MARK AS READ - FIXED
  // ============================================
  const markAsRead = useCallback(
    async (conversationId: number) => {
      try {
        console.log('📤 Marking messages as read for conversation:', conversationId);
        
        // ✅ Store which conversation we just marked as read
        lastReadConversationRef.current = conversationId;
        
        // ✅ FIX 1: Immediately update conversations state FIRST
        setConversations(prev =>
          prev.map(conv =>
            conv.id === conversationId
              ? { ...conv, unreadCount: 0 }
              : conv
          )
        );
        
        // ✅ FIX 2: Update messages state
        setMessages(prev =>
          prev.map(msg =>
            msg.conversationId === conversationId && msg.senderId !== currentUser?.id
              ? { ...msg, isRead: true }
              : msg
          )
        );

        // ✅ FIX 3: Then update on server
        const response = await fetch(`${API_URL}/api/chat/mark-read`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ conversationId })
        });

        if (response.ok) {
          console.log('✅ Server marked messages as read');
          
          // ✅ Clear the ref after 2 seconds
          setTimeout(() => {
            lastReadConversationRef.current = null;
          }, 2000);
        } else {
          console.error('❌ Failed to mark as read on server');
          lastReadConversationRef.current = null;
        }
      } catch (error) {
        console.error('❌ Error marking as read:', error);
        lastReadConversationRef.current = null;
      }
    },
    [API_URL, token, currentUser?.id]
  );

  // ============================================
  // 3️⃣ GET MESSAGES - FIXED
  // ============================================
  const getMessages = useCallback(
    async (conversationId: number) => {
      try {
        console.log('📤 Fetching messages for conversation:', conversationId);

        setActiveConversation(conversationId);
        
        // ✅ Mark as read IMMEDIATELY
        setConversations(prev =>
          prev.map(conv =>
            conv.id === conversationId
              ? { ...conv, unreadCount: 0 }
              : conv
          )
        );

        const response = await fetch(
          `${API_URL}/api/chat/messages/${conversationId}?limit=50&offset=0`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!response.ok) throw new Error('Failed to fetch messages');
        const data = await response.json();
        console.log('✅ Messages fetched:', data.length);
        
        setMessages(data);

        if (socket && currentUser) {
          socket.emit('join-conversation', {
            conversationId,
            userId: currentUser.id
          });
        }

        await markAsRead(conversationId);
      } catch (error) {
        console.error('❌ Error fetching messages:', error);
      }
    },
    [API_URL, token, socket, currentUser, markAsRead]
  );

  // ============================================
  // 4️⃣ SEND MESSAGE
  // ============================================
  const sendMessage = useCallback(
    async (conversationId: number, content: string, messageType = 'text', fileUrl?: string) => {
      try {
        console.log('📤 Sending message...', { conversationId, messageType });

        const response = await fetch(`${API_URL}/api/chat/message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            conversationId,
            content,
            messageType,
            fileUrl
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to send message');
        }

        const message = await response.json();
        console.log('✅ Message sent successfully:', message.id);

        setMessages(prev => [...prev, message]);

        if (socket) {
          socket.emit('send-message', {
            conversationId,
            senderId: currentUser?.id,
            senderName: currentUser?.name,
            content,
            messageType,
            messageId: message.id,
            fileUrl,
            timestamp: message.createdAt
          });
        }

        await getConversations();
      } catch (error) {
        console.error('❌ Error sending message:', error);
        throw error;
      }
    },
    [API_URL, token, socket, currentUser, getConversations]
  );

  // ============================================
  // 5️⃣ CREATE CONVERSATION
  // ============================================
  const createConversation = useCallback(
    async (otherUserId: number) => {
      try {
        console.log('📤 Creating conversation with user:', otherUserId);
        const response = await fetch(`${API_URL}/api/chat/conversation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ otherUserId })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create conversation');
        }

        const data = await response.json();
        console.log('✅ Conversation created:', data);

        await getConversations();

        return data.id;
      } catch (error) {
        console.error('❌ Error creating conversation:', error);
        throw error;
      }
    },
    [API_URL, token, getConversations]
  );

  // ============================================
  // 6️⃣ DELETE MESSAGE
  // ============================================
  const deleteMessage = useCallback(
    async (messageId: number) => {
      try {
        console.log('🗑️ Deleting message:', messageId);
        
        const response = await fetch(`${API_URL}/api/chat/message/${messageId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to delete message');

        const data = await response.json();
        console.log('✅ Message deleted');

        setMessages(prev =>
          prev.map(msg =>
            msg.id === messageId
              ? {
                  ...msg,
                  content: 'This message was removed',
                  messageType: 'deleted' as any,
                  isDeleted: true
                }
              : msg
          )
        );

        if (socket && activeConversation) {
          socket.emit('delete-message', {
            messageId,
            conversationId: activeConversation,
            modifiedContent: data.modifiedContent
          });
        }

        await getConversations();
      } catch (error) {
        console.error('❌ Error deleting message:', error);
      }
    },
    [API_URL, token, socket, activeConversation, getConversations]
  );

  // ============================================
  // 7️⃣ SET TYPING
  // ============================================
  const setTyping = useCallback(
    async (conversationId: number, isTyping: boolean) => {
      if (!currentUser) return;

      try {
        await fetch(`${API_URL}/api/chat/typing`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ conversationId, isTyping })
        });
      } catch (error) {
        console.error('❌ Error setting typing status:', error);
      }
    },
    [API_URL, token, currentUser]
  );

  // ============================================
  // 8️⃣ GET UNREAD COUNT
  // ============================================
  const getUnreadCount = useCallback(
    async (conversationId: number): Promise<number> => {
      try {
        const response = await fetch(
          `${API_URL}/api/chat/unread/${conversationId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!response.ok) throw new Error('Failed to fetch unread count');
        const data = await response.json();
        return data.unreadCount;
      } catch (error) {
        console.error('❌ Error fetching unread count:', error);
        return 0;
      }
    },
    [API_URL, token]
  );

  // ============================================
  // 9️⃣ GET ALL UNREAD MESSAGES
  // ============================================
  const getAllUnreadMessages = useCallback(
    async (): Promise<Message[]> => {
      try {
        const response = await fetch(`${API_URL}/api/chat/unread-all`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to fetch unread messages');
        const data = await response.json();
        return data;
      } catch (error) {
        console.error('❌ Error fetching unread messages:', error);
        return [];
      }
    },
    [API_URL, token]
  );

  // ============================================
  // 🔟 ATTACH FILE
  // ============================================
  const attachFile = useCallback(
    async (conversationId: number, file: File): Promise<string | null> => {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('conversationId', conversationId.toString());

        const response = await fetch(`${API_URL}/api/chat/attach-file`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: formData
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to attach file');
        }

        const message = await response.json();

        setMessages(prev => [...prev, message]);

        if (socket) {
          socket.emit('send-message', {
            conversationId,
            senderId: currentUser?.id,
            senderName: currentUser?.name,
            content: message.content,
            messageType: 'file',
            messageId: message.id,
            fileUrl: message.fileUrl,
            timestamp: message.createdAt
          });
        }

        await getConversations();

        return message.fileUrl;
      } catch (error) {
        console.error('❌ Error attaching file:', error);
        throw error;
      }
    },
    [API_URL, token, socket, currentUser?.id, getConversations]
  );

  // ============================================
  // POLL TYPING STATUS
  // ============================================
  const pollTypingStatus = useCallback(async () => {
    if (!activeConversation || !token) return;

    try {
      const response = await fetch(`${API_URL}/api/chat/typing/${activeConversation}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();

        if (data.isTyping && data.users && data.users.length > 0) {
          setTypingUsers(prev => ({
            ...prev,
            [activeConversation]: data.users.map(() => '')
          }));
        } else {
          setTypingUsers(prev => ({
            ...prev,
            [activeConversation]: []
          }));
        }
      }
    } catch (error) {
      console.error('Error polling typing status:', error);
    }
  }, [activeConversation, token, API_URL]);

  // ============================================
  // POLL CONVERSATIONS - FIXED
  // ============================================
  const pollConversations = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/api/chat/conversations`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        conversationsPollFailures.current += 1;
        if (conversationsPollFailures.current === 1) {
          console.error('Error polling conversations:', response.status, await response.text());
        }
        if (conversationsPollFailures.current >= 3 && conversationsPollInterval.current) {
          clearInterval(conversationsPollInterval.current);
          conversationsPollInterval.current = null;
        }
        return;
      }

      conversationsPollFailures.current = 0;
      const data = await response.json();
      
      setConversations(data.map((newConv: any) => {
        if (newConv.id === lastReadConversationRef.current) {
          return { ...newConv, unreadCount: 0 };
        }
        
        if (newConv.id === activeConversationRef.current) {
          return { ...newConv, unreadCount: 0 };
        }
        
        return newConv;
      }));
    } catch (error) {
      conversationsPollFailures.current += 1;
      if (conversationsPollFailures.current === 1) {
        console.error('Error polling conversations:', error);
      }
    }
  }, [token, API_URL]);

  // ============================================
  // START POLLING
  // ============================================
  useEffect(() => {
    if (activeConversation) {
      pollTypingStatus();
      typingPollInterval.current = setInterval(pollTypingStatus, 2000);

      return () => {
        if (typingPollInterval.current) {
          clearInterval(typingPollInterval.current);
        }
      };
    }
  }, [activeConversation, pollTypingStatus]);

  useEffect(() => {
    if (isConnected) {
      conversationsPollInterval.current = setInterval(pollConversations, 5000);

      return () => {
        if (conversationsPollInterval.current) {
          clearInterval(conversationsPollInterval.current);
        }
      };
    }
  }, [isConnected, pollConversations]);

  // ============================================
  // INITIALIZE SOCKET
  // ============================================
  const initializeSocket = useCallback((userId: number, userData: User) => {
    try {
      console.log('🔌 Connecting to Socket.io...');

      if (!token) {
        console.error('❌ No authentication token found');
        return;
      }

      const newSocket = io(API_URL, {
        auth: { token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
        transports: ['websocket', 'polling']
      });

      newSocket.on('connect', () => {
        console.log('✅ Connected to socket server');
        setIsConnected(true);
        conversationsPollFailures.current = 0;

        newSocket.emit('user-join', {
          userId: userData.id,
          userName: userData.user_name,
          email: userData.email
        });

        getConversations();
      });

      newSocket.on('connect_error', (error: any) => {
        console.error('❌ Socket connection error:', error);
      });

      newSocket.on('user-online', (data: { userId: number; userName: string; isOnline: boolean }) => {
        setOnlineUsers(prev => {
          if (!prev.includes(data.userId)) {
            return [...prev, data.userId];
          }
          return prev;
        });
      });

      newSocket.on('user-offline', (data: { userId: number; isOnline: boolean }) => {
        setOnlineUsers(prev => prev.filter(id => id !== data.userId));
      });

      newSocket.on('receive-message', async (message: Message) => {
        setMessages(prev => {
          if (prev.some(m => m.id === message.id)) {
            return prev;
          }
          return [...prev, message];
        });

        const isViewingConversation = activeConversationRef.current === message.conversationId;
        const isNotOwnMessage = message.senderId !== currentUserRef.current?.id;

        if (isViewingConversation && isNotOwnMessage) {
          try {
            const response = await fetch(`${API_URL}/api/chat/mark-read`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ conversationId: message.conversationId })
            });

            if (response.ok) {
              setMessages(prev =>
                prev.map(msg =>
                  msg.conversationId === message.conversationId && msg.senderId !== currentUserRef.current?.id
                    ? { ...msg, isRead: true }
                    : msg
                )
              );
            }
          } catch (error) {
            console.error('❌ Error auto-marking message as read:', error);
          }
        }

        pollConversations();
      });

      newSocket.on('message-read-update', (data: { messageId: number; readBy: number }) => {
        setMessages(prev =>
          prev.map(msg => (msg.id === data.messageId ? { ...msg, isRead: true } : msg))
        );
      });

      newSocket.on('message-deleted', (data: { messageId: number; modifiedContent?: string }) => {
        setMessages(prev =>
          prev.map(msg =>
            msg.id === data.messageId
              ? {
                  ...msg,
                  content: 'This message was removed',
                  messageType: 'deleted' as any,
                  isDeleted: true
                }
              : msg
          )
        );

        pollConversations();
      });

      newSocket.on('disconnect', () => {
        console.log('❌ Disconnected from socket server');
        setIsConnected(false);
      });

      setSocket(newSocket);
      setCurrentUser(userData);
    } catch (error) {
      console.error('Failed to initialize socket:', error);
    }
  }, [API_URL, token, pollConversations, getConversations]);

  // ============================================
  // DISCONNECT SOCKET
  // ============================================
  const disconnectSocket = useCallback(() => {
    if (typingPollInterval.current) {
      clearInterval(typingPollInterval.current);
    }
    if (conversationsPollInterval.current) {
      clearInterval(conversationsPollInterval.current);
    }
    if (socket) {
      socket.emit('user-disconnect', currentUser?.id);
      socket.disconnect();
      setSocket(null);
      setIsConnected(false);
    }
  }, [socket, currentUser?.id]);

  const handleSetActiveConversation = useCallback((conversationId: number | null) => {
    console.log('🔄 Setting active conversation:', conversationId);
    setActiveConversation(conversationId);
    activeConversationRef.current = conversationId;
  }, []);

  // ============================================
  // CONTEXT VALUE
  // ============================================
  const value: ChatContextType = {
    conversations,
    messages,
    activeConversation,
    currentUser,
    typingUsers,
    onlineUsers,
    socket,
    isConnected,
    initializeSocket,
    getConversations,
    getMessages,
    sendMessage,
    createConversation,
    setActiveConversation: handleSetActiveConversation,
    markAsRead,
    deleteMessage,
    setTyping,
    disconnectSocket,
    getUnreadCount,
    getAllUnreadMessages,
    attachFile
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

// ============================================
// CUSTOM HOOK
// ============================================
export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};