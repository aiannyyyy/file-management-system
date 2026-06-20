//Layout.tsx
import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Menu,
  X,
  Home,
  FileText,
  Settings,
  Search,
  User,
  FolderOpen,
  ChevronDown,
  Building2,
  LogOut,
  Folder,
  ChevronRight,
  Loader2,
  XCircle,
  Bell,
  Trash2
} from "lucide-react";
import axios from "axios";
import DarkModeToggle from "./DarkModeToggle";
import { useAuth } from '../contexts/AuthContext';

interface User {
  id?: string | number;
  name: string;
  user_name: string;
  department?: string;
  role: string;
  email?: string;
}

interface UserData {
  token: string;
  user: User;
}

type LayoutProps = {
  children: React.ReactNode;
  userData: UserData;
  onLogout: () => void;
};

interface SearchFile {
  id: number;
  file_name: string;
  file_type: string;
  file_size: number;
  folder_id: number | null;
  folder_name: string | null;
  created_at: string;
  created_by_name: string;
}

interface SearchFolder {
  id: number;
  name: string;
  parent_id: number | null;
  parent_folder_name: string | null;
  created_at: string;
  created_by_name: string;
}

interface CategoryFile {
  id: number;
  name: string;
  original_name: string;
  file_type: string;
  file_size: number;
  category_id: number;
  folder_id: number | null;
  category_name: string;
  folder_name: string | null;
  created_at: string;
  created_by_name: string;
}

interface CategoryFolder {
  id: number;
  name: string;
  category_id: number;
  category_name: string;
  parent_folder_id: number | null;
  created_by_name: string;
}

interface Category {
  id: number;
  name: string;
  description: string;
  color: string;
  icon: string;
  created_by_name: string;
}

interface SearchResults {
  files: SearchFile[];
  folders: SearchFolder[];
  categoryFiles: CategoryFile[];
  categoryFolders: CategoryFolder[];
  categories: Category[];
  totalResults: number;
}

interface Notification {
  id: number;
  type: string;
  message: string;
  file_name: string;
  is_read: number;
  created_at: string;
  shared_by_name: string;
}

export default function Layout({ children, userData, onLogout }: LayoutProps) {
  const { hasPermission, hasRole } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults>({
    files: [],
    folders: [],
    categoryFiles: [],
    categoryFolders: [],
    categories: [],
    totalResults: 0
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  
  // Notification states
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_URL || "${import.meta.env.VITE_API_URL || "http://localhost:3002"}";

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('recentSearches');
    if (saved) {
      setRecentSearches(JSON.parse(saved));
    }

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, []);
  

  const fetchNotifications = async () => {
    try {
      setLoadingNotifications(true);
      const url = `${API_URL}/api/notifications?limit=10`;
      const response = await axios.get(url, {
        headers: { 
          'Authorization': `Bearer ${userData.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data && response.data.success) {
        const notificationsData = response.data.data || [];
        setNotifications(notificationsData);
      } else {
        setNotifications([]);
      }
    } catch (error: any) {
      console.error('Error fetching notifications:', error);
      setNotifications([]);
    } finally {
      setLoadingNotifications(false);
    }
  };

  const markNotificationAsRead = async (notificationId: number) => {
    try {
      await axios.put(
        `${API_URL}/api/notifications/${notificationId}/read`,
        {},
        {
          headers: { Authorization: `Bearer ${userData.token}` }
        }
      );

      setNotifications(notifications.map(notif =>
        notif.id === notificationId ? { ...notif, is_read: 1 } : notif
      ));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const deleteNotification = async (notificationId: number) => {
    try {
      await axios.delete(
        `${API_URL}/api/notifications/${notificationId}`,
        {
          headers: { Authorization: `Bearer ${userData.token}` }
        }
      );

      setNotifications(notifications.filter(notif => notif.id !== notificationId));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const clearAllNotifications = async () => {
    try {
      await axios.delete(
        `${API_URL}/api/notifications/clear-all`,
        {
          headers: { Authorization: `Bearer ${userData.token}` }
        }
      );

      setNotifications([]);
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  };

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const handleLogout = () => {
    setUserDropdownOpen(false);
    onLogout();
  };

  const isActive = (path: string) => {
    if (!mounted) return false;
    return location.pathname === path;
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userDropdownOpen) {
        setUserDropdownOpen(false);
      }
      if (searchOpen && searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (notificationOpen && notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setNotificationOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [userDropdownOpen, searchOpen, notificationOpen]);

  const performSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults({ 
        files: [], 
        folders: [], 
        categoryFiles: [], 
        categoryFolders: [],
        categories: [],
        totalResults: 0 
      });
      return;
    }

    setSearchLoading(true);
    try {
      const [regularSearch, categorySearch] = await Promise.all([
        axios.get(`${API_URL}/api/files/search?q=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${userData.token}` }
        }).catch(() => ({ 
          data: { results: { files: [], folders: [] }, totalResults: 0 } 
        })),
        
        axios.get(`${API_URL}/api/search?q=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${userData.token}` }
        }).catch((err) => {
          console.error('Category search error:', err.response?.data || err.message);
          return { 
            data: { results: { files: [], folders: [], categories: [] }, totalResults: 0 } 
          };
        })
      ]);

      const results: SearchResults = {
        files: regularSearch.data.results?.files || [],
        folders: regularSearch.data.results?.folders || [],
        categoryFiles: categorySearch.data.results?.files || [],
        categoryFolders: categorySearch.data.results?.folders || [],
        categories: categorySearch.data.results?.categories || [],
        totalResults: (regularSearch.data.totalResults || 0) + (categorySearch.data.totalResults || 0)
      };

      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults({ 
        files: [], 
        folders: [], 
        categoryFiles: [], 
        categoryFolders: [],
        categories: [],
        totalResults: 0 
      });
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        performSearch(searchQuery);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setSearchOpen(value.length > 0);
  };

  const saveRecentSearch = (query: string) => {
    const updated = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('recentSearches', JSON.stringify(updated));
  };

  const handleFileClick = (file: SearchFile) => {
    saveRecentSearch(file.file_name);
    setSearchOpen(false);
    setSearchQuery("");
    
    if (file.folder_id) {
      navigate(`/files?folder=${file.folder_id}&highlight=${file.id}`);
    } else {
      navigate(`/files?highlight=${file.id}`);
    }
  };

  const handleFolderClick = (folder: SearchFolder) => {
    saveRecentSearch(folder.name);
    setSearchOpen(false);
    setSearchQuery("");
    navigate(`/files?folder=${folder.id}`);
  };

  const handleCategoryFileClick = (file: CategoryFile) => {
    saveRecentSearch(file.name);
    setSearchOpen(false);
    setSearchQuery("");
    navigate(`/categories?category=${file.category_id}&folder=${file.folder_id || ''}&highlight=${file.id}`);
  };

  const handleCategoryClick = (category: Category) => {
    saveRecentSearch(category.name);
    setSearchOpen(false);
    setSearchQuery("");
    navigate(`/categories?category=${category.id}`);
  };

  const handleCategoryFolderClick = (folder: CategoryFolder) => {
    saveRecentSearch(folder.name);
    setSearchOpen(false);
    setSearchQuery("");
    navigate(`/categories?category=${folder.category_id}&folder=${folder.id}`);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchOpen(false);
    setSearchResults({ 
      files: [], 
      folders: [], 
      categoryFiles: [], 
      categoryFolders: [],
      categories: [],
      totalResults: 0 
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileType: string) => {
    const type = fileType?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(type)) return '🖼️';
    if (['pdf'].includes(type)) return '📄';
    if (['doc', 'docx'].includes(type)) return '📝';
    if (['xls', 'xlsx'].includes(type)) return '📊';
    if (['zip', 'rar', '7z'].includes(type)) return '🗜️';
    if (['mp4', 'avi', 'mov'].includes(type)) return '🎥';
    if (['mp3', 'wav'].includes(type)) return '🎵';
    return '📄';
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const navItems = [
    { path: "/dashboard", label: "Dashboard", icon: Home },
    { path: "/categories", label: "Categories", icon: FolderOpen },
    { path: "/files", label: "Files", icon: FileText }
  ];

  const displayName = userData?.user?.name || "Unknown User";
  const displayEmail = userData?.user?.email || userData?.user?.user_name || "No email";
  const displayRole = userData?.user?.role || "User";
  const displayDepartment = userData?.user?.department || "";

   return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarCollapsed ? "w-16" : "w-64"
        } bg-blue-700 dark:bg-gray-800 text-white flex flex-col transition-all duration-300 ease-in-out relative z-50`}
      >
        <div className="p-4 border-b border-blue-600 dark:border-gray-700 flex items-center justify-between">
          {!sidebarCollapsed ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-500 dark:bg-blue-600 rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-lg font-bold">FileVault</div>
                <div className="text-xs text-blue-200 dark:text-gray-400">Intranet System</div>
              </div>
            </div>
          ) : (
            <div className="w-8 h-8 bg-blue-500 dark:bg-blue-600 rounded-lg flex items-center justify-center mx-auto">
              <Building2 className="w-5 h-5 text-white" />
            </div>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 group relative ${
                  isActive(item.path)
                    ? "bg-blue-600 dark:bg-gray-700 text-white shadow-sm"
                    : "hover:bg-blue-600/50 dark:hover:bg-gray-700/50 text-blue-100 dark:text-gray-300 hover:text-white"
                }`}
                title={sidebarCollapsed ? item.label : ""}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!sidebarCollapsed && (
                  <span className="font-medium">{item.label}</span>
                )}
                {sidebarCollapsed && (
                  <div className="absolute left-12 bg-gray-900 text-white px-2 py-1 rounded text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                    {item.label}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {!sidebarCollapsed && (
          <div className="p-4 border-t border-blue-600 dark:border-gray-700">
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 bg-blue-500 dark:bg-blue-600 rounded-full flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white truncate">{displayName}</div>
                <div className="text-blue-200 dark:text-gray-400 text-xs truncate">
                  {displayDepartment ? `${displayRole} • ${displayDepartment}` : displayRole}
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-6 relative z-40">
          <div className="flex items-center gap-4">
            <button
              onClick={toggleSidebar}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200"
              aria-label="Toggle sidebar"
            >
              {sidebarCollapsed ? (
                <Menu className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              ) : (
                <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              )}
            </button>

            <div className="hidden md:block">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                Intranet File Management System
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Secure document collaboration platform
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Enhanced Search Bar */}
            <div className="hidden lg:flex relative" ref={searchRef}>
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4 z-10" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search files, folders, categories..."
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={() => searchQuery && setSearchOpen(true)}
                className="pl-10 pr-10 py-2 w-80 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 z-10"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}

              {/* Search Dropdown */}
              {searchOpen && (
                <div className="absolute top-full mt-2 w-[500px] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 max-h-[600px] overflow-y-auto z-50">
                  {searchLoading ? (
                    <div className="p-8 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                      <span className="ml-2 text-gray-600 dark:text-gray-300">Searching...</span>
                    </div>
                  ) : searchResults.totalResults === 0 && searchQuery ? (
                    <div className="p-8 text-center">
                      <p className="text-gray-500 dark:text-gray-400">No results found for "{searchQuery}"</p>
                      {recentSearches.length > 0 && (
                        <div className="mt-4">
                          <p className="text-sm text-gray-400 dark:text-gray-500 mb-2">Recent searches:</p>
                          <div className="flex flex-wrap gap-2 justify-center">
                            {recentSearches.map((term, idx) => (
                              <button
                                key={idx}
                                onClick={() => setSearchQuery(term)}
                                className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full text-gray-600 dark:text-gray-300"
                              >
                                {term}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Categories Section */}
                      {searchResults.categories.length > 0 && (
                        <div className="border-b border-gray-100 dark:border-gray-700">
                          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700/50 font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase">
                            Categories ({searchResults.categories.length})
                          </div>
                          {searchResults.categories.map((category) => (
                            <button
                              key={`category-${category.id}`}
                              onClick={() => handleCategoryClick(category)}
                              className="w-full px-4 py-3 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors flex items-start gap-3 border-b border-gray-50 dark:border-gray-700 last:border-0"
                            >
                              <FolderOpen className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
                              <div className="flex-1 text-left">
                                <div className="font-medium text-gray-900 dark:text-white">{category.name}</div>
                                {category.description && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{category.description}</div>
                                )}
                              </div>
                              <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Regular Folders Section */}
                      {searchResults.folders.length > 0 && (
                        <div className="border-b border-gray-100 dark:border-gray-700">
                          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700/50 font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase">
                            Folders ({searchResults.folders.length})
                          </div>
                          {searchResults.folders.map((folder) => (
                            <button
                              key={`folder-${folder.id}`}
                              onClick={() => handleFolderClick(folder)}
                              className="w-full px-4 py-3 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors flex items-start gap-3 border-b border-gray-50 dark:border-gray-700 last:border-0"
                            >
                              <Folder className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                              <div className="flex-1 text-left">
                                <div className="font-medium text-gray-900 dark:text-white">{folder.name}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  Created by {folder.created_by_name} • {formatTime(folder.created_at)}
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Regular Files Section */}
                      {searchResults.files.length > 0 && (
                        <div className="border-b border-gray-100 dark:border-gray-700">
                          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700/50 font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase">
                            Files ({searchResults.files.length})
                          </div>
                          {searchResults.files.map((file) => (
                            <button
                              key={`file-${file.id}`}
                              onClick={() => handleFileClick(file)}
                              className="w-full px-4 py-3 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors flex items-start gap-3 border-b border-gray-50 dark:border-gray-700 last:border-0"
                            >
                              <span className="text-lg flex-shrink-0">{getFileIcon(file.file_type)}</span>
                              <div className="flex-1 text-left min-w-0">
                                <div className="font-medium text-gray-900 dark:text-white truncate">{file.file_name}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  {formatFileSize(file.file_size)} • Created by {file.created_by_name} • {formatTime(file.created_at)}
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Category Files Section */}
                      {searchResults.categoryFiles.length > 0 && (
                        <div className="border-b border-gray-100 dark:border-gray-700">
                          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700/50 font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase">
                            Files in Categories ({searchResults.categoryFiles.length})
                          </div>
                          {searchResults.categoryFiles.map((file) => (
                            <button
                              key={`cat-file-${file.id}`}
                              onClick={() => handleCategoryFileClick(file)}
                              className="w-full px-4 py-3 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors flex items-start gap-3 border-b border-gray-50 dark:border-gray-700 last:border-0"
                            >
                              <span className="text-lg flex-shrink-0">{getFileIcon(file.file_type)}</span>
                              <div className="flex-1 text-left min-w-0">
                                <div className="font-medium text-gray-900 dark:text-white truncate">{file.name}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  {file.category_name} {file.folder_name && `• ${file.folder_name}`} • {formatFileSize(file.file_size)}
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Category Folders Section */}
                      {searchResults.categoryFolders.length > 0 && (
                        <div className="border-b border-gray-100 dark:border-gray-700">
                          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700/50 font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase">
                            Folders in Categories ({searchResults.categoryFolders.length})
                          </div>
                          {searchResults.categoryFolders.map((folder) => (
                            <button
                              key={`cat-folder-${folder.id}`}
                              onClick={() => handleCategoryFolderClick(folder)}
                              className="w-full px-4 py-3 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors flex items-start gap-3 border-b border-gray-50 dark:border-gray-700 last:border-0"
                            >
                              <FolderOpen className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                              <div className="flex-1 text-left">
                                <div className="font-medium text-gray-900 dark:text-white">{folder.name}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  {folder.category_name} • Created by {folder.created_by_name}
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                            </button>
                          ))}
                        </div>
                      )}

                      {searchResults.totalResults > 0 && (
                        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 text-center text-xs text-gray-500 dark:text-gray-400">
                          Showing {searchResults.totalResults} result{searchResults.totalResults !== 1 ? 's' : ''}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Dark Mode Toggle */}
            <DarkModeToggle />

            {/* Notification Bell */}
            <div className="relative" ref={notificationRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setNotificationOpen(!notificationOpen);
                  if (!notificationOpen) {
                    fetchNotifications();
                  }
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200 relative"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-semibold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notificationOpen && (
                <div className="absolute right-0 mt-2 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 max-h-[500px] overflow-hidden flex flex-col z-50">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-700/50">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Notifications</h3>
                    {notifications.length > 0 && (
                      <button
                        onClick={clearAllNotifications}
                        className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                      >
                        Clear all
                      </button>
                    )}
                  </div>

                  <div className="overflow-y-auto flex-1">
                    {loadingNotifications ? (
                      <div className="p-8 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                        <span className="ml-2 text-gray-600 dark:text-gray-300 text-sm">Loading...</span>
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="p-8 text-center">
                        <Bell className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                        <p className="text-gray-500 dark:text-gray-400 text-sm">No notifications yet</p>
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          className={`px-4 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors last:border-0 ${
                            !notif.is_read ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {!notif.is_read && (
                              <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
                            )}
                            {notif.is_read && (
                              <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 flex-shrink-0 mt-2" />
                            )}
                            
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold mb-1">
                                From: <span className="text-gray-700 dark:text-gray-300">{notif.shared_by_name}</span>
                              </p>
                              
                              <p className="text-sm text-gray-900 dark:text-white break-words font-medium">
                                {notif.message}
                              </p>
                              
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {formatTime(notif.created_at)}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {!notif.is_read && (
                                <button
                                  onClick={() => markNotificationAsRead(notif.id)}
                                  className="text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors p-1"
                                  title="Mark as read"
                                >
                                  <span className="text-xs">✓</span>
                                </button>
                              )}
                              <button
                                onClick={() => deleteNotification(notif.id)}
                                className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 flex-shrink-0 transition-colors p-1"
                                aria-label="Delete notification"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {/* User Menu */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setUserDropdownOpen(!userDropdownOpen);
                }}
                className="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200"
              >
                <div className="w-8 h-8 bg-blue-500 dark:bg-blue-600 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
                <div className="hidden md:block text-left">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{displayName}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{displayRole}</div>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${userDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50">
                  <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{displayName}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{displayEmail}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {displayDepartment ? `${displayRole} • ${displayDepartment}` : displayRole}
                    </div>
                  </div>
                             
                  <button 
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          <div className="max-w-full">
            {children}
          </div>
        </main>
      </div>

      {!sidebarCollapsed && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={toggleSidebar}
        />
      )}
    </div>
  );
}