// ============================================
// CHAT COMPONENT WITH SEARCH & FILE PREVIEW
// File: components/Chat.tsx
// ============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useChat } from '../contexts/ChatContext';
import { Send, Plus, Search, Trash2, X, Phone, Paperclip, Loader } from 'lucide-react';
import FilePreviewModal from './FilePreviewModal';
import '../styles/Chat.css';

// Constants
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const TYPING_TIMEOUT = 3000; // 3 seconds

// Types
interface IUser {
  id: number;
  name: string;
  position?: string;
  email?: string;
}

interface IFilePreview {
  url: string;
  name: string;
  type: string;
}

const Chat: React.FC = () => {
  const {
    conversations,
    messages,
    activeConversation,
    currentUser,
    typingUsers,
    onlineUsers,
    isConnected,
    getConversations,
    getMessages,
    sendMessage,
    createConversation,
    setActiveConversation,
    deleteMessage,
    setTyping,
    attachFile
  } = useChat();

  // State
  const [messageInput, setMessageInput] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [messageSearchInput, setMessageSearchInput] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [allUsers, setAllUsers] = useState<IUser[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [previewFile, setPreviewFile] = useState<IFilePreview | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showMessageSearch, setShowMessageSearch] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API_URL = process.env.REACT_APP_API_URL || import.meta.env.VITE_API_URL || "${import.meta.env.VITE_API_URL || "http://localhost:3002"}";
  const token = localStorage.getItem('token');

  // Initialize chat on component mount
  useEffect(() => {
    getConversations();
  }, [getConversations]);

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Track total unread messages and update browser tab
  useEffect(() => {
    const total = conversations.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
    setTotalUnreadCount(total);

    if (total > 0) {
      document.title = `(${total}) Messages`;
    } else {
      document.title = 'Chat';
    }
  }, [conversations]);

  // Auto scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeConversation]);

  // Fetch all users for new chat
  const fetchAllUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/users`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setAllUsers(data.filter((u: IUser) => u.id !== currentUser?.id));
      } else {
        console.error('Failed to fetch users');
      }
    } catch (error) {
      console.error('Error fetching users:', error);
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

  // Handle sending message with file support
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if ((!messageInput.trim() && !selectedFile) || !activeConversation || isSending) {
      return;
    }

    setIsSending(true);

    try {
      if (selectedFile) {
        await attachFile(activeConversation, selectedFile);
        setSelectedFile(null);
        setMessageInput('');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else if (messageInput.trim()) {
        await sendMessage(activeConversation, messageInput.trim(), 'text');
        setMessageInput('');
      }

      setIsTyping(false);
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  // Handle typing indicator
  const handleTyping = (value: string) => {
    setMessageInput(value);

    if (!isTyping && value.length > 0) {
      setIsTyping(true);
      if (activeConversation) {
        setTyping(activeConversation, true);
      }
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (value.length === 0 && activeConversation) {
        setIsTyping(false);
        setTyping(activeConversation, false);
      }
    }, TYPING_TIMEOUT);
  };

  // Handle conversation creation
  const handleStartChat = async (userId: number) => {
    try {
      // ✅ FIX: Find the user object first to get their position
      const selectedUser = allUsers.find(u => u.id === userId);
      
      const conversationId = await createConversation(userId);

      if (conversationId) {
        setActiveConversation(conversationId);
        
        // ✅ FIX: Immediately refresh conversations to get updated data with position
        await getConversations();
        
        await getMessages(conversationId);
        setShowNewChat(false);
        setSearchInput('');
      } else {
        alert('Failed to create conversation. Please try again.');
      }
    } catch (error) {
      console.error('Error starting chat:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Error starting chat: ${errorMessage}`);
    }
  };

  // Open file preview
  const handleOpenFile = (fileUrl: string, fileName: string, fileType: string) => {
    setPreviewFile({
      url: fileUrl,
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

  // Get conversation display name
  const getConversationName = (conv: any): string => {
    if (conv.conversationType === 'direct') {
      // ✅ FIXED: Priority now shows position first
      return conv.position || conv.name || conv.user_name || 'User';
    }
    return conv.conversationName || 'Conversation';
  };

  // Format timestamp
  const formatTime = (timestamp: string): string => {
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

  // Filter conversations based on search input
  const filteredConversations = conversations.filter((conv) =>
    getConversationName(conv).toLowerCase().includes(searchInput.toLowerCase())
  );

  // Filter users based on search input (for new chat)
  const filteredUsers = allUsers.filter((user) =>
    user.position?.toLowerCase().includes(searchInput.toLowerCase()) ||
    user.name?.toLowerCase().includes(searchInput.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchInput.toLowerCase())
  );

  // Filter messages by active conversation AND search query
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
  
  const activeConv = conversations.find(c => c.id === activeConversation);
  const currentTypingUsers = typingUsers[activeConversation!] || [];

  return (
    <div className="chat-container">
      {/* File Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          fileUrl={previewFile.url}
          fileName={previewFile.name}
          fileType={previewFile.type}
          isOpen={showPreview}
          onClose={handleClosePreview}
        />
      )}

      {/* Sidebar - Conversations List */}
      <div className="chat-sidebar">
        <div className="chat-header">
          <h2>Messages</h2>
          <button
            className="new-chat-btn"
            onClick={() => {
              setShowNewChat(!showNewChat);
              if (!showNewChat) {
                fetchAllUsers();
                setSearchInput('');
              }
            }}
            title="Start new chat"
            aria-label="Start new chat"
          >
            <Plus size={20} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="chat-search">
          <Search size={18} />
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
                alignItems: 'center',
                color: '#6b7280'
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* New Chat Panel */}
        {showNewChat && (
          <div className="new-chat-panel">
            <div className="new-chat-header">
              <h3>Start a new chat</h3>
              <button
                onClick={() => {
                  setShowNewChat(false);
                  setSearchInput('');
                }}
                aria-label="Close new chat panel"
              >
                <X size={18} />
              </button>
            </div>
            <div className="users-list">
              {isLoadingUsers ? (
                <div style={{ padding: '20px', textAlign: 'center' }}>
                  <Loader size={24} className="spinner" />
                  <p>Loading users...</p>
                </div>
              ) : filteredUsers.length > 0 ? (
                filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    className="user-item"
                    onClick={() => handleStartChat(user.id)}
                    role="button"
                    tabIndex={0}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        handleStartChat(user.id);
                      }
                    }}
                  >
                    <div className="user-avatar">
                      {(user.position || user.name)?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="user-info">
                      {/* ✅ FIXED: Display position instead of name */}
                      <div className="user-name">
                        {user.position || user.name}
                      </div>
                      <div className="user-status">
                        {onlineUsers.includes(user.id) ? (
                          <span className="status-online">Online</span>
                        ) : (
                          <span className="status-offline">Offline</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : searchInput ? (
                <p style={{ padding: '10px', textAlign: 'center', color: '#6b7280' }}>
                  No users found matching "{searchInput}"
                </p>
              ) : (
                <p style={{ padding: '10px', textAlign: 'center' }}>No users available</p>
              )}
            </div>
          </div>
        )}

        {/* Conversations List */}
        {!showNewChat && (
          <div className="conversations-list">
            {filteredConversations.map((conv) => (
              <div
                key={conv.id}
                className={`conversation-item ${activeConversation === conv.id ? 'active' : ''}`}
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
                <div className="conversation-avatar">
                  {(conv.position || conv.name || conv.user_name)?.charAt(0).toUpperCase() || 'U'}
                  {conv.isOnline && <div className="status-indicator online" aria-label="Online"></div>}
                </div>
                <div className="conversation-info">
                  <div className="conversation-name-row">
                    <span className="conversation-name">
                      {getConversationName(conv)}
                    </span>
                    {conv.lastMessageTime && (
                      <span className="conversation-time">
                        {formatTime(conv.lastMessageTime)}
                      </span>
                    )}
                  </div>
                  <div className="conversation-preview">
                    {conv.lastMessage || 'No messages yet'}
                  </div>
                </div>
                {conv.unreadCount > 0 && (
                  <div className="unread-badge" aria-label={`${conv.unreadCount} unread messages`}>
                    {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                  </div>
                )}
              </div>
            ))}

            {/* Empty state when search has no results */}
            {filteredConversations.length === 0 && conversations.length > 0 && searchInput && (
              <div className="empty-state">
                <p>No conversations found matching "{searchInput}"</p>
                <button
                  className="start-chat-link"
                  onClick={() => setSearchInput('')}
                >
                  Clear search
                </button>
              </div>
            )}

            {/* Empty state when no conversations exist */}
            {conversations.length === 0 && (
              <div className="empty-state">
                <p>No conversations yet</p>
                <button
                  className="start-chat-link"
                  onClick={() => {
                    setShowNewChat(true);
                    fetchAllUsers();
                  }}
                >
                  Start a new chat
                </button>
              </div>
            )}
          </div>
        )}

        {/* Connection Status */}
        <div className="connection-status">
          <div className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></div>
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="chat-main">
        {activeConversation ? (
          <>
            {/* Chat Header */}
            <div className="chat-message-header">
              <div className="header-info">
                <div className="header-avatar">
                  {(activeConv?.position || activeConv?.name || activeConv?.user_name)?.charAt(0).toUpperCase() || 'U'}
                  {activeConv?.isOnline && <div className="status-indicator online"></div>}
                </div>
                <div className="header-details">
                  {/* ✅ FIXED: Display position in header */}
                  <h3>{getConversationName(activeConv!)}</h3>
                  <p className="header-status">
                    {activeConv?.isOnline ? (
                      <span className="online">Active now</span>
                    ) : (
                      <span className="offline">
                        Last seen {formatTime(activeConv?.lastMessageTime || '')}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  className={`call-btn ${showMessageSearch ? 'active' : ''}`}
                  onClick={() => {
                    setShowMessageSearch(!showMessageSearch);
                    if (showMessageSearch) {
                      setMessageSearchInput('');
                    }
                  }}
                  title="Search in messages"
                  aria-label="Search in messages"
                  style={{
                    background: showMessageSearch ? '#3b82f6' : 'transparent',
                    color: showMessageSearch ? 'white' : 'inherit'
                  }}
                >
                  <Search size={20} />
                </button>
                <button
                  className="call-btn"
                  title="Call"
                  aria-label="Start call"
                >
                  <Phone size={20} />
                </button>
              </div>
            </div>

            {/* Message search bar */}
            {showMessageSearch && (
              <div className="message-search-bar" style={{
                padding: '12px 20px',
                background: '#f9fafb',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Search size={16} style={{ color: '#6b7280' }} />
                <input
                  type="text"
                  placeholder="Search in conversation..."
                  value={messageSearchInput}
                  onChange={(e) => setMessageSearchInput(e.target.value)}
                  style={{
                    flex: 1,
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '14px',
                    outline: 'none'
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
                    aria-label="Clear search"
                  >
                    <X size={16} />
                  </button>
                )}
                <span style={{ fontSize: '12px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                  {filteredMessages.length} {filteredMessages.length === 1 ? 'result' : 'results'}
                </span>
              </div>
            )}

            {/* Messages Area */}
            <div className="messages-container">
              {filteredMessages.length === 0 && messageSearchInput ? (
                <div className="empty-messages">
                  <p>No messages found matching "{messageSearchInput}"</p>
                  <button
                    onClick={() => setMessageSearchInput('')}
                    style={{
                      marginTop: '10px',
                      padding: '8px 16px',
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    Clear search
                  </button>
                </div>
              ) : filteredMessages.length === 0 ? (
                <div className="empty-messages">
                  <p>No messages yet. Start the conversation!</p>
                </div>
              ) : (
                filteredMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`message ${msg.senderId === currentUser?.id ? 'sent' : 'received'} ${msg.isDeleted ? 'deleted-message' : ''} ${messageSearchInput && (msg.content?.toLowerCase().includes(messageSearchInput.toLowerCase()) || msg.fileName?.toLowerCase().includes(messageSearchInput.toLowerCase())) ? 'search-highlight' : ''}`}
                  >
                    <div className="message-content">
                      {msg.isDeleted || msg.messageType === 'deleted' ? (
                        <p className="deleted-text">
                          <i>{msg.content}</i>
                        </p>
                      ) : msg.messageType === 'file' || msg.messageType === 'image' ? (
                        msg.messageType === 'image' ? (
                          <div
                            className="message-image-wrapper"
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
                              src={msg.fileUrl}
                              alt={msg.content}
                              className="message-image"
                              loading="lazy"
                            />
                          </div>
                        ) : (
                          <div
                            className="message-file-wrapper"
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
                            style={{ cursor: 'pointer' }}
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
                            <Paperclip size={16} />
                            <div className="file-details">
                              <span className="file-name">
                                {messageSearchInput && msg.fileName ? 
                                  highlightSearchTerm(msg.fileName, messageSearchInput) : 
                                  (msg.fileName || msg.content)
                                }
                              </span>
                              <span className="file-size">
                                {msg.fileSize ? Math.round(msg.fileSize / 1024) + ' KB' : ''}
                              </span>
                            </div>
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
                    <div className="message-meta">
                      <span className="message-time">{formatTime(msg.createdAt)}</span>
                      {msg.senderId === currentUser?.id && !msg.isDeleted && msg.messageType !== 'deleted' && (
                        <>
                          {msg.isRead && <span className="read-status">✓✓</span>}
                          {!msg.isDeleted && msg.messageType !== 'deleted' && (
                            <button
                              className="delete-btn"
                              onClick={() => deleteMessage(msg.id)}
                              title="Delete message"
                              aria-label="Delete message"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}

              {/* Typing Indicator */}
              {currentTypingUsers.length > 0 && (
                <div className="typing-indicator">
                  <span className="typing-user">
                    {currentTypingUsers.join(', ')} {currentTypingUsers.length === 1 ? 'is' : 'are'} typing
                  </span>
                  <div className="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <form className="message-input-form" onSubmit={handleSendMessage}>
              {/* File Preview */}
              {selectedFile && (
                <div className="file-preview">
                  <div className="file-info">
                    <Paperclip size={16} />
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
                    <X size={16} />
                  </button>
                </div>
              )}

              <div className="input-group">
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={messageInput}
                  onChange={(e) => handleTyping(e.target.value)}
                  disabled={!isConnected || isSending}
                  aria-label="Message input"
                />
                <button
                  type="button"
                  className="attach-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!isConnected || isSending}
                  title="Attach file"
                  aria-label="Attach file"
                >
                  <Paperclip size={20} />
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
                  {isSending ? <Loader size={20} className="spinner" /> : <Send size={20} />}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="no-conversation">
            <div className="empty-illustration">
              📱
            </div>
            <h2>Select a conversation to start messaging</h2>
            <p>Choose from your existing conversations or start a new one</p>
            <button
              className="new-chat-action"
              onClick={() => {
                setShowNewChat(true);
                fetchAllUsers();
              }}
            >
              <Plus size={20} /> Start a new chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chat;