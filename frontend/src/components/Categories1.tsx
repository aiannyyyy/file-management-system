import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Plus,
  FolderOpen,
  FileText,
  Users,
  BookOpen,
  ClipboardList,
  BarChart3,
  Shield,
  Briefcase,
  GraduationCap,
  Heart,
  Settings,
  Edit3,
  Trash2,
  Grid3X3,
  List,
  X,
  AlertCircle,
  Loader,
  ArrowLeft,
  Folder,
  Upload,
  Download,
  Star,
  StarOff,
  ChevronRight,
  Home,
  File,
  CheckCircle,
  Eye,
  Share2,
  Mail,
  Send,
  User
} from 'lucide-react';
import { useDarkMode } from '../contexts/DarkModeContext';

// Icon mapping for categories
const iconOptions = {
  BookOpen,
  ClipboardList,
  BarChart3,
  Settings,
  Shield,
  Briefcase,
  GraduationCap,
  Users,
  Heart,
  FolderOpen,
  FileText
};

interface Category {
  id: number;
  name: string;
  description: string;
  color: string;
  icon: string;
  is_active: boolean;
  created_by: number;
  created_by_name?: string;
  updated_by?: number;
  updated_by_name?: string;
  created_at: string;
  updated_at: string;
}

interface Folder {
  id: number;
  name: string;
  description: string;
  category_id: number;
  category_name?: string;
  parent_folder_id?: number;
  path: string;
  is_active: boolean;
  created_by: number;
  created_by_name?: string;
  updated_by?: number;
  updated_by_name?: string;
  created_at: string;
  updated_at: string;
}

interface FileItem {
  id: number;
  name: string;
  original_name: string;
  file_type: string;
  file_size: number;
  formatted_size: string;
  mime_type: string;
  file_path: string;
  category_id: number;
  category_name?: string;
  folder_id?: number;
  folder_name?: string;
  is_starred: boolean;
  is_active: boolean;
  download_count: number;
  last_accessed: string;
  created_by: number;
  created_by_name?: string;
  updated_by?: number;
  updated_by_name?: string;
  created_at: string;
  updated_at: string;
}

interface User {
  id?: string | number;
  name: string;
  user_name: string;
  email: string;
  department?: string;
  role: string;
}

interface FileManagementProps {
  currentUser: User;
}

type ViewType = 'categories' | 'files-folders';
type ItemType = 'category' | 'folder' | 'file';

interface BreadcrumbItem {
  id: number | null;
  name: string;
  type: 'category' | 'folder';
}

interface UploadProgress {
  fileName: string;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  error?: string;
}

const FileManagement: React.FC<FileManagementProps> = ({ currentUser }) => {
  const { isDarkMode } = useDarkMode();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentView, setCurrentView] = useState<ViewType>('categories');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Data states
  const [categories, setCategories] = useState<Category[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  
  // Navigation states
  const [currentCategoryId, setCurrentCategoryId] = useState<number | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([]);
  
  // UI states
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit' | 'delete'>('add');
  const [modalType, setModalType] = useState<ItemType>('category');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  
  // File viewing states
  const [showFileViewer, setShowFileViewer] = useState(false);
  const [viewingFile, setViewingFile] = useState<FileItem | null>(null);

  // For Sharing Files
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedFileForShares, setSelectedFileForShares] = useState<FileItem | null>(null);
  const [showManageSharesModal, setShowManageSharesModal] = useState(false);
  const [currentFileShares, setCurrentFileShares] = useState<any[]>([]);
  const [loadingShares, setLoadingShares] = useState(false);

  // User Search and Selection for Sharing
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [shareMessage, setShareMessage] = useState('');
  const [isSharing, setIsSharing] = useState(false);
    
  // Form states
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    color: '#007bff',
    icon: 'FolderOpen',
    is_active: true
  });
  
  const [folderForm, setFolderForm] = useState({
    name: '',
    description: '',
    category_id: 0,
    parent_folder_id: null as number | null
  });
  
  // File upload states
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [uploadMode, setUploadMode] = useState<'single' | 'multiple' | 'bulk'>('multiple');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const CURRENT_USER_ID = currentUser?.id ? currentUser.id.toString() : '1';

  // ============================================
  // USEEFFECTS
  // ============================================

  useEffect(() => {
    if (currentView === 'categories') {
      fetchCategories();
    } else {
      fetchFilesAndFolders();
    }
  }, [currentView, currentCategoryId, currentFolderId]);

  useEffect(() => {
    if (showShareModal) {
      fetchUsers();
    }
  }, [showShareModal]);

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

  // ============================================
  // FETCH FUNCTIONS
  // ============================================

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:3002/api/categories');
      if (!response.ok) throw new Error('Failed to fetch categories');
      const data = await response.json();
      setCategories(data.categories || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch categories');
    } finally {
      setLoading(false);
    }
  };

  const fetchFilesAndFolders = async () => {
    try {
      setLoading(true);
      
      let folderUrl = 'http://localhost:3002/api/folders';
      const folderParams = new URLSearchParams();
      if (currentCategoryId) folderParams.append('category_id', currentCategoryId.toString());
      
      if (currentFolderId === null) {
        folderParams.append('parent_folder_id', 'null');
      } else {
        folderParams.append('parent_folder_id', currentFolderId.toString());
      }
      
      if (folderParams.toString()) folderUrl += `?${folderParams}`;
      
      let fileUrl = 'http://localhost:3002/api/files';
      const fileParams = new URLSearchParams();
      if (currentCategoryId) fileParams.append('category_id', currentCategoryId.toString());
      
      if (currentFolderId === null) {
        fileParams.append('folder_id', 'null');
      } else {
        fileParams.append('folder_id', currentFolderId.toString());
      }
      
      if (fileParams.toString()) fileUrl += `?${fileParams}`;
      
      const [folderResponse, fileResponse] = await Promise.all([
        fetch(folderUrl),
        fetch(fileUrl)
      ]);
      
      if (!folderResponse.ok || !fileResponse.ok) {
        throw new Error('Failed to fetch data');
      }
      
      const folderData = await folderResponse.json();
      const fileData = await fileResponse.json();
      
      setFolders(folderData.folders || []);
      setFiles(fileData.files || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        console.error('No token found');
        return;
      }
      
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
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch users');
      }
      
      const data = await response.json();
      console.log('✅ Users fetched:', data);
      setAvailableUsers(data.data || data);
    } catch (err) {
      console.error('❌ Error fetching users:', err);
      setError('Failed to load users: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  // ============================================
  // SHARING FUNCTIONS
  // ============================================

  const addUser = (user: User) => {
    console.log('➕ Adding user:', user.name);
    setSelectedUsers(prev => [...prev, user]);
    setUserSearchQuery('');
    setShowUserDropdown(false);
  };

  const removeUser = (userId: string | number) => {
    console.log('➖ Removing user:', userId);
    setSelectedUsers(prev => prev.filter(user => user.id !== userId));
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && userSearchQuery === '' && selectedUsers.length > 0) {
      removeUser(selectedUsers[selectedUsers.length - 1].id!);
    }
  };

  // Updated handleShare function with better error handling and debugging
  const handleShare = async (useOutlook = false) => {
    if (selectedUsers.length === 0) {
      setError('Please select at least one user to share with');
      return;
    }

    if (!selectedFileForShares) {
      setError('Please select a file to share');
      return;
    }

    // Check if current user is the file owner
    if (selectedFileForShares.created_by.toString() !== CURRENT_USER_ID) {
      setError(`Only the file owner can share this file. File owner: ${selectedFileForShares.created_by_name || 'Unknown'}`);
      return;
    }

    if (useOutlook) {
      const emails = selectedUsers.map(user => user.email).join(',');
      const subject = encodeURIComponent(`Shared files from ${currentUser.name}`);
      const body = encodeURIComponent(`
  ${shareMessage || `${currentUser.name} has shared the following file with you:`}

  File: ${selectedFileForShares.name}

  Please check your file sharing system for access to this file.

  Best regards,
  ${currentUser.name}
      `);
      
      const mailtoLink = `mailto:${emails}?subject=${subject}&body=${body}`;
      window.location.href = mailtoLink;
      
      setShowShareModal(false);
      setSelectedUsers([]);
      setShareMessage('');
      setSelectedFileForShares(null);
      setUserSearchQuery('');
      return;
    }

    setIsSharing(true);
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        setError('Authentication token missing');
        setIsSharing(false);
        return;
      }

      const fileId = selectedFileForShares.id;
      const userIds = selectedUsers.map(user => user.id?.toString());

      console.log('🔄 Sharing file:', {
        fileId,
        userIds,
        fileName: selectedFileForShares.name,
        currentUserId: CURRENT_USER_ID,
        fileOwnerId: selectedFileForShares.created_by,
        isOwner: selectedFileForShares.created_by.toString() === CURRENT_USER_ID
      });

      const endpoint = `http://localhost:3002/api/share/category-files/${fileId}/share`;

      console.log('📤 Using endpoint:', endpoint);
      console.log('📋 User IDs:', userIds);
      console.log('🔑 Token present:', !!token);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          userIds: userIds
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

      setSuccess(`File "${selectedFileForShares.name}" shared with ${selectedUsers.length} user(s) successfully!`);
      
      setShowShareModal(false);
      setSelectedUsers([]);
      setShareMessage('');
      setSelectedFileForShares(null);
      setUserSearchQuery('');
      
    } catch (err) {
      console.error('❌ Share error:', err);
      setError('Failed to share file: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsSharing(false);
    }
  };

  const loadFileShares = async (fileId: number) => {
    setLoadingShares(true);
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        throw new Error('Authentication token missing');
      }

      console.log('🔄 Loading shares for file:', fileId);

      // ✅ YOUR FILES ARE IN categories_files TABLE
      const endpoint = `http://localhost:3002/api/share/category-files/${fileId}/shares`;

      console.log('📤 Fetching from:', endpoint);

      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('📥 Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Error response:', errorData);
        throw new Error(errorData.error || 'Failed to load shares');
      }

      const data = await response.json();
      console.log('✅ Shares loaded:', data);
      setCurrentFileShares(data.data || []);
    } catch (err) {
      console.error('❌ Error loading shares:', err);
      setError('Failed to load file shares: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoadingShares(false);
    }
  };


  const handleRemoveShare = async (shareId: number) => {
    if (!confirm('Remove access for this user?')) return;

    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        throw new Error('Authentication token missing');
      }

      console.log('🔄 Removing share:', shareId);

      const endpoint = `http://localhost:3002/api/share/shares/${shareId}`;

      console.log('📤 DELETE from:', endpoint);

      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('📥 Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Error response:', errorData);
        throw new Error(errorData.error || 'Failed to remove share');
      }

      const result = await response.json();
      console.log('✅ Share removed:', result);

      setSuccess('Access removed successfully');
      
      // Reload shares list
      if (selectedFileForShares) {
        await loadFileShares(selectedFileForShares.id);
      }
    } catch (err) {
      console.error('❌ Error removing share:', err);
      setError('Failed to remove access: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const openManageSharesModal = (file: FileItem) => {
    console.log('📋 Opening manage shares modal for:', file.name);
    setSelectedFileForShares(file);
    setShowManageSharesModal(true);
    loadFileShares(file.id);
  };

  // ============================================
  // MODAL & NAVIGATION FUNCTIONS
  // ============================================

  const handleCategoryDoubleClick = (category: Category) => {
    setCurrentCategoryId(category.id);
    setCurrentFolderId(null);
    setBreadcrumb([{ id: category.id, name: category.name, type: 'category' }]);
    setCurrentView('files-folders');
  };

  const handleFolderDoubleClick = (folder: Folder) => {
    setCurrentFolderId(folder.id);
    setBreadcrumb(prev => [...prev, { id: folder.id, name: folder.name, type: 'folder' }]);
  };

  const handleBreadcrumbClick = (index: number) => {
    const clickedItem = breadcrumb[index];
    const newBreadcrumb = breadcrumb.slice(0, index + 1);
    
    if (clickedItem.type === 'category') {
      setCurrentFolderId(null);
    } else {
      setCurrentFolderId(clickedItem.id);
    }
    
    setBreadcrumb(newBreadcrumb);
  };

  const handleBackToCategories = () => {
    setCurrentView('categories');
    setCurrentCategoryId(null);
    setCurrentFolderId(null);
    setBreadcrumb([]);
  };

  const openModal = (mode: 'add' | 'edit' | 'delete', type: ItemType, item?: any) => {
    setModalMode(mode);
    setModalType(type);
    setSelectedItem(item || null);
    
    if (mode === 'add') {
      if (type === 'category') {
        setCategoryForm({
          name: '',
          description: '',
          color: '#007bff',
          icon: 'FolderOpen',
          is_active: true
        });
      } else if (type === 'folder') {
        setFolderForm({
          name: '',
          description: '',
          category_id: currentCategoryId || 0,
          parent_folder_id: currentFolderId
        });
      } else if (type === 'file') {
        setUploadFiles([]);
        setUploadProgress([]);
        setUploadMode('multiple');
      }
    } else if (mode === 'edit' && item) {
      if (type === 'category') {
        setCategoryForm({
          name: item.name,
          description: item.description,
          color: item.color,
          icon: item.icon,
          is_active: item.is_active
        });
      } else if (type === 'folder') {
        setFolderForm({
          name: item.name,
          description: item.description,
          category_id: item.category_id,
          parent_folder_id: item.parent_folder_id
        });
      }
    }
    
    setShowModal(true);
    setError('');
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedItem(null);
    setError('');
    setUploadFiles([]);
    setUploadProgress([]);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');

    try {
      let response;
      
      if (modalType === 'category') {
        if (!categoryForm.name.trim()) {
          setError('Category name is required');
          return;
        }
        
        if (modalMode === 'add') {
          response = await fetch('http://localhost:3002/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...categoryForm, created_by: CURRENT_USER_ID })
          });
        } else if (modalMode === 'edit' && selectedItem) {
          response = await fetch(`http://localhost:3002/api/categories/${selectedItem.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...categoryForm, updated_by: CURRENT_USER_ID })
          });
        }
      } else if (modalType === 'folder') {
        if (!folderForm.name.trim()) {
          setError('Folder name is required');
          return;
        }
        
        if (modalMode === 'add') {
          response = await fetch('http://localhost:3002/api/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...folderForm, created_by: CURRENT_USER_ID })
          });
        } else if (modalMode === 'edit' && selectedItem) {
          response = await fetch(`http://localhost:3002/api/folders/${selectedItem.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...folderForm, updated_by: CURRENT_USER_ID })
          });
        }
      }

      if (!response?.ok) {
        const errorData = await response?.json();
        throw new Error(errorData?.error || 'Operation failed');
      }

      if (currentView === 'categories') {
        await fetchCategories();
      } else {
        await fetchFilesAndFolders();
      }
      
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;

    const userId = currentUser?.id || CURRENT_USER_ID || '1';

    setSubmitting(true);
    setError('');

    try {
      let response;
      
      const numericUserId = typeof userId === 'string' ? parseInt(userId) : userId;
      
      if (!numericUserId || isNaN(numericUserId)) {
        throw new Error('Invalid user ID. Please make sure you are logged in.');
      }
      
      const deletePayload = { 
        deleted_by: numericUserId,
        updated_by: numericUserId
      };
      
      if (modalType === 'category') {
        response = await fetch(`http://localhost:3002/api/categories/${selectedItem.id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(deletePayload)
        });
      } else if (modalType === 'folder') {
        response = await fetch(`http://localhost:3002/api/folders/${selectedItem.id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(deletePayload)
        });
      } else if (modalType === 'file') {
        response = await fetch(`http://localhost:3002/api/files/${selectedItem.id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(deletePayload)
        });
      }

      if (!response?.ok) {
        const errorData = await response?.json();
        throw new Error(errorData?.error || 'Failed to delete');
      }

      if (currentView === 'categories') {
        await fetchCategories();
      } else {
        await fetchFilesAndFolders();
      }
      
      closeModal();
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================
  // FILE UPLOAD FUNCTIONS
  // ============================================

  const handleFileUpload = async () => {
    if (uploadFiles.length === 0) {
      setError('Please select files to upload');
      return;
    }

    if (!currentCategoryId) {
      setError('Category is required for file upload');
      return;
    }

    setSubmitting(true);
    setError('');

    const progressArray = uploadFiles.map(file => ({
      fileName: file.name,
      progress: 0,
      status: 'uploading' as const
    }));
    setUploadProgress(progressArray);

    try {
      const formData = new FormData();
      
      uploadFiles.forEach(file => {
        formData.append('files', file);
      });
      
      formData.append('category_id', currentCategoryId.toString());
      formData.append('created_by', CURRENT_USER_ID);
      if (currentFolderId) {
        formData.append('folder_id', currentFolderId.toString());
      }

      let endpoint = '';
      if (uploadMode === 'single') {
        endpoint = 'http://localhost:3002/api/files/upload-single';
        const singleFormData = new FormData();
        singleFormData.append('file', uploadFiles[0]);
        singleFormData.append('category_id', currentCategoryId.toString());
        singleFormData.append('created_by', CURRENT_USER_ID);
        if (currentFolderId) {
          singleFormData.append('folder_id', currentFolderId.toString());
        }
        
        const response = await fetch(endpoint, {
          method: 'POST',
          body: singleFormData
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData?.error || 'Upload failed');
        }
      } else if (uploadMode === 'bulk') {
        endpoint = 'http://localhost:3002/api/files/bulk-upload';
        
        const response = await fetch(endpoint, {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData?.error || 'Bulk upload failed');
        }
      } else {
        endpoint = 'http://localhost:3002/api/files/upload-multiple';
        
        const response = await fetch(endpoint, {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData?.error || 'Upload failed');
        }
      }

      setUploadProgress(prev => 
        prev.map(item => ({
          ...item,
          progress: 100,
          status: 'completed'
        }))
      );

      await fetchFilesAndFolders();
      
      setTimeout(() => {
        closeModal();
      }, 1000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      
      setUploadProgress(prev => 
        prev.map(item => ({
          ...item,
          status: 'error',
          error: err instanceof Error ? err.message : 'Upload failed'
        }))
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setUploadFiles(files);
      
      if (files.length === 1) {
        setUploadMode('single');
      } else if (files.length <= 5) {
        setUploadMode('multiple');
      } else {
        setUploadMode('bulk');
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    setUploadFiles(files);
    
    if (files.length === 1) {
      setUploadMode('single');
    } else if (files.length <= 5) {
      setUploadMode('multiple');
    } else {
      setUploadMode('bulk');
    }
  };

  const removeFile = (index: number) => {
    setUploadFiles(prev => prev.filter((_, i) => i !== index));
  };

  // ============================================
  // FILE OPERATIONS
  // ============================================

  const handleDownloadFile = async (file: FileItem) => {
    try {
      setError('Preparing secured download...');
      
      const downloadUrl = `http://localhost:3002/api/files/${file.id}/download?user_id=${CURRENT_USER_ID}`;
      
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/pdf,*/*'
        }
      });

      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.original_name;
      document.body.appendChild(a);
      a.click();
      
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setError('');
      
      const successMsg = isPDFFile(file.file_type) 
        ? 'PDF downloaded with read-only protection. Editing is restricted.' 
        : 'File downloaded successfully';
      
      console.log(successMsg);
      
    } catch (err) {
      setError('Download failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handlePreviewFile = async (file: FileItem) => {
    try {
      const previewUrl = `http://localhost:3002/api/files/${file.id}/download?user_id=${CURRENT_USER_ID}&preview=true`;
      
      const newWindow = window.open(previewUrl, '_blank');
      
      if (!newWindow) {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }
      
    } catch (err) {
      setError('Preview failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleStarFile = async (file: FileItem) => {
    try {
      const response = await fetch(`http://localhost:3002/api/files/${file.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          is_starred: !file.is_starred,
          updated_by: CURRENT_USER_ID
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData?.error || 'Failed to update star status');
      }

      await fetchFilesAndFolders();
      
      if (viewingFile && viewingFile.id === file.id) {
        setViewingFile({ ...viewingFile, is_starred: !file.is_starred });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update star status');
    }
  };

  const handleViewFile = (file: FileItem) => {
    setViewingFile(file);
    setShowFileViewer(true);
  };

  const closeFileViewer = () => {
    setShowFileViewer(false);
    setViewingFile(null);
  };

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  const isImageFile = (fileType: string) => {
    const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    return imageTypes.includes(fileType.toLowerCase());
  };

  const isPDFFile = (fileType: string) => {
    return fileType.toLowerCase() === 'pdf';
  };

  const isTextFile = (fileType: string) => {
    const textTypes = ['txt', 'md', 'json', 'xml', 'csv', 'log'];
    return textTypes.includes(fileType.toLowerCase());
  };

  const isVideoFile = (fileType: string) => {
    const videoTypes = ['mp4', 'webm', 'ogg', 'mov'];
    return videoTypes.includes(fileType.toLowerCase());
  };

  const isAudioFile = (fileType: string) => {
    const audioTypes = ['mp3', 'wav', 'ogg', 'm4a'];
    return audioTypes.includes(fileType.toLowerCase());
  };

  const getIconComponent = (iconName: string) => {
    return iconOptions[iconName as keyof typeof iconOptions] || FolderOpen;
  };

  const getColorClasses = (color: string) => {
    const colorMap: Record<string, { text: string; bg: string }> = {
      '#007bff': { text: 'text-blue-600', bg: 'bg-blue-50' },
      '#28a745': { text: 'text-green-600', bg: 'bg-green-50' },
      '#dc3545': { text: 'text-red-600', bg: 'bg-red-50' },
      '#ffc107': { text: 'text-yellow-600', bg: 'bg-yellow-50' },
      '#6f42c1': { text: 'text-purple-600', bg: 'bg-purple-50' },
      '#fd7e14': { text: 'text-orange-600', bg: 'bg-orange-50' },
      '#20c997': { text: 'text-teal-600', bg: 'bg-teal-50' },
      '#e83e8c': { text: 'text-pink-600', bg: 'bg-pink-50' },
      '#6c757d': { text: 'text-gray-600', bg: 'bg-gray-50' },
    };
    
    return colorMap[color] || { text: 'text-blue-600', bg: 'bg-blue-50' };
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getFileTypeIcon = (fileType: string) => {
    const type = fileType.toLowerCase();
    
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(type)) {
      return <div className="w-5 h-5 bg-green-100 rounded flex items-center justify-center text-green-600 text-xs font-bold">IMG</div>;
    }
    
    if (type === 'pdf') {
      return <div className="w-5 h-5 bg-red-100 rounded flex items-center justify-center text-red-600 text-xs font-bold">PDF</div>;
    }
    
    if (['doc', 'docx'].includes(type)) {
      return <div className="w-5 h-5 bg-blue-100 rounded flex items-center justify-center text-blue-600 text-xs font-bold">DOC</div>;
    }
    
    if (['xls', 'xlsx', 'csv'].includes(type)) {
      return <div className="w-5 h-5 bg-emerald-100 rounded flex items-center justify-center text-emerald-600 text-xs font-bold">XLS</div>;
    }
    
    if (['ppt', 'pptx'].includes(type)) {
      return <div className="w-5 h-5 bg-orange-100 rounded flex items-center justify-center text-orange-600 text-xs font-bold">PPT</div>;
    }
    
    if (['txt', 'md', 'log'].includes(type)) {
      return <div className="w-5 h-5 bg-gray-100 rounded flex items-center justify-center text-gray-600 text-xs font-bold">TXT</div>;
    }
    
    if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'xml'].includes(type)) {
      return <div className="w-5 h-5 bg-purple-100 rounded flex items-center justify-center text-purple-600 text-xs font-bold">CODE</div>;
    }
    
    if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'].includes(type)) {
      return <div className="w-5 h-5 bg-pink-100 rounded flex items-center justify-center text-pink-600 text-xs font-bold">VID</div>;
    }
    
    if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(type)) {
      return <div className="w-5 h-5 bg-indigo-100 rounded flex items-center justify-center text-indigo-600 text-xs font-bold">AUD</div>;
    }
    
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(type)) {
      return <div className="w-5 h-5 bg-yellow-100 rounded flex items-center justify-center text-yellow-600 text-xs font-bold">ZIP</div>;
    }
    
    return <File className="w-5 h-5 text-gray-600" />;
  };

  const filteredData = () => {
    if (currentView === 'categories') {
      return categories.filter(category =>
        category.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        category.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    } else {
      const filteredFolders = folders.filter(folder =>
        folder.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        folder.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
      const filteredFiles = files.filter(file =>
        file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        file.original_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      return { folders: filteredFolders, files: filteredFiles };
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'} flex items-center justify-center transition-colors duration-200`}>
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Loading...</p>
        </div>
      </div>
    );
  }

  // Replace your entire FileManagement component's return statement with this:

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'} p-6 transition-colors duration-200`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-2">
            {currentView !== 'categories' && (
              <button
                onClick={handleBackToCategories}
                className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
              >
                <ArrowLeft className={`w-5 h-5 ${isDarkMode ? 'text-white' : 'text-black'}`} />
              </button>
            )}
            <h1 className={`text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {currentView === 'categories' ? 'Categories' : 'File Management'}
            </h1>
          </div>
          
          {/* Breadcrumb */}
          {currentView === 'files-folders' && breadcrumb.length > 0 && (
            <div className={`flex items-center gap-2 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              <Home className="w-4 h-4" />
              {breadcrumb.map((item, index) => (
                <React.Fragment key={index}>
                  <ChevronRight className="w-4 h-4" />
                  <button
                    onClick={() => handleBreadcrumbClick(index)}
                    className={`transition-colors ${isDarkMode ? 'hover:text-blue-400' : 'hover:text-blue-600'}`}
                  >
                    {item.name}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-4 mb-6 transition-colors duration-200`}>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Search */}
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder={`Search ${currentView === 'categories' ? 'categories' : 'files and folders'}...`}
                  className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
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
              
              {currentView === 'categories' ? (
                <button
                  onClick={() => openModal('add', 'category')}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Category
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openModal('add', 'folder')}
                    className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Folder className="w-4 h-4" />
                    New Folder
                  </button>
                  <button
                    onClick={() => openModal('add', 'file')}
                    className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Upload Files
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Statistics Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {currentView === 'categories' ? (
            <>
              <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-3 transition-colors duration-200`}>
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded ${isDarkMode ? 'bg-gray-700' : 'bg-blue-50'}`}>
                    <FolderOpen className={isDarkMode ? 'w-4 h-4 text-blue-400' : 'w-4 h-4 text-blue-600'} />
                  </div>
                  <div>
                    <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Total Categories</div>
                    <div className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{categories.length}</div>
                  </div>
                </div>
              </div>

              <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-3 transition-colors duration-200`}>
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded ${isDarkMode ? 'bg-gray-700' : 'bg-green-50'}`}>
                    <FileText className={isDarkMode ? 'w-4 h-4 text-green-400' : 'w-4 h-4 text-green-600'} />
                  </div>
                  <div>
                    <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Active Categories</div>
                    <div className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      {categories.filter(cat => cat.is_active).length}
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-3 transition-colors duration-200`}>
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded ${isDarkMode ? 'bg-gray-700' : 'bg-purple-50'}`}>
                    <BarChart3 className={isDarkMode ? 'w-4 h-4 text-purple-400' : 'w-4 h-4 text-purple-600'} />
                  </div>
                  <div>
                    <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Recent Updates</div>
                    <div className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      {categories.filter(cat => {
                        const daysSinceUpdate = Math.floor((Date.now() - new Date(cat.updated_at).getTime()) / (1000 * 60 * 60 * 24));
                        return daysSinceUpdate <= 7;
                      }).length}
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-3 transition-colors duration-200`}>
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded ${isDarkMode ? 'bg-gray-700' : 'bg-orange-50'}`}>
                    <Users className={isDarkMode ? 'w-4 h-4 text-orange-400' : 'w-4 h-4 text-orange-600'} />
                  </div>
                  <div>
                    <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Contributors</div>
                    <div className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      {new Set(categories.map(cat => cat.created_by)).size}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-3 transition-colors duration-200`}>
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded ${isDarkMode ? 'bg-gray-700' : 'bg-yellow-50'}`}>
                    <Folder className={isDarkMode ? 'w-4 h-4 text-yellow-400' : 'w-4 h-4 text-yellow-600'} />
                  </div>
                  <div>
                    <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Folders</div>
                    <div className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{folders.length}</div>
                  </div>
                </div>
              </div>

              <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-3 transition-colors duration-200`}>
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded ${isDarkMode ? 'bg-gray-700' : 'bg-blue-50'}`}>
                    <FileText className={isDarkMode ? 'w-4 h-4 text-blue-400' : 'w-4 h-4 text-blue-600'} />
                  </div>
                  <div>
                    <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Files</div>
                    <div className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{files.length}</div>
                  </div>
                </div>
              </div>

              <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-3 transition-colors duration-200`}>
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded ${isDarkMode ? 'bg-gray-700' : 'bg-green-50'}`}>
                    <BarChart3 className={isDarkMode ? 'w-4 h-4 text-green-400' : 'w-4 h-4 text-green-600'} />
                  </div>
                  <div>
                    <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Total Size</div>
                    <div className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      {files.length > 0 ? 
                        (() => {
                          const totalBytes = files.reduce((sum, file) => sum + file.file_size, 0);
                          if (totalBytes === 0) return '0 B';
                          const k = 1024;
                          const sizes = ['B', 'KB', 'MB', 'GB'];
                          const i = Math.floor(Math.log(totalBytes) / Math.log(k));
                          return parseFloat((totalBytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
                        })()
                        : '0 B'
                      }
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-3 transition-colors duration-200`}>
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded ${isDarkMode ? 'bg-gray-700' : 'bg-red-50'}`}>
                    <Star className={isDarkMode ? 'w-4 h-4 text-red-400' : 'w-4 h-4 text-red-600'} />
                  </div>
                  <div>
                    <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Starred Files</div>
                    <div className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      {files.filter(file => file.is_starred).length}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Content Area */}
        <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border overflow-hidden transition-colors duration-200`}>
          {currentView === 'categories' ? (
            viewMode === 'grid' ? (
              <div className={`p-6 ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {(filteredData() as Category[]).map((category) => {
                    const Icon = getIconComponent(category.icon);
                    const colorClasses = getColorClasses(category.color);
                    return (
                      <div
                        key={category.id}
                        className={`group border rounded-xl p-6 hover:shadow-md transition-all duration-200 ${isDarkMode ? 'bg-gray-700 border-gray-600 hover:border-gray-500' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div 
                            className={`p-3 ${colorClasses.bg} rounded-lg cursor-pointer`}
                            onDoubleClick={() => handleCategoryDoubleClick(category)}
                          >
                            <Icon className={`w-6 h-6 ${colorClasses.text}`} />
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openModal('edit', 'category', category)}
                              className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                            >
                              <Edit3 className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-blue-400' : 'text-gray-400 hover:text-blue-600'}`} />
                            </button>
                            <button
                              onClick={() => openModal('delete', 'category', category)}
                              className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                            >
                              <Trash2 className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`} />
                            </button>
                          </div>
                        </div>

                        <h3 
                          className={`font-semibold mb-2 group-hover:text-blue-600 transition-colors cursor-pointer ${isDarkMode ? 'text-white' : 'text-gray-900'}`}
                          onDoubleClick={() => handleCategoryDoubleClick(category)}
                        >
                          {category.name}
                        </h3>
                        
                        <p className={`text-sm mb-4 line-clamp-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {category.description}
                        </p>

                        <div className={`text-sm mb-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {formatDate(category.updated_at)}
                        </div>

                        <div className={`pt-3 border-t ${isDarkMode ? 'border-gray-600' : 'border-gray-100'}`}>
                          <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            Created by <span className="font-medium">{category.created_by_name || 'Unknown'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className={`${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'} border-b transition-colors duration-200`}>
                    <tr>
                      <th className={`text-left p-4 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Category</th>
                      <th className={`text-left p-4 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Description</th>
                      <th className={`text-left p-4 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Last Updated</th>
                      <th className={`text-left p-4 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Created By</th>
                      <th className="w-12 p-4"></th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-gray-700' : 'divide-gray-100'}`}>
                    {(filteredData() as Category[]).map((category) => {
                      const Icon = getIconComponent(category.icon);
                      const colorClasses = getColorClasses(category.color);
                      return (
                        <tr key={category.id} className={`transition-colors ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}>
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div 
                                className={`p-2 ${colorClasses.bg} rounded-lg cursor-pointer`}
                                onDoubleClick={() => handleCategoryDoubleClick(category)}
                              >
                                <Icon className={`w-5 h-5 ${colorClasses.text}`} />
                              </div>
                              <div 
                                className={`font-medium cursor-pointer ${isDarkMode ? 'text-white hover:text-blue-400' : 'text-gray-900 hover:text-blue-600'}`}
                                onDoubleClick={() => handleCategoryDoubleClick(category)}
                              >
                                {category.name}
                              </div>
                            </div>
                          </td>
                          <td className={`p-4 text-sm max-w-xs truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {category.description}
                          </td>
                          <td className={`p-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {formatDate(category.updated_at)}
                          </td>
                          <td className={`p-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {category.created_by_name || 'Unknown'}
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openModal('edit', 'category', category)}
                                className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                              >
                                <Edit3 className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-blue-400' : 'text-gray-400 hover:text-blue-600'}`} />
                              </button>
                              <button
                                onClick={() => openModal('delete', 'category', category)}
                                className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                              >
                                <Trash2 className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            viewMode === 'grid' ? (
              <div className={`p-6 ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {/* Folders */}
                  {(filteredData() as any).folders?.map((folder: Folder) => (
                    <div
                      key={`folder-${folder.id}`}
                      className={`group border rounded-xl p-6 hover:shadow-md transition-all duration-200 ${isDarkMode ? 'bg-gray-700 border-gray-600 hover:border-gray-500' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div 
                          className={`p-3 rounded-lg cursor-pointer ${isDarkMode ? 'bg-gray-600' : 'bg-yellow-50'}`}
                          onDoubleClick={() => handleFolderDoubleClick(folder)}
                        >
                          <Folder className={isDarkMode ? 'w-6 h-6 text-yellow-400' : 'w-6 h-6 text-yellow-600'} />
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openModal('edit', 'folder', folder)}
                            className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                          >
                            <Edit3 className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-blue-400' : 'text-gray-400 hover:text-blue-600'}`} />
                          </button>
                          <button
                            onClick={() => openModal('delete', 'folder', folder)}
                            className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                          >
                            <Trash2 className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`} />
                          </button>
                        </div>
                      </div>

                      <h3 
                        className={`font-semibold mb-2 group-hover:text-blue-600 transition-colors cursor-pointer ${isDarkMode ? 'text-white' : 'text-gray-900'}`}
                        onDoubleClick={() => handleFolderDoubleClick(folder)}
                      >
                        {folder.name}
                      </h3>
                      
                      <p className={`text-sm mb-4 line-clamp-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {folder.description}
                      </p>

                      <div className={`text-sm mb-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {formatDate(folder.created_at)}
                      </div>

                      <div className={`pt-3 border-t ${isDarkMode ? 'border-gray-600' : 'border-gray-100'}`}>
                        <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          Created by <span className="font-medium">{folder.created_by_name || 'Unknown'}</span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Files */}
                  {(filteredData() as any).files?.map((file: FileItem) => (
                    <div
                      key={`file-${file.id}`}
                      className={`group border rounded-xl p-6 hover:shadow-md transition-all duration-200 cursor-pointer ${isDarkMode ? 'bg-gray-700 border-gray-600 hover:border-gray-500' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                      onClick={() => handleViewFile(file)}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className={`p-3 rounded-lg ${isDarkMode ? 'bg-gray-600' : 'bg-blue-50'}`}>
                          {getFileTypeIcon(file.file_type)}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {(isPDFFile(file.file_type) || isImageFile(file.file_type)) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePreviewFile(file);
                              }}
                              className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                              title="Preview"
                            >
                              <Eye className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-blue-400' : 'text-gray-400 hover:text-blue-600'}`} />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFileForShares(file);
                              setShowShareModal(true);
                            }}
                            className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                            title="Share"
                          >
                            <Share2 className="w-4 h-4 text-blue-500" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadFile(file);
                            }}
                            className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                            title="Download"
                          >
                            <Download className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-green-400' : 'text-gray-400 hover:text-green-600'}`} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openModal('delete', 'file', file);
                            }}
                            className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                            title="Delete"
                          >
                            <Trash2 className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`} />
                          </button>
                        </div>
                      </div>

                      <h3 className={`font-semibold mb-2 truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {file.name}
                      </h3>
                      
                      <p className={`text-sm mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {file.formatted_size} • {file.file_type.toUpperCase()}
                      </p>

                      <div className={`text-sm mb-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {formatDate(file.created_at)}
                      </div>

                      <div className={`pt-3 border-t ${isDarkMode ? 'border-gray-600' : 'border-gray-100'}`}>
                        <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          Created by <span className="font-medium">{file.created_by_name || 'Unknown'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className={`${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'} border-b transition-colors duration-200`}>
                    <tr>
                      <th className={`text-left p-4 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Name</th>
                      <th className={`text-left p-4 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Type</th>
                      <th className={`text-left p-4 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Size</th>
                      <th className={`text-left p-4 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Created</th>
                      <th className={`text-left p-4 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Created By</th>
                      <th className="w-12 p-4"></th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-gray-700' : 'divide-gray-100'}`}>
                    {/* Folders */}
                    {(filteredData() as any).folders?.map((folder: Folder) => (
                      <tr key={`folder-${folder.id}`} className={`transition-colors ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div 
                              className={`p-2 rounded-lg cursor-pointer ${isDarkMode ? 'bg-gray-600' : 'bg-yellow-50'}`}
                              onDoubleClick={() => handleFolderDoubleClick(folder)}
                            >
                              <Folder className={isDarkMode ? 'w-5 h-5 text-yellow-400' : 'w-5 h-5 text-yellow-600'} />
                            </div>
                            <div 
                              className={`font-medium cursor-pointer ${isDarkMode ? 'text-white hover:text-blue-400' : 'text-gray-900 hover:text-blue-600'}`}
                              onDoubleClick={() => handleFolderDoubleClick(folder)}
                            >
                              {folder.name}
                            </div>
                          </div>
                        </td>
                        <td className={`p-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Folder</td>
                        <td className={`p-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>—</td>
                        <td className={`p-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {formatDate(folder.created_at)}
                        </td>
                        <td className={`p-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {folder.created_by_name || 'Unknown'}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openModal('edit', 'folder', folder)}
                              className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                            >
                              <Edit3 className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-blue-400' : 'text-gray-400 hover:text-blue-600'}`} />
                            </button>
                            <button
                              onClick={() => openModal('delete', 'folder', folder)}
                              className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                            >
                              <Trash2 className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {/* Files */}
                    {(filteredData() as any).files?.map((file: FileItem) => (
                      <tr 
                        key={`file-${file.id}`} 
                        className={`transition-colors cursor-pointer ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}
                        onClick={() => handleViewFile(file)}
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-gray-600' : 'bg-blue-50'}`}>
                              {getFileTypeIcon(file.file_type)}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className={`font-medium truncate max-w-xs ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                                {file.name}
                              </div>
                              {file.is_starred && (
                                <Star className="w-4 h-4 text-yellow-600 fill-current" />
                              )}
                            </div>
                          </div>
                        </td>
                        <td className={`p-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{file.file_type.toUpperCase()}</td>
                        <td className={`p-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{file.formatted_size}</td>
                        <td className={`p-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {formatDate(file.created_at)}
                        </td>
                        <td className={`p-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {file.created_by_name || 'Unknown'}
                        </td>
                        <td className="p-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {(isPDFFile(file.file_type) || isImageFile(file.file_type)) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePreviewFile(file);
                                }}
                                className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                title="Preview"
                              >
                                <Eye className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-blue-400' : 'text-gray-400 hover:text-blue-600'}`} />
                              </button>
                            )}
                            
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStarFile(file);
                              }}
                              className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                              title={file.is_starred ? 'Unstar' : 'Star'}
                            >
                              {file.is_starred ? (
                                <Star className="w-4 h-4 text-yellow-600 fill-current" />
                              ) : (
                                <StarOff className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-yellow-400' : 'text-gray-400 hover:text-yellow-600'}`} />
                              )}
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedFileForShares(file);
                                setShowShareModal(true);
                              }}
                              className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                              title="Share"
                            >
                              <Share2 className="w-4 h-4 text-blue-500" />
                            </button>
                            
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadFile(file);
                              }}
                              className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                              title="Download"
                            >
                              <Download className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-green-400' : 'text-gray-400 hover:text-green-600'}`} />
                            </button>
                            
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openModal('delete', 'file', file);
                              }}
                              className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                              title="Delete"
                            >
                              <Trash2 className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

        {/* Empty State */}
        {((currentView === 'categories' && (filteredData() as Category[]).length === 0) ||
          (currentView === 'files-folders' && 
          ((filteredData() as any).folders?.length === 0 && (filteredData() as any).files?.length === 0))) && !loading && (
          <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-12 text-center mt-6 transition-colors duration-200`}>
            {currentView === 'categories' ? (
              <>
                <FolderOpen className={`w-12 h-12 mx-auto mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                <h3 className={`text-lg font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>No categories found</h3>
                <p className={`mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {searchQuery ? 'Try adjusting your search terms.' : 'Create your first category to organize your files.'}
                </p>
                <button
                  onClick={() => openModal('add', 'category')}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors mx-auto"
                >
                  <Plus className="w-4 h-4" />
                  Add Category
                </button>
              </>
            ) : (
              <>
                <FileText className={`w-12 h-12 mx-auto mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                <h3 className={`text-lg font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>No files or folders found</h3>
                <p className={`mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {searchQuery ? 'Try adjusting your search terms.' : 'Create folders or upload files to get started.'}
                </p>
                <div className="flex items-center gap-3 justify-center">
                  <button
                    onClick={() => openModal('add', 'folder')}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Folder className="w-4 h-4" />
                    New Folder
                  </button>
                  <button
                    onClick={() => openModal('add', 'file')}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Upload Files
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto transition-colors duration-200`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {modalMode === 'add' && modalType === 'category' && 'Add New Category'}
                  {modalMode === 'edit' && modalType === 'category' && 'Edit Category'}
                  {modalMode === 'delete' && modalType === 'category' && 'Delete Category'}
                  {modalMode === 'add' && modalType === 'folder' && 'Create New Folder'}
                  {modalMode === 'edit' && modalType === 'folder' && 'Edit Folder'}
                  {modalMode === 'delete' && modalType === 'folder' && 'Delete Folder'}
                  {modalMode === 'add' && modalType === 'file' && 'Upload Files'}
                  {modalMode === 'delete' && modalType === 'file' && 'Delete File'}
                </h3>
                <button
                  onClick={closeModal}
                  className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                >
                  <X className={`w-5 h-5 ${isDarkMode ? 'text-white' : 'text-black'}`} />
                </button>
              </div>

              {error && (
                <div className={`mb-4 p-3 border rounded-lg flex items-center gap-2 ${isDarkMode ? 'bg-red-900 border-red-700' : 'bg-red-50 border-red-200'}`}>
                  <AlertCircle className={`w-5 h-5 flex-shrink-0 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`} />
                  <span className={`text-sm ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>{error}</span>
                </div>
              )}

              {modalMode === 'delete' ? (
                <div>
                  <p className={`mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Are you sure you want to delete "{selectedItem?.name}"? This action cannot be undone.
                  </p>
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={closeModal}
                      disabled={submitting}
                      className={`px-4 py-2 rounded-lg transition-colors disabled:opacity-50 ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={submitting}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {submitting && <Loader className="w-4 h-4 animate-spin" />}
                      Delete
                    </button>
                  </div>
                </div>
              ) : modalType === 'file' && modalMode === 'add' ? (
                <div>
                  <div className="space-y-4">
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Upload Mode
                      </label>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="uploadMode"
                            value="single"
                            checked={uploadMode === 'single'}
                            onChange={(e) => setUploadMode(e.target.value as any)}
                            className="text-blue-600"
                          />
                          <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Single File</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="uploadMode"
                            value="multiple"
                            checked={uploadMode === 'multiple'}
                            onChange={(e) => setUploadMode(e.target.value as any)}
                            className="text-blue-600"
                          />
                          <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Multiple Files</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="uploadMode"
                            value="bulk"
                            checked={uploadMode === 'bulk'}
                            onChange={(e) => setUploadMode(e.target.value as any)}
                            className="text-blue-600"
                          />
                          <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Bulk Upload</span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Select Files
                      </label>
                      <div 
                        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                          dragOver 
                            ? isDarkMode ? 'border-blue-500 bg-blue-900' : 'border-blue-500 bg-blue-50'
                            : isDarkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'
                        }`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <Upload className={`w-12 h-12 mx-auto mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                        <div className="mb-4">
                          <p className={`text-lg font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                            {uploadMode === 'single' ? 'Drop a file here' : 'Drop files here'}
                          </p>
                          <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            or click to browse
                          </p>
                        </div>
                        <input
                          type="file"
                          multiple={uploadMode !== 'single'}
                          ref={fileInputRef}
                          onChange={handleFileInputChange}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          Choose Files
                        </button>
                      </div>

                      {uploadFiles.length > 0 && (
                        <div className="mt-4">
                          <div className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            Selected Files ({uploadFiles.length})
                          </div>
                          <div className={`max-h-40 overflow-y-auto border rounded-lg ${isDarkMode ? 'border-gray-600 bg-gray-700' : 'border-gray-200 bg-gray-50'}`}>
                            {uploadFiles.map((file, index) => (
                              <div key={index} className={`flex items-center justify-between p-3 border-b ${isDarkMode ? 'border-gray-600' : 'border-gray-100'} last:border-b-0`}>
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <div className={`p-1 rounded ${isDarkMode ? 'bg-gray-600' : 'bg-blue-50'}`}>
                                    <File className={`w-4 h-4 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className={`text-sm font-medium truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                                      {file.name}
                                    </div>
                                    <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                      {(file.size / 1024 / 1024).toFixed(2)} MB
                                    </div>
                                  </div>
                                </div>
                                <button
                                  onClick={() => removeFile(index)}
                                  className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                  disabled={submitting}
                                >
                                  <X className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 justify-end mt-6">
                    <button
                      onClick={closeModal}
                      disabled={submitting}
                      className={`px-4 py-2 rounded-lg transition-colors disabled:opacity-50 ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleFileUpload}
                      disabled={submitting || uploadFiles.length === 0 || !currentCategoryId}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {submitting && <Loader className="w-4 h-4 animate-spin" />}
                      Upload
                    </button>
                  </div>
                </div>
              ) : modalType === 'category' ? (
                <div>
                  <div className="space-y-4">
                    <div>
                      <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Name *
                      </label>
                      <input
                        type="text"
                        value={categoryForm.name}
                        onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                        placeholder="Enter category name"
                      />
                    </div>

                    <div>
                      <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Description
                      </label>
                      <textarea
                        value={categoryForm.description}
                        onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                        placeholder="Enter category description"
                        rows={3}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          Color
                        </label>
                        <div className="grid grid-cols-5 gap-2">
                          {[
                            { hex: '#007bff', name: 'Blue' },
                            { hex: '#28a745', name: 'Green' },
                            { hex: '#dc3545', name: 'Red' },
                            { hex: '#ffc107', name: 'Yellow' },
                            { hex: '#6f42c1', name: 'Purple' },
                            { hex: '#fd7e14', name: 'Orange' },
                            { hex: '#20c997', name: 'Teal' },
                            { hex: '#e83e8c', name: 'Pink' },
                            { hex: '#6c757d', name: 'Gray' }
                          ].map((color) => (
                            <button
                              key={color.hex}
                              type="button"
                              onClick={() => setCategoryForm({ ...categoryForm, color: color.hex })}
                              className={`h-10 rounded-lg border-2 transition-all ${
                                categoryForm.color === color.hex 
                                  ? 'border-gray-900 ring-2 ring-gray-900 ring-offset-2' 
                                  : isDarkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'
                              }`}
                              style={{ backgroundColor: color.hex }}
                              title={color.name}
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          Icon
                        </label>
                        <select
                          value={categoryForm.icon}
                          onChange={(e) => setCategoryForm({ ...categoryForm, icon: e.target.value })}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                        >
                          {Object.keys(iconOptions).map(iconName => (
                            <option key={iconName} value={iconName}>
                              {iconName}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 justify-end mt-6">
                    <button
                      onClick={closeModal}
                      disabled={submitting}
                      className={`px-4 py-2 rounded-lg transition-colors disabled:opacity-50 ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {submitting && <Loader className="w-4 h-4 animate-spin" />}
                      {modalMode === 'add' ? 'Create' : 'Update'}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="space-y-4">
                    <div>
                      <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Folder Name *
                      </label>
                      <input
                        type="text"
                        value={folderForm.name}
                        onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value })}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                        placeholder="Enter folder name"
                      />
                    </div>

                    <div>
                      <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Description
                      </label>
                      <textarea
                        value={folderForm.description}
                        onChange={(e) => setFolderForm({ ...folderForm, description: e.target.value })}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                        placeholder="Enter folder description"
                        rows={3}
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 justify-end mt-6">
                    <button
                      onClick={closeModal}
                      disabled={submitting}
                      className={`px-4 py-2 rounded-lg transition-colors disabled:opacity-50 ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {submitting && <Loader className="w-4 h-4 animate-spin" />}
                      {modalMode === 'add' ? 'Create' : 'Update'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Share Modal */}
        {showShareModal && selectedFileForShares && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto transition-colors duration-200`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Share: {selectedFileForShares.name}</h3>
                <button onClick={() => {
                  setShowShareModal(false);
                  setSelectedUsers([]);
                  setShareMessage('');
                  setUserSearchQuery('');
                  setSelectedFileForShares(null);
                }} className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
                  <X className={`w-5 h-5 ${isDarkMode ? 'text-white' : 'text-black'}`} />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-900'}`}>Share with</label>
                  <div className="relative">
                    <div className={`min-h-[42px] w-full px-3 py-2 border rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`}>
                      <div className="flex flex-wrap gap-2 items-center">
                        {selectedUsers.map((user) => (
                          <div key={user.id} className="flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm">
                            <User className="w-3 h-3" />
                            <span>{user.name}</span>
                            <button onClick={() => removeUser(user.id!)} className="hover:bg-blue-200 rounded-full p-0.5">
                              <X className={`w-3 h-3 ${isDarkMode ? 'text-white' : 'text-black'}`} />
                            </button>
                          </div>
                        ))}
                        <input
                          type="text"
                          value={userSearchQuery}
                          onChange={(e) => setUserSearchQuery(e.target.value)}
                          onKeyDown={handleSearchKeyDown}
                          placeholder={selectedUsers.length === 0 ? "Search users..." : ""}
                          className={`flex-1 min-w-[200px] outline-none bg-transparent ${isDarkMode ? 'text-white' : 'text-gray-900'}`}
                        />
                      </div>
                    </div>
                    
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
                            <div className="flex-1">
                              <div className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{user.name}</div>
                              <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{user.email}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-900'}`}>Message (optional)</label>
                  <textarea
                    value={shareMessage}
                    onChange={(e) => setShareMessage(e.target.value)}
                    placeholder="Add a message..."
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                    rows={3}
                  />
                </div>
                
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      setShowShareModal(false);
                      setSelectedUsers([]);
                      setShareMessage('');
                      setUserSearchQuery('');
                      setSelectedFileForShares(null);
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
                    Outlook
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
                        Share
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* File Viewer Modal */}
        {showFileViewer && viewingFile && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col transition-colors duration-200`}>
              {/* Header */}
              <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-blue-50'}`}>
                    {getFileTypeIcon(viewingFile.file_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`text-lg font-semibold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      {viewingFile.name}
                    </h3>
                    <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {viewingFile.formatted_size} • {viewingFile.file_type.toUpperCase()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(isPDFFile(viewingFile.file_type) || isImageFile(viewingFile.file_type)) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePreviewFile(viewingFile);
                      }}
                      className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                      title="Open in new tab"
                    >
                      <Eye className={`w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                    </button>
                  )}
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStarFile(viewingFile);
                    }}
                    className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                    title={viewingFile.is_starred ? 'Unstar' : 'Star'}
                  >
                    {viewingFile.is_starred ? (
                      <Star className="w-5 h-5 text-yellow-600 fill-current" />
                    ) : (
                      <StarOff className={`w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                    )}
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFileForShares(viewingFile);
                      setShowShareModal(true);
                    }}
                    className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                    title="Share"
                  >
                    <Share2 className="w-5 h-5 text-blue-600" />
                  </button>
                  
                  <button
                    onClick={() => handleDownloadFile(viewingFile)}
                    className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                    title="Download"
                  >
                    <Download className={`w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                  </button>
                  
                  <button
                    onClick={closeFileViewer}
                    className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                    title="Close"
                  >
                    <X className={`w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className={`flex-1 overflow-auto ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'} p-6`}>
                {isImageFile(viewingFile.file_type) ? (
                  <div className="flex items-center justify-center h-full">
                    <img 
                      src={`http://localhost:3002/api/files/${viewingFile.id}/download?user_id=${CURRENT_USER_ID}&preview=true`}
                      alt={viewingFile.name}
                      className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                    />
                  </div>
                ) : isPDFFile(viewingFile.file_type) ? (
                  <div className="h-full">
                    <iframe
                      src={`http://localhost:3002/api/files/${viewingFile.id}/download?user_id=${CURRENT_USER_ID}&preview=true`}
                      className="w-full h-full rounded-lg shadow-lg"
                      title={viewingFile.name}
                    />
                  </div>
                ) : isVideoFile(viewingFile.file_type) ? (
                  <div className="flex items-center justify-center h-full">
                    <video 
                      controls
                      className="max-w-full max-h-full rounded-lg shadow-lg"
                      src={`http://localhost:3002/api/files/${viewingFile.id}/download?user_id=${CURRENT_USER_ID}&preview=true`}
                    >
                      Your browser does not support the video tag.
                    </video>
                  </div>
                ) : isAudioFile(viewingFile.file_type) ? (
                  <div className="flex items-center justify-center h-full">
                    <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-lg p-8 max-w-md w-full`}>
                      <audio 
                        controls
                        className="w-full"
                        src={`http://localhost:3002/api/files/${viewingFile.id}/download?user_id=${CURRENT_USER_ID}&preview=true`}
                      >
                        Your browser does not support the audio tag.
                      </audio>
                    </div>
                  </div>
                ) : isTextFile(viewingFile.file_type) ? (
                  <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-lg p-6 h-full overflow-auto`}>
                    <iframe
                      src={`http://localhost:3002/api/files/${viewingFile.id}/download?user_id=${CURRENT_USER_ID}&preview=true`}
                      className="w-full h-full border-0"
                      title={viewingFile.name}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className={`p-6 ${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-full mx-auto mb-4 w-20 h-20 flex items-center justify-center`}>
                        <File className={`w-10 h-10 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                      </div>
                      <h4 className={`text-lg font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Preview not available</h4>
                      <p className={`mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        This file type cannot be previewed.
                      </p>
                      <button
                        onClick={() => handleDownloadFile(viewingFile)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className={`border-t ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'} p-4`}>
                <div className={`flex items-center justify-between text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <div className="flex items-center gap-6">
                    <div><span className="font-medium">By:</span> {viewingFile.created_by_name || 'Unknown'}</div>
                    <div><span className="font-medium">Downloads:</span> {viewingFile.download_count}</div>
                  </div>
                  <button
                    onClick={() => {
                      closeFileViewer();
                      openModal('delete', 'file', viewingFile);
                    }}
                    className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileManagement;