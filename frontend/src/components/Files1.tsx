import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Grid3X3, 
  List, 
  Upload, 
  FolderPlus, 
  MoreHorizontal,
  File,
  Folder,
  Image,
  FileText,
  Download,
  Share2,
  Trash2,
  Star,
  Clock,
  User,
  Calendar,
  ArrowUpDown,
  ChevronRight,
  Home,
  X,
  AlertCircle,
  CheckCircle,
  Edit,
  Move,
  Copy,
  Info,
  RefreshCw,
  Eye,
  Send,
  Mail
} from 'lucide-react';
import { useDarkMode } from '../contexts/DarkModeContext';

// Add authentication helper
const getAuthHeaders = () => {
  const token = localStorage.getItem('token'); // Adjust based on where you store your token
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
};

interface FileItem {
  id: string;
  folder_id?: string;
  file_name?: string;
  name?: string;
  file_path?: string;
  file_type?: string;
  file_size?: number;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  created_by_name?: string;
  updated_by_name?: string;
  type: 'file' | 'folder';
  size?: number;
  fileType?: string;
  modifiedAt: Date;
  modifiedBy: string;
  isStarred: boolean;
  thumbnail?: string;
}

interface FolderItem {
  id: string;
  name: string;
  parent_id?: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  created_by_name?: string;
  updated_by_name?: string;
  type: 'folder';
}

interface BreadcrumbItem {
  name: string;
  path: string;
  id?: string;
}

interface ApiResponse {
  folders: FolderItem[];
  files: FileItem[];
  currentFolder?: FolderItem;
  location?: string;
}

interface User {
  id?: string | number;
  name: string;
  user_name: string;
  email: string;
  department?: string;
  role: string;
}

interface FilesProps {
  currentUser: User;
}

const Files: React.FC<FilesProps> = ({ currentUser }) => {
  const { isDarkMode } = useDarkMode();
  // View and UI State
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showFilters, setShowFilters] = useState(false);

  // File and Folder State
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [folderPath, setFolderPath] = useState<BreadcrumbItem[]>([{ name: 'Home', path: '/', id: null }]);

  // Manage Shares State
  const [showManageSharesModal, setShowManageSharesModal] = useState(false);
  const [currentFileShares, setCurrentFileShares] = useState<any[]>([]);
  const [loadingShares, setLoadingShares] = useState(false);
  const [selectedFileForShares, setSelectedFileForShares] = useState<FileItem | null>(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');

  // Loading and Status State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Upload State
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});

  // Folder Creation State
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Rename State
  const [itemToRename, setItemToRename] = useState<FileItem | null>(null);
  const [newName, setNewName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // Share State
  const [shareEmails, setShareEmails] = useState<string[]>(['']);
  const [shareMessage, setShareMessage] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  
  // User Search and Selection for Sharing
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);

  // Preview State
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // Get current user ID with proper fallback
  const CURRENT_USER_ID = currentUser.id?.toString() || '1';

  // API base URL - make sure this matches your backend
  const API_BASE = 'http://localhost:3002/api/files';

  // Check if we're on the main page (home directory)
  const isMainPage = currentFolder === null;

  // Auto-hide messages
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
  const token = localStorage.getItem('token');
  console.log('🔑 Token exists:', !!token);
  if (token) {
    console.log('🔑 Token preview:', token.substring(0, 20) + '...');
  }
}, []);

  // Add this useEffect to load users when share modal opens
  useEffect(() => {
    if (showShareModal) {
      fetchUsers();
    }
  }, [showShareModal]);

  // Filter users based on search query
  useEffect(() => {
    if (userSearchQuery.trim()) {
      const filtered = availableUsers.filter(user =>
        user.name.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
        user.user_name.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
        user.department?.toLowerCase().includes(userSearchQuery.toLowerCase())
      ).filter(user => !selectedUsers.find(selected => selected.id === user.id));
      
      setFilteredUsers(filtered);
      setShowUserDropdown(filtered.length > 0);
    } else {
      setFilteredUsers([]);
      setShowUserDropdown(false);
    }
  }, [userSearchQuery, selectedUsers, availableUsers]);

  // Load files and folders when folder changes
  useEffect(() => {
    loadFilesAndFolders();
  }, [currentFolder]);

  // Load folder path when currentFolder changes
  useEffect(() => {
    if (currentFolder) {
      loadFolderPath();
    } else {
      setFolderPath([{ name: 'Home', path: '/', id: null }]);
    }
  }, [currentFolder]);

  const loadFilesAndFolders = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const url = currentFolder 
        ? `${API_BASE}/list/${currentFolder}` 
        : `${API_BASE}/list`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to load files`);
      }
      
      const data: ApiResponse = await response.json();
      
      // Transform backend data to match frontend interface
      const transformedFiles: FileItem[] = (data.files || []).map(file => ({
        ...file,
        id: file.id,
        name: file.file_name || file.name || '',
        type: 'file' as const,
        size: file.file_size,
        fileType: file.file_type,
        modifiedAt: new Date(file.updated_at || file.created_at || Date.now()),
        modifiedBy: file.updated_by_name || file.created_by_name || 'Unknown',
        isStarred: false,
      }));

      const transformedFolders: FolderItem[] = (data.folders || []).map(folder => ({
        ...folder,
        type: 'folder' as const,
      }));

      setFiles(transformedFiles);
      setFolders(transformedFolders);
    } catch (err) {
      console.error('Error loading files:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while loading files');
    } finally {
      setLoading(false);
    }
  };

  const loadFolderPath = async () => {
  if (!currentFolder) return;
  
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/path/${currentFolder}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!response.ok) throw new Error('Failed to load folder path');
    
    const data = await response.json();
    const breadcrumbs = [
      { name: 'Home', path: '/', id: null },
      ...data.path.map((folder: any) => ({
        name: folder.name,
        path: folder.id,
        id: folder.id
      }))
    ];
    
    setFolderPath(breadcrumbs);
  } catch (err) {
    console.error('Error loading folder path:', err);
  }
};

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        console.error('No token found');
        return;
      }
      
      // ✅ CORRECTED ENDPOINT
      const response = await fetch('http://localhost:3002/api/share/users/all', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return;
      }
      
      if (!response.ok) throw new Error('Failed to fetch users');
      
      const data = await response.json();
      setAvailableUsers(data.data || data);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Failed to load users');
    }
  };

  // Combined files and folders for display
  const allItems = useMemo(() => {
    const folderItems: FileItem[] = folders.map(folder => ({
      ...folder,
      id: folder.id,
      name: folder.name,
      type: 'folder' as const,
      modifiedAt: new Date(folder.updated_at || folder.created_at),
      modifiedBy: folder.updated_by_name || folder.created_by_name || 'Unknown',
      isStarred: false
    }));

    return [...folderItems, ...files];
  }, [files, folders]);

  const filteredAndSortedFiles = useMemo(() => {
    let filtered = allItems.filter(file =>
      file.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Sort folders first, then files
    filtered.sort((a, b) => {
      // Folders always come first
      if (a.type === 'folder' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'folder') return 1;
      
      let comparison = 0;
      
      if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === 'date') {
        comparison = a.modifiedAt.getTime() - b.modifiedAt.getTime();
      } else if (sortBy === 'size') {
        comparison = (a.size || 0) - (b.size || 0);
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [allItems, searchQuery, sortBy, sortOrder]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setUploadFiles(files);
    }
  };

  const handleUpload = async () => {
    if (!uploadFiles || uploadFiles.length === 0) return;

    setIsUploading(true);
    const results = { successful: 0, failed: 0, errors: [] as any[] };

    try {
      const token = localStorage.getItem('token');
      
      if (uploadFiles.length === 1) {
        // Single file upload
        const file = uploadFiles[0];
        const formData = new FormData();
        formData.append('file', file);
        if (currentFolder) {
          formData.append('folder_id', currentFolder);
        }
        formData.append('created_by', CURRENT_USER_ID);

        const response = await fetch(`${API_BASE}/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Upload failed');
        }

        const result = await response.json();
        setSuccess(`File "${file.name}" uploaded successfully!`);
        results.successful = 1;
      } else {
        // Multiple file upload
        const formData = new FormData();
        Array.from(uploadFiles).forEach((file, index) => {
          formData.append('files', file);
        });
        
        if (currentFolder) {
          formData.append('folder_id', currentFolder);
        }
        formData.append('created_by', CURRENT_USER_ID);

        const response = await fetch(`${API_BASE}/upload/multiple`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Upload failed');
        }

        const result = await response.json();
        results.successful = result.totalUploaded || 0;
        results.failed = result.totalErrors || 0;
        results.errors = result.errors || [];

        if (results.successful > 0) {
          setSuccess(`${results.successful} file(s) uploaded successfully!`);
        }
        
        if (results.errors.length > 0) {
          setError(`${results.failed} file(s) failed to upload. Check console for details.`);
          console.error('Upload errors:', results.errors);
        }
      }

      setShowUploadModal(false);
      setUploadFiles(null);
      loadFilesAndFolders();
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCreateFolder = async () => {
  if (!newFolderName.trim()) return;

  setIsCreatingFolder(true);
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/folders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: newFolderName.trim(),
        parent_id: currentFolder,
        created_by: CURRENT_USER_ID
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create folder');
    }

    const result = await response.json();
    setSuccess(`Folder "${newFolderName}" created successfully!`);
    
    setShowFolderModal(false);
    setNewFolderName('');
    loadFilesAndFolders();
  } catch (err) {
    console.error('Create folder error:', err);
    setError(err instanceof Error ? err.message : 'Failed to create folder');
  } finally {
    setIsCreatingFolder(false);
  }
};

  const handleRename = async () => {
  if (!itemToRename || !newName.trim()) return;

  setIsRenaming(true);
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/${itemToRename.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        new_name: newName.trim(),
        updated_by: CURRENT_USER_ID
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to rename item');
    }

    const result = await response.json();
    setSuccess(`"${itemToRename.name}" renamed to "${newName.trim()}" successfully!`);
    
    setShowRenameModal(false);
    setItemToRename(null);
    setNewName('');
    loadFilesAndFolders();
  } catch (err) {
    console.error('Rename error:', err);
    setError(err instanceof Error ? err.message : 'Failed to rename item');
  } finally {
    setIsRenaming(false);
  }
};

  const handleDelete = async (itemId: string) => {
  if (!confirm('Are you sure you want to delete this item?')) return;

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/${itemId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        updated_by: CURRENT_USER_ID
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to delete item');
    }

    const result = await response.json();
    setSuccess('Item deleted successfully!');
    setSelectedFiles(prev => prev.filter(id => id !== itemId));
    loadFilesAndFolders();
  } catch (err) {
    console.error('Delete error:', err);
    setError(err instanceof Error ? err.message : 'Failed to delete item');
  }
};

  const handleBulkDelete = async () => {
  if (selectedFiles.length === 0) return;
  if (!confirm(`Are you sure you want to delete ${selectedFiles.length} selected item(s)?`)) return;

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/bulk/delete`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        ids: selectedFiles,
        updated_by: CURRENT_USER_ID,
        force: false
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to delete items');
    }

    const result = await response.json();
    setSuccess(result.message);
    setSelectedFiles([]);
    loadFilesAndFolders();

    if (result.results?.errors?.length > 0) {
      console.warn('Some items could not be deleted:', result.results.errors);
    }
  } catch (err) {
    console.error('Bulk delete error:', err);
    setError(err instanceof Error ? err.message : 'Failed to delete items');
  }
};

  const handleDownload = async (file: FileItem) => {
  if (file.type === 'folder') {
    // Download folder as ZIP
    return handleFolderDownload(file.id, file.name);
  }

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/download/${file.id}?user_id=${CURRENT_USER_ID}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!response.ok) throw new Error('Download failed');

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    setSuccess(`"${file.name}" downloaded successfully!`);
  } catch (err) {
    console.error('Download error:', err);
    setError(err instanceof Error ? err.message : 'Download failed');
  }
};

 const handleFolderDownload = async (folderId: string, folderName: string) => {
  try {
    setSuccess('Preparing folder download...');
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/download/folder/${folderId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) throw new Error('Folder download failed');

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${folderName}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    setSuccess(`Folder "${folderName}" downloaded as ZIP successfully!`);
  } catch (err) {
    console.error('Folder download error:', err);
    setError(err instanceof Error ? err.message : 'Folder download failed');
  }
};

  const handleBulkDownload = async () => {
  if (selectedFiles.length === 0) return;

  if (selectedFiles.length === 1) {
    const item = allItems.find(item => item.id === selectedFiles[0]);
    if (item) await handleDownload(item);
  } else {
    try {
      setSuccess('Preparing bulk download...');
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/download/bulk`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ itemIds: selectedFiles })
      });

      if (!response.ok) throw new Error('Bulk download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `selected_files_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setSuccess(`${selectedFiles.length} items downloaded as ZIP!`);
    } catch (err) {
      console.error('Bulk download error:', err);
      setError(err instanceof Error ? err.message : 'Bulk download failed');
    }
  }
};

  const handleFolderClick = (folder: FileItem) => {
    if (folder.type !== 'folder') return;
    setCurrentFolder(folder.id);
  };

  const handleBreadcrumbClick = (item: BreadcrumbItem) => {
    setCurrentFolder(item.id || null);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getFileIcon = (file: FileItem) => {
    if (file.type === 'folder') {
      return <Folder className="w-5 h-5 text-blue-500" />;
    }
    
    const fileType = file.fileType?.toLowerCase();
    switch (fileType) {
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
      case 'bmp':
      case 'svg':
        return <Image className="w-5 h-5 text-green-500" />;
      case 'pdf':
        return <FileText className="w-5 h-5 text-red-500" />;
      case 'doc':
      case 'docx':
        return <FileText className="w-5 h-5 text-blue-500" />;
      case 'xls':
      case 'xlsx':
        return <FileText className="w-5 h-5 text-green-600" />;
      case 'ppt':
      case 'pptx':
        return <FileText className="w-5 h-5 text-orange-500" />;
      case 'txt':
      case 'csv':
        return <FileText className="w-5 h-5 text-gray-600" />;
      default:
        return <File className="w-5 h-5 text-gray-500" />;
    }
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev =>
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const handleSort = (column: 'name' | 'date' | 'size') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const handleItemClick = (item: FileItem) => {
    if (item.type === 'folder') {
      handleFolderClick(item);
    } else {
      // For files, open preview modal
      handleFilePreview(item);
    }
  };

  const openRenameModal = (item: FileItem) => {
    setItemToRename(item);
    setNewName(item.name);
    setShowRenameModal(true);
  };

  const refresh = () => {
    loadFilesAndFolders();
    setSuccess('Files refreshed!');
  };

  const handleFilePreview = async (file: FileItem) => {
    setPreviewFile(file);
    setShowPreviewModal(true);
  };

  const canPreviewFile = (file: FileItem) => {
    if (!file.fileType) return false;
    const type = file.fileType.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'pdf', 'txt', 'csv', 'json', 'xml', 'html', 'css', 'js', 'md'].includes(type);
  };

  // Add user to selected list
  const addUser = (user: User) => {
    setSelectedUsers(prev => [...prev, user]);
    setUserSearchQuery('');
    setShowUserDropdown(false);
  };

  // Remove user from selected list
  const removeUser = (userId: string | number) => {
    setSelectedUsers(prev => prev.filter(user => user.id !== userId));
  };

  // Handle search input keydown
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && userSearchQuery === '' && selectedUsers.length > 0) {
      removeUser(selectedUsers[selectedUsers.length - 1].id!);
    }
  };

  // Generate mailto link for Outlook
  const generateMailtoLink = () => {
    const emails = selectedUsers.map(user => user.email).join(',');
    const subject = encodeURIComponent(`Shared files from ${currentUser.name}`);
    const fileNames = selectedFiles.map(fileId => {
      const item = allItems.find(item => item.id === fileId);
      return item?.name || 'file';
    }).join(', ');
    
    const body = encodeURIComponent(`
  ${shareMessage || `${currentUser.name} has shared the following files with you:`}

  Files: ${fileNames}

  Please check your file sharing system for access to these files.

  Best regards,
  ${currentUser.name}
    `);
    
    return `mailto:${emails}?subject=${subject}&body=${body}`;
  };

  const handleShare = async (useOutlook = false) => {
    console.log('📋 handleShare called');
    console.log('  - selectedFiles:', selectedFiles);
    console.log('  - selectedUsers:', selectedUsers);
    
    // ✅ IMPROVED: Better validation messages
    if (selectedFiles.length === 0) {
      setError('❌ Please select at least one file to share');
      return;
    }

    if (selectedUsers.length === 0) {
      setError('❌ Please select at least one user to share with');
      return;
    }

    if (useOutlook) {
      // Open Outlook with mailto link
      const mailtoLink = generateMailtoLink();
      window.location.href = mailtoLink;
      
      // Close modal and reset
      setShowShareModal(false);
      setSelectedUsers([]);
      setShareMessage('');
      setSelectedFiles([]);
      return;
    }

    // Share via system - call backend API
    setIsSharing(true);
    try {
      const token = localStorage.getItem('token');
      
      console.log('🔍 DEBUG: handleShare - Sharing Files');
      console.log('📋 Selected files:', selectedFiles);
      console.log('👥 Selected users:', selectedUsers);
      
      // Share each selected file
      const sharePromises = selectedFiles.map(async (fileId) => {
        const file = allItems.find(item => item.id === fileId);
        console.log('📤 Processing file:', file?.name, 'ID:', fileId);
        
        if (!file || file.type === 'folder') {
          console.log('⚠️ Skipping - not a file or not found');
          return; // Skip folders
        }
        
        // ✅ Convert user IDs to numbers
        const userIds = selectedUsers.map(user => {
          const id = Number(user.id);
          console.log(`🔄 User: ${user.name} (ID: ${user.id}) -> Number: ${id}`);
          return id;
        });

        console.log('📤 Request payload:');
        console.log('  - fileId:', fileId, 'Type:', typeof fileId);
        console.log('  - userIds:', userIds, 'Types:', userIds.map(id => typeof id));

        // ✅ Use the correct endpoint for regular files table
        const endpoint = `http://localhost:3002/api/share/files/${fileId}/share`;

        console.log('📤 Using endpoint:', endpoint);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            userIds: userIds  // ✅ Send as numbers
          })
        });

        console.log('📥 Response status:', response.status);

        if (!response.ok) {
          const errorData = await response.json();
          console.error('❌ Error response:', errorData);
          throw new Error(errorData.error || `Failed to share file (Status: ${response.status})`);
        }

        const result = await response.json();
        console.log('✅ Share successful:', result);
        return result;
      });

      const results = await Promise.all(sharePromises);
      console.log('✅ All shares completed:', results);

      const sharedCount = selectedFiles.filter(fileId => {
        const file = allItems.find(item => item.id === fileId);
        return file && file.type === 'file';
      }).length;

      setSuccess(`✅ ${sharedCount} file(s) shared successfully with ${selectedUsers.length} user(s)!`);
      
      setShowShareModal(false);
      setSelectedUsers([]);
      setShareMessage('');
      setSelectedFiles([]);
      
    } catch (err) {
      console.error('❌ Share error:', err);
      console.error('📋 Error details:', err);
      setError('❌ Failed to share files: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsSharing(false);
    }
  };


  // Load shares for a specific file
const loadFileShares = async (fileId: string) => {
  setLoadingShares(true);
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`http://localhost:3002/api/share/files/${fileId}/shares`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) throw new Error('Failed to load shares');

    const data = await response.json();
    setCurrentFileShares(data.data || data.users || []);
  } catch (err) {
    console.error('Error loading shares:', err);
    setError('Failed to load file shares');
  } finally {
    setLoadingShares(false);
  }
};

// Remove a share
const handleRemoveShare = async (shareId: number) => {
  if (!confirm('Remove access for this user?')) return;

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`http://localhost:3002/api/share/shares/${shareId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) throw new Error('Failed to remove share');

    setSuccess('Access removed successfully');
    
    // Reload shares
    if (selectedFileForShares) {
      await loadFileShares(selectedFileForShares.id);
    }
  } catch (err) {
    console.error('Error removing share:', err);
    setError('Failed to remove access');
  }
};

// Open manage shares modal
const openManageSharesModal = (file: FileItem) => {
  setSelectedFileForShares(file);
  setShowManageSharesModal(true);
  loadFileShares(file.id);
};

  const renderFilePreview = () => {
    if (!previewFile) return null;
    
    const fileType = previewFile.fileType?.toLowerCase();
    const previewUrl = `${API_BASE}/preview/${previewFile.id}`;
    
    // Image files
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(fileType || '')) {
      return (
        <img 
          src={previewUrl}
          alt={previewFile.name}
          className="max-w-full max-h-96 object-contain mx-auto"
          onLoad={() => setPreviewLoading(false)}
          onError={() => setPreviewLoading(false)}
        />
      );
    }
    
    // PDF files
    if (fileType === 'pdf') {
      return (
        <iframe
          src={previewUrl}
          className="w-full h-96 border-0"
          onLoad={() => setPreviewLoading(false)}
        />
      );
    }
    
    // Text files
    if (['txt', 'csv', 'json', 'xml', 'html', 'css', 'js', 'md'].includes(fileType || '')) {
      return (
        <iframe
          src={previewUrl}
          className="w-full h-96 border border-gray-200 rounded"
          onLoad={() => setPreviewLoading(false)}
        />
      );
    }
    
    return (
      <div className="text-center py-8">
        <File className={`w-12 h-12 mx-auto mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
        <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Preview not available for this file type</p>
        <button 
          onClick={() => handleDownload(previewFile)}
          className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors mx-auto"
        >
          <Download className="w-4 h-4" />
          Download to View
        </button>
      </div>
    );
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'} p-6 transition-colors duration-200`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className={`text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Files</h1>
            <button
              onClick={refresh}
              className={`flex items-center gap-2 px-3 py-2 ${isDarkMode ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'} rounded-lg transition-colors`}
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
          
          {/* Breadcrumbs */}
          <nav className={`flex items-center space-x-2 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} mb-4`}>
            {folderPath.map((crumb, index) => (
              <div key={crumb.path || index} className="flex items-center">
                {index === 0 && <Home className="w-4 h-4 mr-1" />}
                <button 
                  className={`${isDarkMode ? 'hover:text-blue-400' : 'hover:text-blue-600'} transition-colors`}
                  onClick={() => handleBreadcrumbClick(crumb)}
                >
                  {crumb.name}
                </button>
                {index < folderPath.length - 1 && (
                  <ChevronRight className={`w-4 h-4 mx-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* Success Message */}
        {success && (
          <div className={`border rounded-lg p-4 mb-6 flex items-center gap-2 transition-colors duration-200 ${isDarkMode ? 'bg-green-900 border-green-700' : 'bg-green-50 border-green-200'}`}>
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className={isDarkMode ? 'text-green-300' : 'text-green-700'}>{success}</span>
            <button 
              onClick={() => setSuccess(null)}
              className="ml-auto text-green-500 hover:text-green-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className={`border rounded-lg p-4 mb-6 flex items-center gap-2 transition-colors duration-200 ${isDarkMode ? 'bg-red-900 border-red-700' : 'bg-red-50 border-red-200'}`}>
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className={isDarkMode ? 'text-red-300' : 'text-red-700'}>{error}</span>
            <button 
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-4 mb-6 transition-colors duration-200`}>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Search and Filter */}
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search files and folders..."
                  className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-3 py-2 border rounded-lg transition-colors ${
                  showFilters 
                    ? isDarkMode ? 'bg-blue-900 border-blue-600 text-blue-300' : 'bg-blue-50 border-blue-300 text-blue-700'
                    : isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Filter className="w-4 h-4" />
                Filters
              </button>
            </div>

            {/* View Controls and Actions */}
            <div className="flex items-center gap-3">
             <div className={`flex items-center border rounded-lg ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 ${viewMode === 'grid' ? 'bg-blue-500 text-white' : isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 ${viewMode === 'list' ? 'bg-blue-500 text-white' : isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
              
              {/* Upload Button - Only show when NOT on main page */}
              {!isMainPage && (
                <button 
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  onClick={() => setShowUploadModal(true)}
                >
                  <Upload className="w-4 h-4" />
                  Upload
                </button>
              )}
              
              <button 
                className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                onClick={() => setShowFolderModal(true)}
              >
                <FolderPlus className="w-4 h-4" />
                New Folder
              </button>
            </div>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className={`mt-4 pt-4 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className="flex flex-wrap gap-4">
                <select className={`px-3 py-2 border rounded-lg text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                  <option>All Types</option>
                  <option>Folders</option>
                  <option>Documents</option>
                  <option>Images</option>
                  <option>PDFs</option>
                </select>
                <select className={`px-3 py-2 border rounded-lg text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                  <option>All Time</option>
                  <option>Last 7 days</option>
                  <option>Last 30 days</option>
                  <option>Last 3 months</option>
                </select>
                <select className={`px-3 py-2 border rounded-lg text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                  <option>All Sizes</option>
                  <option>Less than 1MB</option>
                  <option>1MB - 10MB</option>
                  <option>More than 10MB</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Main Page Restriction Notice */}
        {isMainPage && (
          <div className={`border rounded-lg p-4 mb-6 flex items-center gap-3 transition-colors duration-200 ${isDarkMode ? 'bg-blue-900 border-blue-700' : 'bg-blue-50 border-blue-200'}`}>
            <Info className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
            <div className="flex-1">
              <p className={`font-medium ${isDarkMode ? 'text-blue-300' : 'text-blue-700'}`}>Main Directory</p>
              <p className={`text-sm ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                You can only create folders in the main directory. To upload files, navigate into a folder first.
              </p>
            </div>
          </div>
        )}

        {/* Enhanced Share Modal */}
        {showShareModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className={`${isDarkMode ? 'bg-gray-800 text-white' : 'bg-white'} rounded-lg p-6 w-full max-w-2xl transition-colors duration-200`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Share Files</h3>
                <button onClick={() => {
                  setShowShareModal(false);
                  setSelectedUsers([]);
                  setShareMessage('');
                  setUserSearchQuery('');
                }}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                {/* User Search and Selection */}
                <div>
                  <label className="block text-sm font-medium mb-2">Share with</label>
                  <div className="relative">
                    <div className={`min-h-[42px] w-full px-3 py-2 border rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`}>
                      <div className="flex flex-wrap gap-2 items-center">
                        {/* Selected Users as Chips */}
                        {selectedUsers.map((user) => (
                          <div key={user.id} className="flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm">
                            <User className="w-3 h-3" />
                            <span>{user.name}</span>
                            <button 
                              onClick={() => removeUser(user.id!)}
                              className="hover:bg-blue-200 rounded-full p-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        
                        {/* Search Input */}
                        <input
                          type="text"
                          value={userSearchQuery}
                          onChange={(e) => setUserSearchQuery(e.target.value)}
                          onKeyDown={handleSearchKeyDown}
                          placeholder={selectedUsers.length === 0 ? "Search by name, email, or department..." : ""}
                          className="flex-1 min-w-[200px] outline-none bg-transparent"
                        />
                      </div>
                    </div>
                    
                    {/* User Dropdown */}
                    {showUserDropdown && (
                      <div className={`absolute top-full left-0 right-0 mt-1 border rounded-lg shadow-lg max-h-60 overflow-y-auto z-10 ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`}>
                        {filteredUsers.map((user) => (
                          <button
                            key={user.id}
                            onClick={() => addUser(user)}
                            className={`w-full px-3 py-2 text-left flex items-center gap-3 border-b last:border-b-0 ${isDarkMode ? 'hover:bg-gray-600 border-gray-600' : 'hover:bg-gray-50 border-gray-100'}`}
                          >
                            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{user.name}</div>
                              <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{user.email}</div>
                              {user.department && (
                                <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{user.department}</div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Message */}
                <div>
                  <label className="block text-sm font-medium mb-2">Message (optional)</label>
                  <textarea
                    value={shareMessage}
                    onChange={(e) => setShareMessage(e.target.value)}
                    placeholder="Add a message to your shared files..."
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    rows={3}
                  />
                </div>
                
                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      setShowShareModal(false);
                      setSelectedUsers([]);
                      setShareMessage('');
                      setUserSearchQuery('');
                    }}
                    className={`flex-1 px-4 py-2 border rounded-lg transition-colors ${isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    disabled={isSharing}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleShare(true)}
                    disabled={selectedUsers.length === 0}
                    className="flex items-center gap-2 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Mail className="w-4 h-4" />
                    Open in Outlook
                  </button>
                  <button
                    onClick={() => handleShare(false)}
                    disabled={selectedUsers.length === 0 || isSharing}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSharing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Sharing...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Share via System
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Manage Shares Modal */}
        {showManageSharesModal && selectedFileForShares && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className={`${isDarkMode ? 'bg-gray-800 text-white' : 'bg-white'} rounded-lg p-6 w-full max-w-2xl transition-colors duration-200`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Manage Access: {selectedFileForShares.name}</h3>
                <button onClick={() => {
                  setShowManageSharesModal(false);
                  setSelectedFileForShares(null);
                  setCurrentFileShares([]);
                }}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                {loadingShares ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    <span className={`ml-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Loading...</span>
                  </div>
                ) : currentFileShares.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600 mb-3">
                      {currentFileShares.length} user(s) have access to this file
                    </p>
                    {currentFileShares.map((share: any) => (
                      <div key={share.id} className={`flex items-center justify-between p-3 border rounded-lg ${isDarkMode ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-medium">
                            {share.username?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{share.username}</div>
                            <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{share.email}</div>
                            <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              Shared on {new Date(share.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveShare(share.id)}
                          className="flex items-center gap-1 px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`text-center py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    <Share2 className={`w-12 h-12 mx-auto mb-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                    <p>This file is not shared with anyone</p>
                  </div>
                )}
                
                <div className={`flex gap-3 pt-4 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <button
                    onClick={() => {
                      setShowManageSharesModal(false);
                      setSelectedFiles([selectedFileForShares.id]);
                      setShowShareModal(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                    Share with More Users
                  </button>
                  <button
                    onClick={() => {
                      setShowManageSharesModal(false);
                      setSelectedFileForShares(null);
                      setCurrentFileShares([]);
                    }}
                    className={`flex-1 px-4 py-2 border rounded-lg transition-colors ${isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Files Content */}
        {loading ? (
          <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-12 text-center transition-colors duration-200`}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Loading files...</p>
          </div>
        ) : (
          <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border overflow-hidden transition-colors duration-200`}>
            {viewMode === 'list' ? (
              /* List View */
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className={`${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'} border-b transition-colors duration-200`}>
                    <tr>
                      <th className="text-left p-3">
                        <button
                          onClick={() => handleSort('name')}
                          className={`flex items-center gap-1 text-sm font-medium ${isDarkMode ? 'text-gray-300 hover:text-white' : 'text-gray-700 hover:text-gray-900'}`}
                        >
                          Name
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="text-left p-3">
                        <button
                          onClick={() => handleSort('date')}
                          className={`flex items-center gap-1 text-sm font-medium ${isDarkMode ? 'text-gray-300 hover:text-white' : 'text-gray-700 hover:text-gray-900'}`}
                        >
                          Modified
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="text-left p-3">
                        <button
                          onClick={() => handleSort('size')}
                          className={`flex items-center gap-1 text-sm font-medium ${isDarkMode ? 'text-gray-300 hover:text-white' : 'text-gray-700 hover:text-gray-900'}`}
                        >
                          Size
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className={`w-16 p-3 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-gray-700' : 'divide-gray-100'}`}>
                    {filteredAndSortedFiles.map((file) => (
                      <tr
                        key={file.id}
                        className={`transition-colors cursor-pointer ${
                          selectedFiles.includes(file.id) 
                            ? isDarkMode ? 'bg-blue-900' : 'bg-blue-50'
                            : isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => handleItemClick(file)}
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            {getFileIcon(file)}
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{file.name}</span>
                              {file.isStarred && <Star className="w-4 h-4 text-yellow-400 fill-current" />}
                            </div>
                          </div>
                        </td>
                        <td className={`p-3 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          <div className="flex items-center gap-2">
                            <Calendar className={`w-4 h-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                            {formatDate(file.modifiedAt)}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <User className="w-4 h-4 text-gray-400" />
                            {file.modifiedBy}
                          </div>
                        </td>
                        <td className={`p-3 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {file.size ? formatFileSize(file.size) : '-'}
                        </td>
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => openRenameModal(file)}
                              className="p-1 hover:bg-gray-100 rounded transition-colors"
                              title="Rename"
                            >
                              <Edit className="w-4 h-4 text-gray-400" />
                            </button>
                            {/* ✅ NEW: Share Button */}
                            {file.type === 'file' && (
                              <>
                                {/* Share Button - FIX: Set selectedFiles BEFORE opening modal */}
                                <button 
                                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedFiles([file.id]); // ✅ ADD THIS LINE
                                    setShowShareModal(true);
                                  }}
                                  title="Share"
                                >
                                  <Share2 className="w-4 h-4 text-blue-400" />
                                </button>
                                {/* Manage Access Button 
                                <button 
                                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openManageSharesModal(file);
                                  }}
                                  title="Manage Access"
                                >
                                  <User className="w-4 h-4 text-green-400" />
                                </button>
                                */}
                                {/* Download Button */}
                                <button 
                                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(file);
                                  }}
                                  title="Download"
                                >
                                  <Download className="w-4 h-4 text-gray-400" />
                                </button>
                              </>
                            )}
                            <button 
                              onClick={() => handleDelete(file.id)}
                              className="p-1 hover:bg-gray-100 rounded transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          ) : (
              /* Grid View */
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                  {filteredAndSortedFiles.map((file) => (
                    <div
                      key={file.id}
                      className={`relative group p-4 border rounded-lg hover:shadow-md transition-all cursor-pointer ${isDarkMode ? 'border-gray-700 hover:border-gray-600 bg-gray-800' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                      onClick={() => {
                        if (file.type === 'folder') {
                          handleFolderClick(file);
                        } else {
                          handleFilePreview(file);
                        }
                      }}
                    >
                      {/* Action Buttons - Visible on Hover */}
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button 
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            openRenameModal(file);
                          }}
                          title="Rename"
                        >
                          <Edit className="w-4 h-4 text-gray-400" />
                        </button>
                        {file.type === 'file' && (
                          <>
                            {/* Share Button */}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedFiles([file.id]); // ✅ SET selectedFiles
                                setShowShareModal(true);
                              }}
                              className="p-1 hover:bg-gray-100 rounded transition-colors"
                              title="Share"
                            >
                              <Share2 className="w-4 h-4 text-blue-400" />
                            </button>
                            {/* Manage Access Button 
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                openManageSharesModal(file);
                              }}
                              className="p-1 hover:bg-gray-100 rounded transition-colors"
                              title="Manage Access"
                            >
                              <User className="w-4 h-4 text-green-400" />
                            </button>
                            */}
                            {/* Download Button */}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(file);
                              }}
                              className="p-1 hover:bg-gray-100 rounded transition-colors"
                              title="Download"
                            >
                              <Download className="w-4 h-4 text-gray-400" />
                            </button>
                          </>
                        )}
                        {/* Delete Button */}
                        <button 
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(file.id);
                          }}
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>

                      {/* File Icon and Info */}
                      <div className="flex flex-col items-center text-center mt-2">
                        <div className="w-12 h-12 mb-3 flex items-center justify-center">
                          {file.type === 'folder' ? (
                            <Folder className="w-10 h-10 text-blue-500" />
                          ) : (
                            <div className="relative">
                              {getFileIcon(file)}
                              <div className="absolute -top-1 -right-1">
                                {file.isStarred && <Star className="w-3 h-3 text-yellow-400 fill-current" />}
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <h3 className={`font-medium text-sm mb-1 line-clamp-2 leading-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {file.name}
                        </h3>
                        
                        <div className={`text-xs space-y-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          <div className="flex items-center justify-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(file.modifiedAt)}
                          </div>
                          {file.size && (
                            <div>{formatFileSize(file.size)}</div>
                          )}
                          <div className="flex items-center justify-center gap-1">
                            <User className="w-3 h-3" />
                            {file.modifiedBy}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredAndSortedFiles.length === 0 && (
          <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-12 text-center transition-colors duration-200`}>
            <File className={`w-12 h-12 mx-auto mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
            <h3 className={`text-lg font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>No files found</h3>
            <p className={`mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              {searchQuery 
                ? 'Try adjusting your search terms.' 
                : isMainPage 
                  ? 'Create folders to organize your files, then upload files inside them.'
                  : 'Upload your first file to get started.'
              }
            </p>
            {isMainPage ? (
              <button 
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors mx-auto"
                onClick={() => setShowFolderModal(true)}
              >
                <FolderPlus className="w-4 h-4" />
                Create Folder
              </button>
            ) : (
              <button 
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors mx-auto"
                onClick={() => setShowUploadModal(true)}
              >
                <Upload className="w-4 h-4" />
                Upload Files
              </button>
            )}
          </div>
        )}

        {/* Upload Modal - Only accessible when not on main page */}
        {showUploadModal && !isMainPage && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className={`rounded-lg p-6 w-full max-w-md ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Upload Files</h3>
                <button 
                  onClick={() => {
                    setShowUploadModal(false);
                    setUploadFiles(null);
                  }}
                  className={`${isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
                  disabled={isUploading}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Select Files
                  </label>
                  <input
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    disabled={isUploading}
                  />
                  {uploadFiles && uploadFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {Array.from(uploadFiles).map((file, index) => (
                        <p key={index} className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {file.name} ({formatFileSize(file.size)})
                        </p>
                      ))}
                      <p className={`text-sm font-medium mt-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Total: {uploadFiles.length} file{uploadFiles.length > 1 ? 's' : ''}
                      </p>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-3 pt-4">
                  <button
                    onClick={() => {
                      setShowUploadModal(false);
                      setUploadFiles(null);
                    }}
                    className={`flex-1 px-4 py-2 border rounded-lg transition-colors ${isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    disabled={isUploading}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={!uploadFiles || uploadFiles.length === 0 || isUploading}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isUploading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Upload {uploadFiles && uploadFiles.length > 1 ? `${uploadFiles.length} Files` : 'File'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Folder Modal */}
        {showFolderModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 w-full max-w-md transition-colors duration-200`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Create New Folder</h3>
                <button 
                  onClick={() => {
                    setShowFolderModal(false);
                    setNewFolderName('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                  disabled={isCreatingFolder}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Folder Name
                  </label>
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Enter folder name..."
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && newFolderName.trim() && !isCreatingFolder) {
                        handleCreateFolder();
                      }
                    }}
                    disabled={isCreatingFolder}
                  />
                </div>
                
                <div className="flex items-center gap-3 pt-4">
                  <button
                    onClick={() => {
                      setShowFolderModal(false);
                      setNewFolderName('');
                    }}
                    className={`flex-1 px-4 py-2 border rounded-lg transition-colors ${isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    disabled={isCreatingFolder}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateFolder}
                    disabled={!newFolderName.trim() || isCreatingFolder}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isCreatingFolder ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Creating...
                      </>
                    ) : (
                      <>
                        <FolderPlus className="w-4 h-4" />
                        Create
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Rename Modal */}
        {showRenameModal && itemToRename && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 w-full max-w-md transition-colors duration-200`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Rename {itemToRename.type === 'folder' ? 'Folder' : 'File'}
                </h3>
                <button 
                  onClick={() => {
                    setShowRenameModal(false);
                    setItemToRename(null);
                    setNewName('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                  disabled={isRenaming}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    New Name
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Enter new name..."
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && newName.trim() && !isRenaming) {
                        handleRename();
                      }
                    }}
                    disabled={isRenaming}
                  />
                </div>
                
                <div className="flex items-center gap-3 pt-4">
                  <button
                    onClick={() => {
                      setShowRenameModal(false);
                      setItemToRename(null);
                      setNewName('');
                    }}
                    className={`flex-1 px-4 py-2 border rounded-lg transition-colors ${isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    disabled={isRenaming}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRename}
                    disabled={!newName.trim() || isRenaming}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isRenaming ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Renaming...
                      </>
                    ) : (
                      <>
                        <Edit className="w-4 h-4" />
                        Rename
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* File Preview Modal */}
        {showPreviewModal && previewFile && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden transition-colors duration-200`}>
              {/* Modal Header */}
              <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center gap-3">
                  {getFileIcon(previewFile)}
                  <div>
                    <h3 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{previewFile.name}</h3>
                    <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {previewFile.size ? `${formatFileSize(previewFile.size)} • ` : ''}
                      Modified {formatDate(previewFile.modifiedAt)}
                    </p>
                  </div>
                </div>
              
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDownload(previewFile)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                  <button
                    onClick={() => {
                      setShowPreviewModal(false);
                      setPreviewFile(null);
                      setPreviewLoading(false);
                    }}
                    className={`p-2 rounded-md transition-colors ${isDarkMode ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                    aria-label="Close preview"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            
              {/* Modal Content */}
              <div className={`p-6 overflow-auto max-h-[calc(90vh-120px)] ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
                {previewLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className={`ml-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Loading preview...</span>
                  </div>
                ) : canPreviewFile(previewFile) ? (
                  <div className="text-center">
                    {renderFilePreview()}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <File className={`w-16 h-16 mx-auto mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                    <h4 className={`text-xl font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Preview Not Available</h4>
                    <p className={`mb-6 max-w-md mx-auto ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      This file type cannot be previewed in the browser. Download the file to view its contents.
                    </p>
                    <button
                      onClick={() => handleDownload(previewFile)}
                      className="inline-flex items-center gap-2 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download File
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Files;