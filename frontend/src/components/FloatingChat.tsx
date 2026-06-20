// ============================================
// FLOATING CHAT COMPONENT - POSITION DISPLAY FIXED
// File: components/FloatingChat.tsx
// ============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useChat } from '../contexts/ChatContext';
import { useDarkMode } from '../contexts/DarkModeContext';
import { Send, MessageCircle, X, Plus, Search, Trash2, ArrowLeft, Paperclip, Loader } from 'lucide-react';
import '../styles/FloatingChat.css';
import FilePreviewModal from './FilePreviewModal';

// Constants
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const TYPING_TIMEOUT = 3000; // 3 seconds

// Types
interface ITempConversation {
  userId: number;
  user: any;
}

interface IFilePreview {
  url: string;
  name: string;
  type: string;
}

const FloatingChat: React.FC = () => {
  const {
    conversations,
    messages,
    activeConversation,
    currentUser,
    typingUsers,
    onlineUsers,
    isConnected,
    initializeSocket,
    getConversations,
    getMessages,
    sendMessage,
    createConversation,
    setActiveConversation,
    deleteMessage,
    markAsRead,
    setTyping,
    attachFile
  } = useChat();

  // State
  const [isOpen, setIsOpen] = useState(false);
  const { isDarkMode } = useDarkMode();
  const [messageInput, setMessageInput] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [messageSearchInput, setMessageSearchInput] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [tempConversation, setTempConversation] = useState<ITempConversation | null>(null);
  const [previewFile, setPreviewFile] = useState<IFilePreview | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showMessageSearch, setShowMessageSearch] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API_URL = typeof process !== 'undefined' && process.env?.REACT_APP_API_URL 
    ? process.env.REACT_APP_API_URL 
    : import.meta.env.VITE_API_URL || "${import.meta.env.VITE_API_URL || "http://localhost:3002"}";
  const token = typeof localStorage !== 'undefined' 
    ? (localStorage.getItem('token') || localStorage.getItem('authToken')) 
    : null;

  // Initialize socket on mount
  useEffect(() => {
    if (currentUser && !isConnected) {
      try {
        initializeSocket(currentUser.id, currentUser);
      } catch (error) {
        console.error('Failed to initialize socket:', error);
      }
    }
  }, [currentUser, isConnected, initializeSocket]);

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Load conversations when chat opens
  useEffect(() => {
    if (isOpen) {
      getConversations();
    }
  }, [isOpen, getConversations]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeConversation, tempConversation]);

  // Mark messages as read
  useEffect(() => {
    if (activeConversation) {
      markAsRead(activeConversation);
    }
  }, [activeConversation, markAsRead]);

  // Fetch all users for new chat
  const fetchAllUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      if (!token) {
        console.error('No authentication token found');
        setIsLoadingUsers(false);
        return;
      }

      const response = await fetch(`${API_URL}/api/auth/users`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAllUsers(data.filter((u: any) => u.id !== currentUser?.id));
      } else {
        console.error('Failed to fetch users:', response.status);
        setAllUsers([]);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      setAllUsers([]);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [API_URL, token, currentUser?.id]);

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        alert(`File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
        return;
      }
      setSelectedFile(file);
    }
  };

  // Handle starting a temp chat
  const handleStartChat = async (userId: number, user: any) => {
    setTempConversation({ userId, user });
    setShowNewChat(false);
    setMessageInput('');
    setSearchInput('');
  };

  // Handle sending message (creates conversation if needed)
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if ((!messageInput.trim() && !selectedFile) || (!activeConversation && !tempConversation) || isSending) {
      return;
    }

    setIsSending(true);

    try {
      let conversationId = activeConversation;

      // Create conversation on first message in temp chat
      if (!conversationId && tempConversation) {
        conversationId = await createConversation(tempConversation.userId);

        if (!conversationId) {
          throw new Error('Failed to create conversation');
        }

        setActiveConversation(conversationId);
        setTempConversation(null);

        // ✅ FIX: Refresh conversations immediately to ensure position is loaded
        await getConversations();
        await getMessages(conversationId);
      }

      if (!conversationId) {
        throw new Error('No conversation available');
      }

      if (selectedFile) {
        await attachFile(conversationId, selectedFile);
        setSelectedFile(null);
        setMessageInput('');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else if (messageInput.trim()) {
        await sendMessage(conversationId, messageInput.trim(), 'text');
        setMessageInput('');
      }

      setIsTyping(false);
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setIsSending(false);
      if (activeConversation) {
        setTyping(activeConversation, false);
      }
    }
  };

  // Handle typing indicator
  const handleTyping = (value: string) => {
    setMessageInput(value);

    const convId = activeConversation || tempConversation?.userId;
    if (!convId) return;

    if (!isTyping && value.length > 0) {
      setIsTyping(true);
      if (activeConversation) {
        setTyping(activeConversation, true);
      }
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (value.length === 0) {
      if (activeConversation) {
        setIsTyping(false);
        setTyping(activeConversation, false);
      }
    } else {
      typingTimeoutRef.current = setTimeout(() => {
        if (activeConversation) {
          setIsTyping(false);
          setTyping(activeConversation, false);
        }
      }, TYPING_TIMEOUT);
    }
  };

  // Helper functions
  const getConversationName = (conv: any): string => {
    if (conv.conversationType === 'direct') {
      // ✅ FIXED: Priority now shows position first
      return conv.position || conv.name || conv.user_name || 'User';
    }
    return conv.conversationName || 'Conversation';
  };

  const formatTime = (timestamp: string): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const convertUrlToAbsolute = (fileUrl: string): string => {
    if (!fileUrl) return '';
    if (fileUrl.startsWith('http')) return fileUrl;
    return `${API_URL}${fileUrl}`;
  };

  // Open file preview
  const handleOpenFile = (fileUrl: string, fileName: string, fileType: string) => {
    const fullUrl = convertUrlToAbsolute(fileUrl);
    setPreviewFile({
      url: fullUrl,
      name: fileName,
      type: fileType
    });
    setShowPreview(true);
  };

  // Close file preview
  const handleClosePreview = () => {
    setShowPreview(false);
    setPreviewFile(null);
  };

  // Filter conversations based on search input
  const filteredConversations = conversations.filter((conv) =>
    getConversationName(conv).toLowerCase().includes(searchInput.toLowerCase())
  );

  // Filter users based on search input
  const filteredUsers = allUsers.filter((user) =>
    user.position?.toLowerCase().includes(searchInput.toLowerCase()) ||
    user.name?.toLowerCase().includes(searchInput.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchInput.toLowerCase())
  );

  // Computed values
  const activeConv = conversations.find(c => c.id === activeConversation);
  const currentTypingUsers = typingUsers[activeConversation!] || [];
  const totalUnread = conversations.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
  
  // Filter messages by conversation AND search query
  const filteredMessages = messages
    .filter(msg => msg.conversationId === activeConversation)
    .filter(msg => {
      if (!messageSearchInput.trim()) return true;
      
      const searchTerm = messageSearchInput.toLowerCase();
      const content = msg.content?.toLowerCase() || '';
      const fileName = msg.fileName?.toLowerCase() || '';
      
      return content.includes(searchTerm) || fileName.includes(searchTerm);
    });

  // Highlight search term in message content
  const highlightSearchTerm = (text: string, searchTerm: string) => {
    if (!searchTerm.trim()) return text;
    
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} style={{ background: '#fef08a', padding: '2px 4px', borderRadius: '2px' }}>
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const isInTempChat = tempConversation && !activeConversation;
  // ✅ FIXED: Display position for both active and temp conversations
  const displayName = activeConv 
    ? getConversationName(activeConv) 
    : (tempConversation?.user.position || tempConversation?.user.name || 'User');
  const displayInitial = displayName.charAt(0).toUpperCase();

  return (
    <>
      {/* File Preview Modal */}
      {previewFile && showPreview && (
        <FilePreviewModal
          fileUrl={previewFile.url}
          fileName={previewFile.name}
          fileType={previewFile.type}
          isOpen={showPreview}
          onClose={handleClosePreview}
        />
      )}

      {/* Floating button when chat is closed */}
      {!isOpen && (
        <button
          className="floating-chat-button"
          onClick={() => setIsOpen(true)}
          title="Open chat"
          aria-label="Open chat"
        >
          <MessageCircle size={24} />
          {totalUnread > 0 && (
            <span className="unread-count" aria-label={`${totalUnread} unread messages`}>
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>
      )}

      {/* Chat widget when open */}
      {isOpen && (
        <div className={`floating-chat-widget ${isDarkMode ? 'dark' : 'light'}`}>
          <div className="floating-chat-header">
            <h3>Messages</h3>
            <div className="header-actions">
              <button
                className="header-btn"
                onClick={() => {
                  setShowNewChat(!showNewChat);
                  if (!showNewChat) {
                    fetchAllUsers();
                    setSearchInput('');
                  }
                }}
                title="New chat"
                aria-label="Start new chat"
              >
                <Plus size={18} />
              </button>
              <button
                className="header-btn close-btn"
                onClick={() => {
                  setIsOpen(false);
                  setSearchInput('');
                  if (isInTempChat) {
                    setTempConversation(null);
                    setMessageInput('');
                  }
                }}
                title="Close chat"
                aria-label="Close chat"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {!activeConversation && !tempConversation ? (
            <div className="floating-chat-content">
              {/* Search bar */}
              <div className="floating-search">
                <Search size={16} />
                <input
                  type="text"
                  placeholder={showNewChat ? "Search users..." : "Search conversations..."}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  aria-label={showNewChat ? "Search users" : "Search conversations"}
                />
                {searchInput && (
                  <button
                    className="clear-search-btn"
                    onClick={() => setSearchInput('')}
                    aria-label="Clear search"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {showNewChat && (
                <div className="floating-new-chat">
                  <div className="new-chat-header">
                    <h4>New chat</h4>
                    <button
                      onClick={() => {
                        setShowNewChat(false);
                        setSearchInput('');
                      }}
                      aria-label="Close new chat"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="floating-users-list">
                    {isLoadingUsers ? (
                      <div style={{ padding: '20px', textAlign: 'center' }}>
                        <Loader size={20} className="spinner" />
                        <p>Loading users...</p>
                      </div>
                    ) : filteredUsers.length > 0 ? (
                      filteredUsers.map((user) => (
                        <div
                          key={user.id}
                          className="floating-user-item"
                          onClick={() => handleStartChat(user.id, user)}
                          role="button"
                          tabIndex={0}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              handleStartChat(user.id, user);
                            }
                          }}
                        >
                          <div className="floating-user-avatar">
                            {user.position?.charAt(0).toUpperCase() || user.name?.charAt(0).toUpperCase() || 'U'}
                          </div>
                          {/* ✅ FIXED: Display position instead of name */}
                          <div className="floating-user-name">
                            {user.position || user.name}
                          </div>
                          {onlineUsers.includes(user.id) && (
                            <div
                              className="floating-status-dot"
                              aria-label="Online"
                            ></div>
                          )}
                        </div>
                      ))
                    ) : searchInput ? (
                      <p style={{ padding: '10px', textAlign: 'center' }}>
                        No users found matching "{searchInput}"
                      </p>
                    ) : (
                      <p style={{ padding: '10px', textAlign: 'center' }}>No users available</p>
                    )}
                  </div>
                </div>
              )}

              {!showNewChat && (
                <div className="floating-conversations">
                  {filteredConversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={`floating-conv-item ${conv.unreadCount > 0 ? 'unread' : ''}`}
                      onClick={() => {
                        setActiveConversation(conv.id);
                        getMessages(conv.id);
                        setSearchInput('');
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setActiveConversation(conv.id);
                          getMessages(conv.id);
                          setSearchInput('');
                        }
                      }}
                    >
                      <div className="floating-conv-avatar">
                        {getConversationName(conv).charAt(0).toUpperCase()}
                      </div>
                      <div className="floating-conv-info">
                        <div className={`floating-conv-name ${conv.unreadCount > 0 ? 'unread-text' : ''}`}>
                          {getConversationName(conv)}
                        </div>
                        <div className={`floating-conv-preview ${conv.unreadCount > 0 ? 'unread-text' : ''}`}>
                          {conv.lastMessage || 'No messages yet'}
                        </div>
                      </div>
                      {conv.unreadCount > 0 && (
                        <div
                          className="floating-unread"
                          aria-label={`${conv.unreadCount} unread messages`}
                        >
                          {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                        </div>
                      )}
                    </div>
                  ))}

                  {filteredConversations.length === 0 && conversations.length > 0 && searchInput && (
                    <div className="floating-empty">
                      <p>No conversations found matching "{searchInput}"</p>
                      <button
                        className="floating-new-btn"
                        onClick={() => setSearchInput('')}
                      >
                        Clear search
                      </button>
                    </div>
                  )}

                  {conversations.length === 0 && (
                    <div className="floating-empty">
                      <p>No conversations yet</p>
                      <button
                        className="floating-new-btn"
                        onClick={() => {
                          setShowNewChat(true);
                          fetchAllUsers();
                        }}
                      >
                        Start a chat
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="floating-chat-view">
              <div className="floating-chat-header-msg">
                <div className="floating-msg-header-info">
                  <button
                    className="back-btn-floating"
                    onClick={() => {
                      if (isInTempChat) {
                        setTempConversation(null);
                        setMessageInput('');
                      } else {
                        setActiveConversation(null);
                      }
                      setSearchInput('');
                      setMessageSearchInput('');
                      setShowMessageSearch(false);
                    }}
                    title="Back to conversations"
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div className="floating-msg-avatar">
                    {displayInitial}
                    {(activeConv?.isOnline || tempConversation?.user?.isOnline) && (
                      <div
                        className="floating-status-indicator"
                        aria-label="Online"
                      ></div>
                    )}
                  </div>
                  <div className="floating-msg-header-text">
                    {/* ✅ FIXED: Display position in header */}
                    <div className="floating-msg-name">{displayName}</div>
                    <div className="floating-msg-status">
                      {isInTempChat ? 'Start a message...' : (activeConv?.isOnline ? 'Online' : 'Offline')}
                    </div>
                  </div>
                  <button
                    className="header-btn"
                    onClick={() => {
                      setShowMessageSearch(!showMessageSearch);
                      if (showMessageSearch) {
                        setMessageSearchInput('');
                      }
                    }}
                    title="Search in messages"
                    aria-label="Search in messages"
                    style={{
                      marginLeft: 'auto',
                      background: showMessageSearch ? '#3b82f6' : 'transparent',
                      color: showMessageSearch ? 'white' : 'inherit'
                    }}
                  >
                    <Search size={16} />
                  </button>
                </div>
              </div>

              {/* Message search bar */}
              {showMessageSearch && (
                <div style={{
                  padding: '8px 12px',
                  background: isDarkMode ? '#1f2937' : '#f9fafb',
                  borderBottom: `1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <Search size={14} style={{ color: '#6b7280' }} />
                  <input
                    type="text"
                    placeholder="Search messages..."
                    value={messageSearchInput}
                    onChange={(e) => setMessageSearchInput(e.target.value)}
                    style={{
                      flex: 1,
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      fontSize: '13px',
                      outline: 'none',
                      background: isDarkMode ? '#374151' : 'white',
                      color: isDarkMode ? '#f9fafb' : '#111827'
                    }}
                    autoFocus
                  />
                  {messageSearchInput && (
                    <button
                      onClick={() => setMessageSearchInput('')}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        color: '#6b7280'
                      }}
                    >
                      <X size={14} />
                    </button>
                  )}
                  <span style={{ fontSize: '11px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                    {filteredMessages.length}
                  </span>
                </div>
              )}

              <div className="floating-messages">
                {filteredMessages.length === 0 && messageSearchInput ? (
                  <div className="floating-empty-messages">
                    <p>No messages found matching "{messageSearchInput}"</p>
                    <button
                      onClick={() => setMessageSearchInput('')}
                      style={{
                        marginTop: '8px',
                        padding: '6px 12px',
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      Clear search
                    </button>
                  </div>
                ) : filteredMessages.length === 0 ? (
                  <div className="floating-empty-messages">
                    <p>{isInTempChat ? 'Send your first message to start the conversation!' : 'Start the conversation!'}</p>
                  </div>
                ) : (
                  filteredMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`floating-message ${
                        msg.senderId === currentUser?.id ? 'sent' : 'received'
                      } ${!msg.isRead && msg.senderId !== currentUser?.id ? 'unread-msg' : ''} ${msg.isDeleted ? 'deleted-message' : ''}`}
                    >
                      <div className="floating-msg-content">
                        {msg.isDeleted || msg.messageType === 'deleted' ? (
                          <p className="deleted-text">
                            <i>{msg.content}</i>
                          </p>
                        ) : msg.messageType === 'file' || msg.messageType === 'image' ? (
                          msg.messageType === 'image' ? (
                            <div
                              className="floating-message-image-wrapper"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const fileType = msg.fileType || 'image/jpeg';
                                handleOpenFile(
                                  msg.fileUrl || '',
                                  msg.fileName || msg.content,
                                  fileType
                                );
                              }}
                              style={{ cursor: 'pointer' }}
                              role="button"
                              tabIndex={0}
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  const fileType = msg.fileType || 'image/jpeg';
                                  handleOpenFile(
                                    msg.fileUrl || '',
                                    msg.fileName || msg.content,
                                    fileType
                                  );
                                }
                              }}
                            >
                              <img
                                src={convertUrlToAbsolute(msg.fileUrl || '')}
                                alt={msg.content}
                                className="floating-message-image"
                                onError={(e) => {
                                  console.error('Image failed to load:', msg.fileUrl);
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            </div>
                          ) : (
                            <div
                              className="floating-file-wrapper"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const fileType = msg.fileType || 'application/octet-stream';
                                const fileName = msg.fileName || msg.content;
                                handleOpenFile(
                                  msg.fileUrl || '',
                                  fileName,
                                  fileType
                                );
                              }}
                              style={{
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 12px',
                                background: 'rgba(0,0,0,0.05)',
                                borderRadius: '8px',
                                transition: 'all 0.2s ease'
                              }}
                              role="button"
                              tabIndex={0}
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  const fileType = msg.fileType || 'application/octet-stream';
                                  const fileName = msg.fileName || msg.content;
                                  handleOpenFile(
                                    msg.fileUrl || '',
                                    fileName,
                                    fileType
                                  );
                                }
                              }}
                            >
                              <Paperclip size={14} />
                              <span>
                                {messageSearchInput && msg.fileName ? 
                                  highlightSearchTerm(msg.fileName, messageSearchInput) : 
                                  (msg.fileName || msg.content)
                                }
                              </span>
                            </div>
                          )
                        ) : (
                          <p>
                            {messageSearchInput ? 
                              highlightSearchTerm(msg.content, messageSearchInput) : 
                              msg.content
                            }
                          </p>
                        )}
                      </div>
                      <div className="floating-msg-footer">
                        <span className="floating-msg-time">{formatTime(msg.createdAt)}</span>
                        {msg.senderId === currentUser?.id && !msg.isDeleted && msg.messageType !== 'deleted' && (
                          <button
                            className="floating-delete-btn"
                            onClick={() => deleteMessage(msg.id)}
                            title="Delete message"
                            aria-label="Delete message"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}

                {currentTypingUsers.length > 0 && (
                  <div className="floating-typing">
                    <span className="typing-user">
                      {currentTypingUsers.join(', ')} typing...
                    </span>
                    <div className="floating-typing-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              <form className="floating-input-form" onSubmit={handleSendMessage}>
                {selectedFile && (
                  <div className="floating-file-preview">
                    <div className="file-info">
                      <Paperclip size={14} />
                      <span>{selectedFile.name}</span>
                    </div>
                    <button
                      type="button"
                      className="remove-file-btn"
                      onClick={() => {
                        setSelectedFile(null);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = '';
                        }
                      }}
                      aria-label="Remove file"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                <div className="floating-input-group">
                  <input
                    type="text"
                    placeholder="Type message..."
                    value={messageInput}
                    onChange={(e) => handleTyping(e.target.value)}
                    disabled={!isConnected || isSending}
                    aria-label="Message input"
                  />
                  <button
                    type="button"
                    className="floating-attach-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!isConnected || isSending}
                    title="Attach file"
                    aria-label="Attach file"
                  >
                    <Paperclip size={16} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    aria-hidden="true"
                  />
                  <button
                    type="submit"
                    disabled={(!messageInput.trim() && !selectedFile) || !isConnected || isSending}
                    aria-label="Send message"
                  >
                    {isSending ? <Loader size={16} className="spinner" /> : <Send size={16} />}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className={`floating-status ${isConnected ? 'connected' : 'disconnected'}`}>
            <div className="status-dot"></div>
            <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      )}
    </>
  );
};

export default FloatingChat;