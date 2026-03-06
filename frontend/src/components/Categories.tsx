import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Plus, FolderOpen, FileText, Users, BookOpen, ClipboardList,
  BarChart3, Shield, Briefcase, GraduationCap, Heart, Settings, Edit3,
  Trash2, Grid3X3, List, X, AlertCircle, Loader, ArrowLeft, Folder,
  Upload, Download, Star, StarOff, ChevronRight, Home, File, CheckCircle,
  Eye, Share2, Mail, Send, User, Info
} from 'lucide-react';
import { useDarkMode } from '../contexts/DarkModeContext';
import { useAuth, CategoryPermissions } from '../contexts/AuthContext';

// ============================================================
// ICON / TYPE MAPS
// ============================================================

const iconOptions = {
  BookOpen, ClipboardList, BarChart3, Settings, Shield, Briefcase,
  GraduationCap, Users, Heart, FolderOpen, FileText
};

// ============================================================
// INTERFACES
// ============================================================

interface Category {
  id: number; name: string; description: string; color: string; icon: string;
  is_active: boolean; created_by: number; created_by_name?: string;
  updated_by?: number; updated_by_name?: string; created_at: string; updated_at: string;
}

interface Folder {
  id: number; name: string; description: string; category_id: number; category_name?: string;
  parent_folder_id?: number; path: string; is_active: boolean; created_by: number;
  created_by_name?: string; updated_by?: number; updated_by_name?: string; created_at: string; updated_at: string;
}

interface FileItem {
  id: number; name: string; original_name: string; file_type: string; file_size: number;
  formatted_size: string; mime_type: string; file_path: string; category_id: number;
  category_name?: string; folder_id?: number; folder_name?: string; is_starred: boolean;
  is_active: boolean; download_count: number; last_accessed: string; created_by: number;
  created_by_name?: string; updated_by?: number; updated_by_name?: string; created_at: string; updated_at: string;
}

interface User {
  id?: string | number; name: string; user_name: string; email: string; department?: string; role: string;
}

interface FileManagementProps { currentUser: User; }

type ViewType = 'categories' | 'files-folders';
type ItemType = 'category' | 'folder' | 'file';

interface BreadcrumbItem { id: number | null; name: string; type: 'category' | 'folder'; }

interface UploadProgress { fileName: string; progress: number; status: 'uploading' | 'completed' | 'error'; error?: string; }

// ============================================================
// MAIN COMPONENT
// ============================================================

const FileManagement: React.FC<FileManagementProps> = ({ currentUser }) => {
  const { isDarkMode } = useDarkMode();
  const { hasPermission } = useAuth();

  const [viewMode, setViewMode]       = useState<'grid' | 'list'>('grid');
  const [currentView, setCurrentView] = useState<ViewType>('categories');
  const [searchQuery, setSearchQuery] = useState('');

  // Banner state
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  // Data
  const [categories, setCategories] = useState<Category[]>([]);
  const [folders, setFolders]       = useState<Folder[]>([]);
  const [files, setFiles]           = useState<FileItem[]>([]);

  // Navigation
  const [currentCategoryId, setCurrentCategoryId] = useState<number | null>(null);
  const [currentFolderId, setCurrentFolderId]     = useState<number | null>(null);
  const [breadcrumb, setBreadcrumb]               = useState<BreadcrumbItem[]>([]);

  // UI
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [modalMode, setModalMode]   = useState<'add' | 'edit' | 'delete'>('add');
  const [modalType, setModalType]   = useState<ItemType>('category');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalError, setModalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // File viewer
  const [showFileViewer, setShowFileViewer] = useState(false);
  const [viewingFile, setViewingFile]       = useState<FileItem | null>(null);

  // Share
  const [showShareModal, setShowShareModal]               = useState(false);
  const [selectedFileForShares, setSelectedFileForShares] = useState<FileItem | null>(null);
  const [showManageSharesModal, setShowManageSharesModal] = useState(false);
  const [currentFileShares, setCurrentFileShares]         = useState<any[]>([]);
  const [loadingShares, setLoadingShares]                 = useState(false);
  const [userSearchQuery, setUserSearchQuery]             = useState('');
  const [filteredUsers, setFilteredUsers]                 = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers]                 = useState<User[]>([]);
  const [showUserDropdown, setShowUserDropdown]           = useState(false);
  const [availableUsers, setAvailableUsers]               = useState<User[]>([]);
  const [shareMessage, setShareMessage]                   = useState('');
  const [isSharing, setIsSharing]                         = useState(false);

  // Rename
  const [renameMode, setRenameMode]     = useState(false);
  const [renameFileId, setRenameFileId] = useState<number | null>(null);
  const [newFileName, setNewFileName]   = useState('');

  // Forms
  const [categoryForm, setCategoryForm] = useState({
    name: '', description: '', color: '#007bff', icon: 'FolderOpen', is_active: true
  });
  const [folderForm, setFolderForm] = useState({
    name: '', description: '', category_id: 0, parent_folder_id: null as number | null
  });

  // Upload
  const [uploadFiles, setUploadFiles]       = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [uploadMode, setUploadMode]         = useState<'single' | 'multiple' | 'bulk'>('multiple');
  const [dragOver, setDragOver]             = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const CURRENT_USER_ID = currentUser?.id ? currentUser.id.toString() : '1';

  const MAX_FILE_SIZE   = 50  * 1024 * 1024;
  const MAX_TOTAL_SIZE  = 200 * 1024 * 1024;
  const ALLOWED_FILE_TYPES = [
    'pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','rtf','odt',
    'jpg','jpeg','png','gif','bmp','webp','svg','ico',
    'mp4','avi','mov','wmv','flv','webm','mkv','m4v',
    'mp3','wav','ogg','m4a','flac','aac','wma',
    'zip','rar','7z','tar','gz',
    'js','jsx','ts','tsx','html','css','json','xml','py','java','c','cpp','cs','php','rb','go','swift',
    'md','log','yaml','yml','sql'
  ];

  const isFileOwner = (file: FileItem, uid: string) => String(file.created_by) === String(uid);

  // ── Auto-hide banners ──────────────────────────────────────────────────────
  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(null), 3000); return () => clearTimeout(t); }
  }, [success]);

  useEffect(() => {
    if (error) { const t = setTimeout(() => setError(null), 5000); return () => clearTimeout(t); }
  }, [error]);

  // ============================================================
  // EFFECTS
  // ============================================================

  useEffect(() => {
    if (currentView === 'categories') fetchCategories();
    else fetchFilesAndFolders();
  }, [currentView, currentCategoryId, currentFolderId]);

  useEffect(() => {
    if (showShareModal) fetchUsers();
  }, [showShareModal]);

  useEffect(() => {
    if (userSearchQuery.trim()) {
      const filtered = availableUsers
        .filter(u =>
          u.name.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
          u.email.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
          u.user_name.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
          u.department?.toLowerCase().includes(userSearchQuery.toLowerCase())
        )
        .filter(u => !selectedUsers.find(s => s.id === u.id));
      setFilteredUsers(filtered);
      setShowUserDropdown(filtered.length > 0);
    } else {
      setFilteredUsers([]);
      setShowUserDropdown(false);
    }
  }, [userSearchQuery, selectedUsers, availableUsers]);

  // ============================================================
  // FETCH
  // ============================================================

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:3002/api/categories');
      if (!res.ok) throw new Error('Failed to fetch categories');
      const data = await res.json();
      setCategories(data.categories || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const fetchFilesAndFolders = async () => {
    try {
      setLoading(true);
      let folderUrl = 'http://localhost:3002/api/folders';
      const fp = new URLSearchParams();
      if (currentCategoryId) fp.append('category_id', currentCategoryId.toString());
      fp.append('parent_folder_id', currentFolderId === null ? 'null' : currentFolderId.toString());
      if (fp.toString()) folderUrl += `?${fp}`;

      let fileUrl = 'http://localhost:3002/api/files';
      const fip = new URLSearchParams();
      if (currentCategoryId) fip.append('category_id', currentCategoryId.toString());
      fip.append('folder_id', currentFolderId === null ? 'null' : currentFolderId.toString());
      if (fip.toString()) fileUrl += `?${fip}`;

      const [folderRes, fileRes] = await Promise.all([fetch(folderUrl), fetch(fileUrl)]);
      if (!folderRes.ok || !fileRes.ok) throw new Error('Failed to fetch data');

      const folderData = await folderRes.json();
      const fileData   = await fileRes.json();

      const token = localStorage.getItem('token');
      let starredIds = new Set<number>();
      try {
        const starredRes = await fetch(
          `http://localhost:3002/api/starred-files?user_id=${CURRENT_USER_ID}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (starredRes.ok) {
          const starredData = await starredRes.json();
          starredIds = new Set((starredData.starredFiles || []).map((f: any) => Number(f.id)));
        }
      } catch {}

      setFolders(folderData.folders || []);
      setFiles((fileData.files || []).map((f: FileItem) => ({ ...f, is_starred: starredIds.has(f.id) })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await fetch('http://localhost:3002/api/share/users/all', {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = '/login'; return; }
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch users');
      const data = await res.json();
      setAvailableUsers(data.data || data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users for sharing');
    }
  };

  // ============================================================
  // RENAME
  // ============================================================

  const handleRenameFile = async (file: FileItem) => {
    if (!newFileName.trim()) { setModalError('File name cannot be empty'); return; }
    setSubmitting(true);
    setModalError('');
    try {
      const res = await fetch(`http://localhost:3002/api/files/${file.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFileName, updated_by: CURRENT_USER_ID })
      });
      if (!res.ok) throw new Error((await res.json())?.error || 'Failed to rename file');
      setSuccess(`✅ "${file.name}" renamed to "${newFileName}" successfully!`);
      setRenameMode(false); setRenameFileId(null); setNewFileName('');
      await fetchFilesAndFolders();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to rename file');
      setError(err instanceof Error ? err.message : 'Failed to rename file');
    } finally { setSubmitting(false); }
  };

  const openRenameModal = (file: FileItem) => { setRenameFileId(file.id); setNewFileName(file.name); setRenameMode(true); setModalError(''); };
  const closeRenameModal = () => { setRenameMode(false); setRenameFileId(null); setNewFileName(''); setModalError(''); };

  // ============================================================
  // SHARE
  // ============================================================

  const addUser    = (user: User) => { setSelectedUsers(prev => [...prev, user]); setUserSearchQuery(''); setShowUserDropdown(false); };
  const removeUser = (userId: string | number) => setSelectedUsers(prev => prev.filter(u => u.id !== userId));

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && userSearchQuery === '' && selectedUsers.length > 0)
      removeUser(selectedUsers[selectedUsers.length - 1].id!);
  };

  const handleShare = async (useOutlook = false) => {
    if (selectedUsers.length === 0)    { setError('Please select at least one user to share with'); return; }
    if (!selectedFileForShares)        { setError('No file selected for sharing'); return; }
    if (selectedFileForShares.created_by.toString() !== CURRENT_USER_ID) {
      setError('Only the file owner can share this file');
      return;
    }

    if (useOutlook) {
      const emails  = selectedUsers.map(u => u.email).join(',');
      const subject = encodeURIComponent(`Shared files from ${currentUser.name}`);
      const body    = encodeURIComponent(`${shareMessage || `${currentUser.name} has shared the following file with you:`}\n\nFile: ${selectedFileForShares.name}\n\nPlease check your file sharing system for access.\n\nBest regards,\n${currentUser.name}`);
      window.location.href = `mailto:${emails}?subject=${subject}&body=${body}`;
      setShowShareModal(false); setSelectedUsers([]); setShareMessage(''); setSelectedFileForShares(null); setUserSearchQuery('');
      setSuccess(`📧 Outlook opened — email drafted for ${selectedUsers.length} recipient${selectedUsers.length > 1 ? 's' : ''}!`);
      return;
    }

    setIsSharing(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Authentication token missing');
      const res = await fetch(`http://localhost:3002/api/share/category-files/${selectedFileForShares.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userIds: selectedUsers.map(u => u.id?.toString()) })
      });
      if (!res.ok) throw new Error((await res.json()).error || `Failed to share file (${res.status})`);

      const names = selectedUsers.map(u => u.name).join(', ');
      setSuccess(`✅ "${selectedFileForShares.name}" shared successfully with: ${names}`);
      setShowShareModal(false); setSelectedUsers([]); setShareMessage(''); setSelectedFileForShares(null); setUserSearchQuery('');
    } catch (err) {
      setError('Failed to share file: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally { setIsSharing(false); }
  };

  const loadFileShares = async (fileId: number) => {
    setLoadingShares(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Authentication token missing');
      const res = await fetch(`http://localhost:3002/api/share/category-files/${fileId}/shares`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load shares');
      const data = await res.json();
      setCurrentFileShares(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file shares');
    } finally { setLoadingShares(false); }
  };

  const handleRemoveShare = async (shareId: number) => {
    if (!confirm('Remove access for this user?')) return;
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Authentication token missing');
      const res = await fetch(`http://localhost:3002/api/share/shares/${shareId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to remove share');
      setSuccess('✅ Access removed successfully!');
      if (selectedFileForShares) await loadFileShares(selectedFileForShares.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove access');
    }
  };

  const openManageSharesModal = (file: FileItem) => {
    setSelectedFileForShares(file); setShowManageSharesModal(true); loadFileShares(file.id);
  };

  // ============================================================
  // NAVIGATION
  // ============================================================

  const handleCategoryDoubleClick = (category: Category) => {
    setCurrentCategoryId(category.id); setCurrentFolderId(null);
    setBreadcrumb([{ id: category.id, name: category.name, type: 'category' }]);
    setCurrentView('files-folders');
  };

  const handleFolderDoubleClick = (folder: Folder) => {
    setCurrentFolderId(folder.id);
    setBreadcrumb(prev => [...prev, { id: folder.id, name: folder.name, type: 'folder' }]);
  };

  const handleBreadcrumbClick = (index: number) => {
    const clicked = breadcrumb[index];
    setBreadcrumb(breadcrumb.slice(0, index + 1));
    if (clicked.type === 'category') setCurrentFolderId(null);
    else setCurrentFolderId(clicked.id);
  };

  const handleBackToCategories = () => {
    setCurrentView('categories'); setCurrentCategoryId(null); setCurrentFolderId(null); setBreadcrumb([]);
  };

  // ============================================================
  // MODAL
  // ============================================================

  const openModal = (mode: 'add' | 'edit' | 'delete', type: ItemType, item?: any) => {
    setModalMode(mode); setModalType(type); setSelectedItem(item || null);
    if (mode === 'add') {
      if (type === 'category') setCategoryForm({ name: '', description: '', color: '#007bff', icon: 'FolderOpen', is_active: true });
      else if (type === 'folder') setFolderForm({ name: '', description: '', category_id: currentCategoryId || 0, parent_folder_id: currentFolderId });
      else if (type === 'file') { setUploadFiles([]); setUploadProgress([]); setUploadMode('multiple'); }
    } else if (mode === 'edit' && item) {
      if (type === 'category') setCategoryForm({ name: item.name, description: item.description, color: item.color, icon: item.icon, is_active: item.is_active });
      else if (type === 'folder') setFolderForm({ name: item.name, description: item.description, category_id: item.category_id, parent_folder_id: item.parent_folder_id });
    }
    setShowModal(true); setModalError('');
  };

  const closeModal = () => { setShowModal(false); setSelectedItem(null); setModalError(''); setUploadFiles([]); setUploadProgress([]); };

  const handleSubmit = async () => {
    setSubmitting(true); setModalError('');
    try {
      let response;
      if (modalType === 'category') {
        if (!categoryForm.name.trim()) { setModalError('Category name is required'); return; }
        const dup = categories.find(c => c.name.toLowerCase() === categoryForm.name.trim().toLowerCase() && (modalMode === 'add' || c.id !== selectedItem?.id));
        if (dup) { setModalError(`Category "${categoryForm.name.trim()}" already exists.`); return; }

        if (modalMode === 'add') {
          response = await fetch('http://localhost:3002/api/categories', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...categoryForm, created_by: CURRENT_USER_ID })
          });
        } else {
          response = await fetch(`http://localhost:3002/api/categories/${selectedItem.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...categoryForm, updated_by: CURRENT_USER_ID })
          });
        }
      } else if (modalType === 'folder') {
        if (!folderForm.name.trim()) { setModalError('Folder name is required'); return; }
        const dup = folders.find(f =>
          f.name.toLowerCase() === folderForm.name.trim().toLowerCase() &&
          f.category_id === folderForm.category_id &&
          f.parent_folder_id === folderForm.parent_folder_id &&
          (modalMode === 'add' || f.id !== selectedItem?.id)
        );
        if (dup) { setModalError(`Folder "${folderForm.name.trim()}" already exists here.`); return; }

        if (modalMode === 'add') {
          response = await fetch('http://localhost:3002/api/folders', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...folderForm, created_by: CURRENT_USER_ID })
          });
        } else {
          response = await fetch(`http://localhost:3002/api/folders/${selectedItem.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...folderForm, updated_by: CURRENT_USER_ID })
          });
        }
      }

      if (!response?.ok) throw new Error((await response?.json())?.error || 'Operation failed');

      if (currentView === 'categories') await fetchCategories();
      else await fetchFilesAndFolders();

      if (modalType === 'category') {
        if (modalMode === 'add') setSuccess(`✅ Category "${categoryForm.name}" created successfully!`);
        else setSuccess(`✅ Category "${categoryForm.name}" updated successfully!`);
      } else {
        if (modalMode === 'add') setSuccess(`✅ Folder "${folderForm.name}" created successfully!`);
        else setSuccess(`✅ Folder "${folderForm.name}" updated successfully!`);
      }

      closeModal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Operation failed';
      setModalError(msg);
      setError(msg);
    } finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    setSubmitting(true); setModalError('');
    try {
      const uid = typeof currentUser?.id === 'string' ? parseInt(currentUser.id) : currentUser?.id;
      if (!uid || isNaN(uid as number)) throw new Error('Invalid user ID. Please make sure you are logged in.');
      const payload = { deleted_by: uid, updated_by: uid };

      let response;
      const itemName = selectedItem.name;
      const label = modalType === 'category' ? 'Category' : modalType === 'folder' ? 'Folder' : 'File';

      if (modalType === 'category') {
        response = await fetch(`http://localhost:3002/api/categories/${selectedItem.id}`, {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
      } else if (modalType === 'folder') {
        response = await fetch(`http://localhost:3002/api/categories/folders/${selectedItem.id}`, {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
      } else if (modalType === 'file') {
        response = await fetch(`http://localhost:3002/api/categories/files/${selectedItem.id}`, {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
      }

      if (!response?.ok) throw new Error((await response?.json())?.error || 'Failed to delete');

      if (currentView === 'categories') await fetchCategories();
      else await fetchFilesAndFolders();

      setSuccess(`🗑️ ${label} "${itemName}" deleted successfully!`);
      closeModal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete';
      setModalError(msg);
      setError(msg);
    } finally { setSubmitting(false); }
  };

  // ============================================================
  // FILE UPLOAD
  // ============================================================

  const handleFileUpload = async () => {
    if (uploadFiles.length === 0) { setModalError('Please select files to upload'); return; }
    if (!currentCategoryId)       { setModalError('A category is required for file upload'); return; }

    setSubmitting(true); setModalError('');
    setUploadProgress(uploadFiles.map(f => ({ fileName: f.name, progress: 0, status: 'uploading' })));

    try {
      const formData = new FormData();
      uploadFiles.forEach(f => formData.append('files', f));
      formData.append('category_id', currentCategoryId.toString());
      formData.append('created_by', CURRENT_USER_ID);
      if (currentFolderId) formData.append('folder_id', currentFolderId.toString());

      let response;
      if (uploadMode === 'single') {
        const fd = new FormData();
        fd.append('file', uploadFiles[0]); fd.append('category_id', currentCategoryId.toString()); fd.append('created_by', CURRENT_USER_ID);
        if (currentFolderId) fd.append('folder_id', currentFolderId.toString());
        response = await fetch('http://localhost:3002/api/files/upload-single', { method: 'POST', body: fd });
      } else if (uploadMode === 'bulk') {
        response = await fetch('http://localhost:3002/api/files/bulk-upload', { method: 'POST', body: formData });
      } else {
        response = await fetch('http://localhost:3002/api/files/upload-multiple', { method: 'POST', body: formData });
      }

      if (!response?.ok) throw new Error((await response?.json())?.error || 'Upload failed');

      setUploadProgress(prev => prev.map(i => ({ ...i, progress: 100, status: 'completed' })));
      await fetchFilesAndFolders();

      const count = uploadFiles.length;
      setSuccess(
        count === 1
          ? `✅ "${uploadFiles[0].name}" uploaded successfully!`
          : `✅ ${count} files uploaded successfully!`
      );

      setTimeout(() => closeModal(), 800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setModalError(msg);
      setError(msg);
      setUploadProgress(prev => prev.map(i => ({ ...i, status: 'error', error: msg })));
    } finally { setSubmitting(false); }
  };

  // ============================================================
  // FILE OPS
  // ============================================================

  const handleDownloadFile = async (file: FileItem) => {
    setSuccess(`⏳ Preparing download for "${file.name}"…`);
    try {
      const res = await fetch(`http://localhost:3002/api/files/${file.id}/download?user_id=${CURRENT_USER_ID}`);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = file.original_name; document.body.appendChild(a); a.click();
      window.URL.revokeObjectURL(url); document.body.removeChild(a);
      setSuccess(`📥 "${file.name}" downloaded successfully!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  };

  const handlePreviewFile = async (file: FileItem) => {
    try {
      const w = window.open(`http://localhost:3002/api/files/${file.id}/download?user_id=${CURRENT_USER_ID}&preview=true`, '_blank');
      if (!w) throw new Error('Popup blocked. Please allow popups for this site.');
      setSuccess(`👁️ Opening preview for "${file.name}"…`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    }
  };

  const handleStarFile = async (e: React.MouseEvent, file: FileItem) => {
    e.stopPropagation();
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:3002/api/starred-files/star/${file.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: CURRENT_USER_ID })
      });
      if (!res.ok) throw new Error((await res.json())?.error || 'Failed to update star status');
      const result = await res.json();

      setFiles(prev => prev.map(f => f.id === file.id ? { ...f, is_starred: result.starred } : f));
      if (viewingFile?.id === file.id) setViewingFile({ ...viewingFile, is_starred: result.starred });

      setSuccess(result.starred
        ? `⭐ "${file.name}" added to Starred Files`
        : `"${file.name}" removed from Starred Files`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update star status');
    }
  };

  const handleViewFile = (file: FileItem) => { setViewingFile(file); setShowFileViewer(true); };
  const closeFileViewer = () => { setShowFileViewer(false); setViewingFile(null); };

  // ============================================================
  // FILE VALIDATION
  // ============================================================

  const getFileExtension = (name: string) => name.split('.').pop()?.toLowerCase() || '';
  const formatFileSize   = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B','KB','MB','GB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const validateFile  = (file: File) => {
    if (file.size > MAX_FILE_SIZE) return { valid: false, error: `File too large (${formatFileSize(file.size)}). Max: ${formatFileSize(MAX_FILE_SIZE)}` };
    const ext = getFileExtension(file.name);
    if (!ext) return { valid: false, error: 'File has no extension' };
    if (!ALLOWED_FILE_TYPES.includes(ext)) return { valid: false, error: `.${ext} is not supported` };
    return { valid: true };
  };

  const validateFiles = (files: File[]) => {
    const errors: string[] = [];
    for (const f of files) { const v = validateFile(f); if (!v.valid && v.error) errors.push(`"${f.name}": ${v.error}`); }
    if (files.length > 1) {
      const total = files.reduce((s, f) => s + f.size, 0);
      if (total > MAX_TOTAL_SIZE) errors.push(`Total size (${formatFileSize(total)}) exceeds max (${formatFileSize(MAX_TOTAL_SIZE)})`);
    }
    return { valid: errors.length === 0, errors };
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const v = validateFiles(files);
    if (!v.valid) { setModalError(v.errors.join('\n')); if (e.target) e.target.value = ''; return; }
    setUploadFiles(files); setModalError('');
    setUploadMode(files.length === 1 ? 'single' : files.length <= 5 ? 'multiple' : 'bulk');
  };

  const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); };
  const handleDrop      = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const v = validateFiles(files);
    if (!v.valid) { setModalError(v.errors.join('\n')); return; }
    setUploadFiles(files); setModalError('');
    setUploadMode(files.length === 1 ? 'single' : files.length <= 5 ? 'multiple' : 'bulk');
  };

  const removeFile = (i: number) => setUploadFiles(prev => prev.filter((_, idx) => idx !== i));

  // ============================================================
  // HELPERS
  // ============================================================

  const isImageFile = (t: string) => ['jpg','jpeg','png','gif','bmp','webp','svg'].includes(t.toLowerCase());
  const isPDFFile   = (t: string) => t.toLowerCase() === 'pdf';
  const isTextFile  = (t: string) => ['txt','md','json','xml','csv','log'].includes(t.toLowerCase());
  const isVideoFile = (t: string) => ['mp4','webm','ogg','mov'].includes(t.toLowerCase());
  const isAudioFile = (t: string) => ['mp3','wav','ogg','m4a'].includes(t.toLowerCase());

  const getIconComponent = (name: string) => iconOptions[name as keyof typeof iconOptions] || FolderOpen;

  const getColorClasses = (color: string) => ({
    '#007bff': { text: 'text-blue-600',   bg: 'bg-blue-50'   },
    '#28a745': { text: 'text-green-600',  bg: 'bg-green-50'  },
    '#dc3545': { text: 'text-red-600',    bg: 'bg-red-50'    },
    '#ffc107': { text: 'text-yellow-600', bg: 'bg-yellow-50' },
    '#6f42c1': { text: 'text-purple-600', bg: 'bg-purple-50' },
    '#fd7e14': { text: 'text-orange-600', bg: 'bg-orange-50' },
    '#20c997': { text: 'text-teal-600',   bg: 'bg-teal-50'   },
    '#e83e8c': { text: 'text-pink-600',   bg: 'bg-pink-50'   },
    '#6c757d': { text: 'text-gray-600',   bg: 'bg-gray-50'   },
  }[color] || { text: 'text-blue-600', bg: 'bg-blue-50' });

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const getFileTypeIcon = (fileType: string) => {
    const t = fileType.toLowerCase();
    if (['jpg','jpeg','png','gif','bmp','webp','svg'].includes(t)) return <div className="w-5 h-5 bg-green-100 rounded flex items-center justify-center text-green-600 text-xs font-bold">IMG</div>;
    if (t === 'pdf') return <div className="w-5 h-5 bg-red-100 rounded flex items-center justify-center text-red-600 text-xs font-bold">PDF</div>;
    if (['doc','docx'].includes(t)) return <div className="w-5 h-5 bg-blue-100 rounded flex items-center justify-center text-blue-600 text-xs font-bold">DOC</div>;
    if (['xls','xlsx','csv'].includes(t)) return <div className="w-5 h-5 bg-emerald-100 rounded flex items-center justify-center text-emerald-600 text-xs font-bold">XLS</div>;
    if (['ppt','pptx'].includes(t)) return <div className="w-5 h-5 bg-orange-100 rounded flex items-center justify-center text-orange-600 text-xs font-bold">PPT</div>;
    if (['txt','md','log'].includes(t)) return <div className="w-5 h-5 bg-gray-100 rounded flex items-center justify-center text-gray-600 text-xs font-bold">TXT</div>;
    if (['js','jsx','ts','tsx','html','css','json','xml'].includes(t)) return <div className="w-5 h-5 bg-purple-100 rounded flex items-center justify-center text-purple-600 text-xs font-bold">CODE</div>;
    if (['mp4','avi','mov','wmv','flv','webm','mkv'].includes(t)) return <div className="w-5 h-5 bg-pink-100 rounded flex items-center justify-center text-pink-600 text-xs font-bold">VID</div>;
    if (['mp3','wav','ogg','m4a','flac','aac'].includes(t)) return <div className="w-5 h-5 bg-indigo-100 rounded flex items-center justify-center text-indigo-600 text-xs font-bold">AUD</div>;
    if (['zip','rar','7z','tar','gz'].includes(t)) return <div className="w-5 h-5 bg-yellow-100 rounded flex items-center justify-center text-yellow-600 text-xs font-bold">ZIP</div>;
    return <File className="w-5 h-5 text-gray-600" />;
  };

  const filteredData = () => {
    if (currentView === 'categories') {
      return categories.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.description.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return {
      folders: folders.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()) || f.description.toLowerCase().includes(searchQuery.toLowerCase())),
      files:   files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()) || f.original_name.toLowerCase().includes(searchQuery.toLowerCase()))
    };
  };

  // ============================================================
  // LOADING STATE
  // ============================================================

  if (loading) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'} flex items-center justify-center`}>
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Loading...</p>
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'} p-6 transition-colors duration-200`}>
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-2">
            {currentView !== 'categories' && (
              <button onClick={handleBackToCategories} className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
                <ArrowLeft className={`w-5 h-5 ${isDarkMode ? 'text-white' : 'text-black'}`} />
              </button>
            )}
            <h1 className={`text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {currentView === 'categories' ? 'Categories' : 'File Management'}
            </h1>
          </div>
          {currentView === 'files-folders' && breadcrumb.length > 0 && (
            <div className={`flex items-center gap-2 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              <Home className="w-4 h-4" />
              {breadcrumb.map((item, i) => (
                <React.Fragment key={i}>
                  <ChevronRight className="w-4 h-4" />
                  <button onClick={() => handleBreadcrumbClick(i)} className={`transition-colors ${isDarkMode ? 'hover:text-blue-400' : 'hover:text-blue-600'}`}>{item.name}</button>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {/* ── Success Banner ── */}
        {success && (
          <div className={`border rounded-lg p-4 mb-6 flex items-center gap-3 transition-colors duration-200 ${isDarkMode ? 'bg-green-900 border-green-700' : 'bg-green-50 border-green-200'}`}>
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
            <span className={`flex-1 ${isDarkMode ? 'text-green-300' : 'text-green-700'}`}>{success}</span>
            <button onClick={() => setSuccess(null)} className="text-green-500 hover:text-green-700 ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* ── Error Banner ── */}
        {error && (
          <div className={`border rounded-lg p-4 mb-6 flex items-start gap-3 transition-colors duration-200 ${isDarkMode ? 'bg-red-900 border-red-700' : 'bg-red-50 border-red-200'}`}>
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <span className={`flex-1 whitespace-pre-line ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Toolbar */}
        <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-4 mb-6`}>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder={`Search ${currentView === 'categories' ? 'categories' : 'files and folders'}...`}
                className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <div className={`flex items-center border rounded-lg ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
                <button onClick={() => setViewMode('grid')} className={`p-2 rounded-l-lg ${viewMode === 'grid' ? 'bg-blue-500 text-white' : isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-50'}`}><Grid3X3 className="w-4 h-4" /></button>
                <button onClick={() => setViewMode('list')} className={`p-2 rounded-r-lg ${viewMode === 'list' ? 'bg-blue-500 text-white' : isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-50'}`}><List className="w-4 h-4" /></button>
              </div>
              {currentView === 'categories' ? (
                <button onClick={() => openModal('add', 'category')} disabled={!hasPermission(CategoryPermissions.ADD)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${hasPermission(CategoryPermissions.ADD) ? 'bg-blue-600 text-white hover:bg-blue-700' : isDarkMode ? 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50' : 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-50'}`}>
                  <Plus className="w-4 h-4" /> Add Category
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={() => openModal('add', 'folder')} disabled={!hasPermission(CategoryPermissions.CREATE_FOLDER)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${hasPermission(CategoryPermissions.CREATE_FOLDER) ? 'bg-green-600 text-white hover:bg-green-700' : isDarkMode ? 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50' : 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-50'}`}>
                    <Folder className="w-4 h-4" /> New Folder
                  </button>
                  <button onClick={() => openModal('add', 'file')} disabled={!hasPermission(CategoryPermissions.UPLOAD_FILES)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${hasPermission(CategoryPermissions.UPLOAD_FILES) ? 'bg-blue-600 text-white hover:bg-blue-700' : isDarkMode ? 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50' : 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-50'}`}>
                    <Upload className="w-4 h-4" /> Upload Files
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {currentView === 'categories' ? (
            <>
              {[
                { icon: <FolderOpen className={`w-4 h-4 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />, bg: isDarkMode ? 'bg-gray-700' : 'bg-blue-50', label: 'Total Categories', value: categories.length },
                { icon: <FileText   className={`w-4 h-4 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />, bg: isDarkMode ? 'bg-gray-700' : 'bg-green-50', label: 'Active', value: categories.filter(c => c.is_active).length },
                { icon: <BarChart3  className={`w-4 h-4 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />, bg: isDarkMode ? 'bg-gray-700' : 'bg-purple-50', label: 'Recent Updates', value: categories.filter(c => Math.floor((Date.now() - new Date(c.updated_at).getTime()) / 86400000) <= 7).length },
                { icon: <Users      className={`w-4 h-4 ${isDarkMode ? 'text-orange-400' : 'text-orange-600'}`} />, bg: isDarkMode ? 'bg-gray-700' : 'bg-orange-50', label: 'Contributors', value: new Set(categories.map(c => c.created_by)).size },
              ].map((s, i) => (
                <div key={i} className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-3`}>
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded ${s.bg}`}>{s.icon}</div>
                    <div>
                      <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{s.label}</div>
                      <div className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{s.value}</div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              {[
                { icon: <Folder   className={`w-4 h-4 ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`} />, bg: isDarkMode ? 'bg-gray-700' : 'bg-yellow-50', label: 'Folders', value: folders.length },
                { icon: <FileText className={`w-4 h-4 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />,    bg: isDarkMode ? 'bg-gray-700' : 'bg-blue-50',   label: 'Files',   value: files.length },
                { icon: <BarChart3 className={`w-4 h-4 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />, bg: isDarkMode ? 'bg-gray-700' : 'bg-green-50',  label: 'Total Size',
                  value: (() => { const b = files.reduce((s,f) => s+f.file_size, 0); if (!b) return '0 B'; const k=1024, s=['B','KB','MB','GB'], i=Math.floor(Math.log(b)/Math.log(k)); return parseFloat((b/Math.pow(k,i)).toFixed(1))+' '+s[i]; })() },
                { icon: <Star     className={`w-4 h-4 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`} />,      bg: isDarkMode ? 'bg-gray-700' : 'bg-red-50',    label: 'Starred', value: files.filter(f => f.is_starred).length },
              ].map((s, i) => (
                <div key={i} className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-3`}>
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded ${s.bg}`}>{s.icon}</div>
                    <div>
                      <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{s.label}</div>
                      <div className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{s.value}</div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Content */}
        <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border overflow-hidden`}>
          {currentView === 'categories' ? (
            viewMode === 'grid' ? (
              <div className={`p-6 ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {(filteredData() as Category[]).map(category => {
                    const Icon = getIconComponent(category.icon);
                    const cc   = getColorClasses(category.color);
                    return (
                      <div key={category.id} className={`group border rounded-xl p-6 hover:shadow-md transition-all duration-200 ${isDarkMode ? 'bg-gray-700 border-gray-600 hover:border-gray-500' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                        <div className="flex items-center justify-between mb-4">
                          <div className={`p-3 ${cc.bg} rounded-lg cursor-pointer`} onDoubleClick={() => handleCategoryDoubleClick(category)}>
                            <Icon className={`w-6 h-6 ${cc.text}`} />
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {hasPermission(CategoryPermissions.EDIT) && (
                              <button onClick={() => openModal('edit', 'category', category)} className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}><Edit3 className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-blue-400' : 'text-gray-400 hover:text-blue-600'}`} /></button>
                            )}
                            {hasPermission(CategoryPermissions.DELETE) && (
                              <button onClick={() => openModal('delete', 'category', category)} className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}><Trash2 className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`} /></button>
                            )}
                          </div>
                        </div>
                        <h3 className={`font-semibold mb-2 group-hover:text-blue-600 transition-colors cursor-pointer ${isDarkMode ? 'text-white' : 'text-gray-900'}`} onDoubleClick={() => handleCategoryDoubleClick(category)}>{category.name}</h3>
                        <p className={`text-sm mb-4 line-clamp-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{category.description}</p>
                        <div className={`text-sm mb-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{formatDate(category.updated_at)}</div>
                        <div className={`pt-3 border-t ${isDarkMode ? 'border-gray-600' : 'border-gray-100'}`}>
                          <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Created by <span className="font-medium">{category.created_by_name || 'Unknown'}</span></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className={`${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'} border-b`}>
                    <tr>
                      {['Category','Description','Last Updated','Created By',''].map((h,i) => (
                        <th key={i} className={`text-left p-4 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} ${i===4?'w-12':''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-gray-700' : 'divide-gray-100'}`}>
                    {(filteredData() as Category[]).map(category => {
                      const Icon = getIconComponent(category.icon);
                      const cc   = getColorClasses(category.color);
                      return (
                        <tr key={category.id} className={`transition-colors ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}>
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 ${cc.bg} rounded-lg cursor-pointer`} onDoubleClick={() => handleCategoryDoubleClick(category)}><Icon className={`w-5 h-5 ${cc.text}`} /></div>
                              <div className={`font-medium cursor-pointer ${isDarkMode ? 'text-white hover:text-blue-400' : 'text-gray-900 hover:text-blue-600'}`} onDoubleClick={() => handleCategoryDoubleClick(category)}>{category.name}</div>
                            </div>
                          </td>
                          <td className={`p-4 text-sm max-w-xs truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{category.description}</td>
                          <td className={`p-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{formatDate(category.updated_at)}</td>
                          <td className={`p-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{category.created_by_name || 'Unknown'}</td>
                          <td className="p-4">
                            <div className="flex items-center gap-1">
                              {hasPermission(CategoryPermissions.EDIT)   && <button onClick={() => openModal('edit',   'category', category)} className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}><Edit3  className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-blue-400' : 'text-gray-400 hover:text-blue-600'}`} /></button>}
                              {hasPermission(CategoryPermissions.DELETE) && <button onClick={() => openModal('delete', 'category', category)} className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}><Trash2 className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-red-400'  : 'text-gray-400 hover:text-red-600'}`}  /></button>}
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
                  {(filteredData() as any).folders?.map((folder: Folder) => (
                    <div key={`folder-${folder.id}`} className={`group border rounded-xl p-6 hover:shadow-md transition-all duration-200 ${isDarkMode ? 'bg-gray-700 border-gray-600 hover:border-gray-500' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                      <div className="flex items-center justify-between mb-4">
                        <div className={`p-3 rounded-lg cursor-pointer ${isDarkMode ? 'bg-gray-600' : 'bg-yellow-50'}`} onDoubleClick={() => handleFolderDoubleClick(folder)}>
                          <Folder className={isDarkMode ? 'w-6 h-6 text-yellow-400' : 'w-6 h-6 text-yellow-600'} />
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {hasPermission(CategoryPermissions.EDIT_FOLDER)   && <button onClick={() => openModal('edit',   'folder', folder)} className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}><Edit3  className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-blue-400' : 'text-gray-400 hover:text-blue-600'}`} /></button>}
                          {hasPermission(CategoryPermissions.DELETE_FOLDER) && <button onClick={() => openModal('delete', 'folder', folder)} className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}><Trash2 className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-red-400'  : 'text-gray-400 hover:text-red-600'}`}  /></button>}
                        </div>
                      </div>
                      <h3 className={`font-semibold mb-2 group-hover:text-blue-600 cursor-pointer ${isDarkMode ? 'text-white' : 'text-gray-900'}`} onDoubleClick={() => handleFolderDoubleClick(folder)}>{folder.name}</h3>
                      <p className={`text-sm mb-4 line-clamp-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{folder.description}</p>
                      <div className={`text-sm mb-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{formatDate(folder.created_at)}</div>
                      <div className={`pt-3 border-t ${isDarkMode ? 'border-gray-600' : 'border-gray-100'}`}>
                        <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Created by <span className="font-medium">{folder.created_by_name || 'Unknown'}</span></div>
                      </div>
                    </div>
                  ))}

                  {(filteredData() as any).files?.map((file: FileItem) => (
                    <div key={`file-${file.id}`} className={`group border rounded-xl p-6 hover:shadow-md transition-all duration-200 cursor-pointer ${isDarkMode ? 'bg-gray-700 border-gray-600 hover:border-gray-500' : 'bg-white border-gray-200 hover:border-gray-300'}`} onClick={() => handleViewFile(file)}>
                      <div className="flex items-center justify-between mb-4">
                        <div className={`p-3 rounded-lg ${isDarkMode ? 'bg-gray-600' : 'bg-blue-50'}`}>{getFileTypeIcon(file.file_type)}</div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {(isPDFFile(file.file_type) || isImageFile(file.file_type)) && hasPermission(CategoryPermissions.PREVIEW_FILES) && (
                            <button onClick={e => { e.stopPropagation(); handlePreviewFile(file); }} className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`} title="Preview"><Eye className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-blue-400' : 'text-gray-400 hover:text-blue-600'}`} /></button>
                          )}
                          {hasPermission(CategoryPermissions.EDIT) && (
                            <button onClick={e => { e.stopPropagation(); openRenameModal(file); }} className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`} title="Rename"><Edit3 className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-yellow-400' : 'text-gray-400 hover:text-yellow-600'}`} /></button>
                          )}
                          <button onClick={e => { e.stopPropagation(); handleStarFile(e, file); }} className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`} title={file.is_starred ? 'Unstar' : 'Star'}>
                            {file.is_starred ? <Star className="w-4 h-4 text-yellow-500 fill-current" /> : <StarOff className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-yellow-400' : 'text-gray-400 hover:text-yellow-500'}`} />}
                          </button>
                          {hasPermission(CategoryPermissions.SHARE_FILES) && isFileOwner(file, CURRENT_USER_ID) && (
                            <button onClick={e => { e.stopPropagation(); setSelectedFileForShares(file); setShowShareModal(true); }} className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`} title="Share"><Share2 className="w-4 h-4 text-blue-500" /></button>
                          )}
                          {hasPermission(CategoryPermissions.DOWNLOAD_FILES) && (
                            <button onClick={e => { e.stopPropagation(); handleDownloadFile(file); }} className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`} title="Download"><Download className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-green-400' : 'text-gray-400 hover:text-green-600'}`} /></button>
                          )}
                          {hasPermission(CategoryPermissions.DELETE_FILE) && (
                            <button onClick={e => { e.stopPropagation(); openModal('delete', 'file', file); }} className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`} title="Delete"><Trash2 className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`} /></button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className={`font-semibold truncate flex-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{file.name}</h3>
                        {file.is_starred && <Star className="w-4 h-4 text-yellow-500 fill-current flex-shrink-0" />}
                      </div>
                      <p className={`text-sm mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{file.formatted_size} • {file.file_type.toUpperCase()}</p>
                      <div className={`text-sm mb-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{formatDate(file.created_at)}</div>
                      <div className={`pt-3 border-t ${isDarkMode ? 'border-gray-600' : 'border-gray-100'}`}>
                        <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Created by <span className="font-medium">{file.created_by_name || 'Unknown'}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className={`${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'} border-b`}>
                    <tr>
                      {['Name','Type','Size','Created','Created By',''].map((h,i) => (
                        <th key={i} className={`text-left p-4 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} ${i===5?'w-12':''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-gray-700' : 'divide-gray-100'}`}>
                    {(filteredData() as any).folders?.map((folder: Folder) => (
                      <tr key={`folder-${folder.id}`} className={`transition-colors ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg cursor-pointer ${isDarkMode ? 'bg-gray-600' : 'bg-yellow-50'}`} onDoubleClick={() => handleFolderDoubleClick(folder)}><Folder className={isDarkMode ? 'w-5 h-5 text-yellow-400' : 'w-5 h-5 text-yellow-600'} /></div>
                            <div className={`font-medium cursor-pointer ${isDarkMode ? 'text-white hover:text-blue-400' : 'text-gray-900 hover:text-blue-600'}`} onDoubleClick={() => handleFolderDoubleClick(folder)}>{folder.name}</div>
                          </div>
                        </td>
                        <td className={`p-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Folder</td>
                        <td className={`p-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>—</td>
                        <td className={`p-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{formatDate(folder.created_at)}</td>
                        <td className={`p-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{folder.created_by_name || 'Unknown'}</td>
                        <td className="p-4">
                          <div className="flex items-center gap-1">
                            {hasPermission(CategoryPermissions.EDIT_FOLDER)   && <button onClick={() => openModal('edit',   'folder', folder)} className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}><Edit3  className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-blue-400' : 'text-gray-400 hover:text-blue-600'}`} /></button>}
                            {hasPermission(CategoryPermissions.DELETE_FOLDER) && <button onClick={() => openModal('delete', 'folder', folder)} className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}><Trash2 className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-red-400'  : 'text-gray-400 hover:text-red-600'}`}  /></button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {(filteredData() as any).files?.map((file: FileItem) => (
                      <tr key={`file-${file.id}`} className={`transition-colors cursor-pointer ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`} onClick={() => handleViewFile(file)}>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-gray-600' : 'bg-blue-50'}`}>{getFileTypeIcon(file.file_type)}</div>
                            <div className="flex items-center gap-2">
                              <div className={`font-medium truncate max-w-xs ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{file.name}</div>
                              {file.is_starred && <Star className="w-4 h-4 text-yellow-600 fill-current" />}
                            </div>
                          </div>
                        </td>
                        <td className={`p-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{file.file_type.toUpperCase()}</td>
                        <td className={`p-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{file.formatted_size}</td>
                        <td className={`p-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{formatDate(file.created_at)}</td>
                        <td className={`p-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{file.created_by_name || 'Unknown'}</td>
                        <td className="p-4" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {(isPDFFile(file.file_type) || isImageFile(file.file_type)) && hasPermission(CategoryPermissions.PREVIEW_FILES) && (
                              <button onClick={e => { e.stopPropagation(); handlePreviewFile(file); }} className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`} title="Preview"><Eye className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-blue-400' : 'text-gray-400 hover:text-blue-600'}`} /></button>
                            )}
                            <button onClick={e => { e.stopPropagation(); handleStarFile(e, file); }} className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`} title={file.is_starred ? 'Unstar' : 'Star'}>
                              {file.is_starred ? <Star className="w-4 h-4 text-yellow-600 fill-current" /> : <StarOff className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-yellow-400' : 'text-gray-400 hover:text-yellow-600'}`} />}
                            </button>
                            {hasPermission(CategoryPermissions.SHARE_FILES) && isFileOwner(file, CURRENT_USER_ID) && (
                              <button onClick={e => { e.stopPropagation(); setSelectedFileForShares(file); setShowShareModal(true); }} className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`} title="Share"><Share2 className="w-4 h-4 text-blue-500" /></button>
                            )}
                            {hasPermission(CategoryPermissions.DOWNLOAD_FILES) && (
                              <button onClick={e => { e.stopPropagation(); handleDownloadFile(file); }} className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`} title="Download"><Download className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-green-400' : 'text-gray-400 hover:text-green-600'}`} /></button>
                            )}
                            {hasPermission(CategoryPermissions.DELETE_FILE) && (
                              <button onClick={e => { e.stopPropagation(); openModal('delete', 'file', file); }} className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`} title="Delete"><Trash2 className={`w-4 h-4 ${isDarkMode ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`} /></button>
                            )}
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

        {/* Empty state */}
        {((currentView === 'categories' && (filteredData() as Category[]).length === 0) ||
          (currentView === 'files-folders' && (filteredData() as any).folders?.length === 0 && (filteredData() as any).files?.length === 0)) && !loading && (
          <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-12 text-center mt-6`}>
            {currentView === 'categories' ? (
              <>
                <FolderOpen className={`w-12 h-12 mx-auto mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                <h3 className={`text-lg font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>No categories found</h3>
                <p className={`mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{searchQuery ? 'Try adjusting your search terms.' : 'Create your first category to organize your files.'}</p>
                <button onClick={() => openModal('add', 'category')} disabled={!hasPermission(CategoryPermissions.ADD)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg mx-auto transition-colors ${hasPermission(CategoryPermissions.ADD) ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-50'}`}>
                  <Plus className="w-4 h-4" /> Add Category
                </button>
              </>
            ) : (
              <>
                <FileText className={`w-12 h-12 mx-auto mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                <h3 className={`text-lg font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>No files or folders found</h3>
                <p className={`mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{searchQuery ? 'Try adjusting your search terms.' : 'Create folders or upload files to get started.'}</p>
                <div className="flex items-center gap-3 justify-center">
                  <button onClick={() => openModal('add', 'folder')} disabled={!hasPermission(CategoryPermissions.CREATE_FOLDER)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${hasPermission(CategoryPermissions.CREATE_FOLDER) ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-50'}`}>
                    <Folder className="w-4 h-4" /> New Folder
                  </button>
                  <button onClick={() => openModal('add', 'file')} disabled={!hasPermission(CategoryPermissions.UPLOAD_FILES)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${hasPermission(CategoryPermissions.UPLOAD_FILES) ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-50'}`}>
                    <Upload className="w-4 h-4" /> Upload Files
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── MODAL ── */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {modalMode === 'add'    && modalType === 'category' && 'Add New Category'}
                  {modalMode === 'edit'   && modalType === 'category' && 'Edit Category'}
                  {modalMode === 'delete' && modalType === 'category' && 'Delete Category'}
                  {modalMode === 'add'    && modalType === 'folder'   && 'Create New Folder'}
                  {modalMode === 'edit'   && modalType === 'folder'   && 'Edit Folder'}
                  {modalMode === 'delete' && modalType === 'folder'   && 'Delete Folder'}
                  {modalMode === 'add'    && modalType === 'file'     && 'Upload Files'}
                  {modalMode === 'delete' && modalType === 'file'     && 'Delete File'}
                </h3>
                <button onClick={closeModal} className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}><X className={`w-5 h-5 ${isDarkMode ? 'text-white' : 'text-black'}`} /></button>
              </div>

              {/* Modal-level error */}
              {modalError && (
                <div className={`mb-4 p-3 border rounded-lg flex items-start gap-2 ${isDarkMode ? 'bg-red-900 border-red-700' : 'bg-red-50 border-red-200'}`}>
                  <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`} />
                  <span className={`text-sm flex-1 whitespace-pre-line ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>{modalError}</span>
                  <button onClick={() => setModalError('')} className="text-red-400 hover:text-red-600 ml-auto flex-shrink-0"><X className="w-4 h-4" /></button>
                </div>
              )}

              {/* DELETE */}
              {modalMode === 'delete' ? (
                <div>
                  <p className={`mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Are you sure you want to delete "{selectedItem?.name}"? This action cannot be undone.</p>
                  <div className="flex gap-3 justify-end">
                    <button onClick={closeModal} disabled={submitting} className={`px-4 py-2 rounded-lg disabled:opacity-50 ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}>Cancel</button>
                    <button onClick={handleDelete} disabled={submitting} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                      {submitting && <Loader className="w-4 h-4 animate-spin" />} Delete
                    </button>
                  </div>
                </div>
              ) : modalType === 'file' && modalMode === 'add' ? (
                /* FILE UPLOAD */
                <div>
                  <div className="space-y-4">
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Upload Mode</label>
                      <div className="flex items-center gap-4">
                        {(['single','multiple','bulk'] as const).map(m => (
                          <label key={m} className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="uploadMode" value={m} checked={uploadMode === m} onChange={() => setUploadMode(m)} />
                            <span className={`text-sm capitalize ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{m === 'single' ? 'Single File' : m === 'multiple' ? 'Multiple Files' : 'Bulk Upload'}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Select Files</label>
                      <div className={`mb-3 p-3 rounded-lg text-xs ${isDarkMode ? 'bg-blue-900 border border-blue-700' : 'bg-blue-50 border border-blue-200'}`}>
                        <div className={`font-semibold mb-1 ${isDarkMode ? 'text-blue-300' : 'text-blue-900'}`}>📋 Upload Limits:</div>
                        <ul className={`space-y-0.5 ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>
                          <li>• Max file size: <span className="font-semibold">{formatFileSize(MAX_FILE_SIZE)}</span></li>
                          <li>• Max total size: <span className="font-semibold">{formatFileSize(MAX_TOTAL_SIZE)}</span></li>
                          <li>• Supports PDF, DOC, XLS, images, videos, audio, archives, code, and more</li>
                        </ul>
                      </div>
                      <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${dragOver ? isDarkMode ? 'border-blue-500 bg-blue-900' : 'border-blue-500 bg-blue-50' : isDarkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'}`}
                        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                        <Upload className={`w-12 h-12 mx-auto mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                        <p className={`text-lg font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{uploadMode === 'single' ? 'Drop a file here' : 'Drop files here'}</p>
                        <p className={`text-sm mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>or click to browse</p>
                        <input type="file" multiple={uploadMode !== 'single'} ref={fileInputRef} onChange={handleFileInputChange} className="hidden" />
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Choose Files</button>
                      </div>
                      {uploadFiles.length > 0 && (
                        <div className="mt-4">
                          <div className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Selected ({uploadFiles.length})</div>
                          <div className={`max-h-40 overflow-y-auto border rounded-lg ${isDarkMode ? 'border-gray-600 bg-gray-700' : 'border-gray-200 bg-gray-50'}`}>
                            {uploadFiles.map((f, i) => (
                              <div key={i} className={`flex items-center justify-between p-3 border-b last:border-b-0 ${isDarkMode ? 'border-gray-600' : 'border-gray-100'}`}>
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <File className={`w-4 h-4 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                                  <div className="flex-1 min-w-0">
                                    <div className={`text-sm font-medium truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{f.name}</div>
                                    <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{(f.size/1024/1024).toFixed(2)} MB</div>
                                  </div>
                                </div>
                                <button onClick={() => removeFile(i)} disabled={submitting} className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}><X className="w-4 h-4 text-gray-400" /></button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3 justify-end mt-6">
                    <button onClick={closeModal} disabled={submitting} className={`px-4 py-2 rounded-lg disabled:opacity-50 ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}>Cancel</button>
                    <button onClick={handleFileUpload} disabled={submitting || uploadFiles.length === 0 || !currentCategoryId} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                      {submitting && <Loader className="w-4 h-4 animate-spin" />} Upload
                    </button>
                  </div>
                </div>
              ) : modalType === 'category' ? (
                /* CATEGORY FORM */
                <div>
                  <div className="space-y-4">
                    <div>
                      <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Name *</label>
                      <input type="text" value={categoryForm.name} onChange={e => setCategoryForm({...categoryForm, name: e.target.value})}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'}`}
                        placeholder="Enter category name" />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Description</label>
                      <textarea value={categoryForm.description} onChange={e => setCategoryForm({...categoryForm, description: e.target.value})} rows={3}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'}`}
                        placeholder="Enter category description" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Color</label>
                        <div className="grid grid-cols-5 gap-2">
                          {[['#007bff','Blue'],['#28a745','Green'],['#dc3545','Red'],['#ffc107','Yellow'],['#6f42c1','Purple'],['#fd7e14','Orange'],['#20c997','Teal'],['#e83e8c','Pink'],['#6c757d','Gray']].map(([hex, name]) => (
                            <button key={hex} type="button" onClick={() => setCategoryForm({...categoryForm, color: hex})}
                              className={`h-10 rounded-lg border-2 transition-all ${categoryForm.color === hex ? 'border-gray-900 ring-2 ring-gray-900 ring-offset-2' : isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}
                              style={{ backgroundColor: hex }} title={name} />
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Icon</label>
                        <select value={categoryForm.icon} onChange={e => setCategoryForm({...categoryForm, icon: e.target.value})}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                          {Object.keys(iconOptions).map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 justify-end mt-6">
                    <button onClick={closeModal} disabled={submitting} className={`px-4 py-2 rounded-lg disabled:opacity-50 ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}>Cancel</button>
                    <button onClick={handleSubmit} disabled={submitting} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                      {submitting && <Loader className="w-4 h-4 animate-spin" />} {modalMode === 'add' ? 'Create' : 'Update'}
                    </button>
                  </div>
                </div>
              ) : (
                /* FOLDER FORM */
                <div>
                  <div className="space-y-4">
                    <div>
                      <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Folder Name *</label>
                      <input type="text" value={folderForm.name} onChange={e => setFolderForm({...folderForm, name: e.target.value})}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'}`}
                        placeholder="Enter folder name" />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Description</label>
                      <textarea value={folderForm.description} onChange={e => setFolderForm({...folderForm, description: e.target.value})} rows={3}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'}`}
                        placeholder="Enter folder description" />
                    </div>
                  </div>
                  <div className="flex gap-3 justify-end mt-6">
                    <button onClick={closeModal} disabled={submitting} className={`px-4 py-2 rounded-lg disabled:opacity-50 ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}>Cancel</button>
                    <button onClick={handleSubmit} disabled={submitting} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
                      {submitting && <Loader className="w-4 h-4 animate-spin" />} {modalMode === 'add' ? 'Create' : 'Update'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SHARE MODAL ── */}
        {showShareModal && selectedFileForShares && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Share: {selectedFileForShares.name}</h3>
                <button onClick={() => { setShowShareModal(false); setSelectedUsers([]); setShareMessage(''); setUserSearchQuery(''); setSelectedFileForShares(null); }} className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}><X className={`w-5 h-5 ${isDarkMode ? 'text-white' : 'text-black'}`} /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-900'}`}>Share with</label>
                  <div className="relative">
                    <div className={`min-h-[42px] w-full px-3 py-2 border rounded-lg focus-within:ring-2 focus-within:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`}>
                      <div className="flex flex-wrap gap-2 items-center">
                        {selectedUsers.map(u => (
                          <div key={u.id} className="flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm">
                            <User className="w-3 h-3" /><span>{u.name}</span>
                            <button onClick={() => removeUser(u.id!)} className="hover:bg-blue-200 rounded-full p-0.5"><X className="w-3 h-3 text-blue-800" /></button>
                          </div>
                        ))}
                        <input type="text" value={userSearchQuery} onChange={e => setUserSearchQuery(e.target.value)} onKeyDown={handleSearchKeyDown}
                          placeholder={selectedUsers.length === 0 ? 'Search users...' : ''}
                          className={`flex-1 min-w-[200px] outline-none bg-transparent ${isDarkMode ? 'text-white' : 'text-gray-900'}`} />
                      </div>
                    </div>
                    {showUserDropdown && (
                      <div className={`absolute top-full left-0 right-0 mt-1 border rounded-lg shadow-lg max-h-60 overflow-y-auto z-10 ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`}>
                        {filteredUsers.map(u => (
                          <button key={u.id} onClick={() => addUser(u)} className={`w-full px-3 py-2 text-left flex items-center gap-3 border-b last:border-b-0 ${isDarkMode ? 'hover:bg-gray-600 border-gray-600' : 'hover:bg-gray-50 border-gray-100'}`}>
                            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">{u.name.charAt(0).toUpperCase()}</div>
                            <div><div className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{u.name}</div><div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{u.email}</div></div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-900'}`}>Message (optional)</label>
                  <textarea value={shareMessage} onChange={e => setShareMessage(e.target.value)} placeholder="Add a message..." rows={3}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`} />
                </div>
                <div className="flex gap-3 pt-4">
                  <button onClick={() => { setShowShareModal(false); setSelectedUsers([]); setShareMessage(''); setUserSearchQuery(''); setSelectedFileForShares(null); }} disabled={isSharing}
                    className={`flex-1 px-4 py-2 border rounded-lg ${isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>Cancel</button>
                  <button onClick={() => handleShare(true)} disabled={selectedUsers.length === 0}
                    className="flex items-center gap-2 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed">
                    <Mail className="w-4 h-4" /> Outlook
                  </button>
                  <button onClick={() => handleShare(false)} disabled={selectedUsers.length === 0 || isSharing}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                    {isSharing ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> Sharing...</> : <><Send className="w-4 h-4" /> Share</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── MANAGE SHARES MODAL ── */}
        {showManageSharesModal && selectedFileForShares && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Manage Access: {selectedFileForShares.name}</h3>
                <button onClick={() => { setShowManageSharesModal(false); setSelectedFileForShares(null); setCurrentFileShares([]); }} className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}><X className={`w-5 h-5 ${isDarkMode ? 'text-white' : 'text-black'}`} /></button>
              </div>
              <div className="space-y-4">
                {loadingShares ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader className="w-6 h-6 animate-spin text-blue-600" />
                    <span className={`ml-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Loading…</span>
                  </div>
                ) : currentFileShares.length > 0 ? (
                  <div className="space-y-2">
                    <p className={`text-sm mb-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{currentFileShares.length} user(s) have access to this file</p>
                    {currentFileShares.map((share: any) => (
                      <div key={share.id} className={`flex items-center justify-between p-3 border rounded-lg ${isDarkMode ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-medium">{share.username?.charAt(0).toUpperCase()}</div>
                          <div>
                            <div className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{share.username}</div>
                            <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{share.email}</div>
                            <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Shared on {new Date(share.created_at).toLocaleDateString()}</div>
                          </div>
                        </div>
                        <button onClick={() => handleRemoveShare(share.id)} className="flex items-center gap-1 px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-md">
                          <Trash2 className="w-4 h-4" /> Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`text-center py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    <Share2 className={`w-12 h-12 mx-auto mb-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                    <p>This file is not shared with anyone yet</p>
                  </div>
                )}
                <div className={`flex gap-3 pt-4 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <button onClick={() => { setShowManageSharesModal(false); setShowShareModal(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    <Share2 className="w-4 h-4" /> Share with More Users
                  </button>
                  <button onClick={() => { setShowManageSharesModal(false); setSelectedFileForShares(null); setCurrentFileShares([]); }}
                    className={`flex-1 px-4 py-2 border rounded-lg ${isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>Close</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── FILE VIEWER ── */}
        {showFileViewer && viewingFile && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col`}>
              <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-blue-50'}`}>{getFileTypeIcon(viewingFile.file_type)}</div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`text-lg font-semibold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{viewingFile.name}</h3>
                    <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{viewingFile.formatted_size} • {viewingFile.file_type.toUpperCase()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(isPDFFile(viewingFile.file_type) || isImageFile(viewingFile.file_type)) && (
                    <button onClick={() => handlePreviewFile(viewingFile)} className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`} title="Open in new tab"><Eye className={`w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} /></button>
                  )}
                  <button onClick={e => handleStarFile(e, viewingFile)} className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`} title={viewingFile.is_starred ? 'Unstar' : 'Star'}>
                    {viewingFile.is_starred ? <Star className="w-5 h-5 text-yellow-600 fill-current" /> : <StarOff className={`w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />}
                  </button>
                  {hasPermission(CategoryPermissions.SHARE_FILES) && isFileOwner(viewingFile, CURRENT_USER_ID) && (
                    <button onClick={() => { setSelectedFileForShares(viewingFile); setShowShareModal(true); }} className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`} title="Share"><Share2 className="w-5 h-5 text-blue-600" /></button>
                  )}
                  <button onClick={() => handleDownloadFile(viewingFile)} className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`} title="Download"><Download className={`w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} /></button>
                  <button onClick={closeFileViewer} className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}><X className={`w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} /></button>
                </div>
              </div>
              <div className={`flex-1 overflow-auto ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'} p-6`}>
                {isImageFile(viewingFile.file_type) ? (
                  <div className="flex items-center justify-center h-full">
                    <img src={`http://localhost:3002/api/files/${viewingFile.id}/download?user_id=${CURRENT_USER_ID}&preview=true`} alt={viewingFile.name} className="max-w-full max-h-full object-contain rounded-lg shadow-lg" />
                  </div>
                ) : isPDFFile(viewingFile.file_type) ? (
                  <div className="h-full"><iframe src={`http://localhost:3002/api/files/${viewingFile.id}/download?user_id=${CURRENT_USER_ID}&preview=true`} className="w-full h-full rounded-lg shadow-lg" title={viewingFile.name} /></div>
                ) : isVideoFile(viewingFile.file_type) ? (
                  <div className="flex items-center justify-center h-full">
                    <video controls className="max-w-full max-h-full rounded-lg shadow-lg" src={`http://localhost:3002/api/files/${viewingFile.id}/download?user_id=${CURRENT_USER_ID}&preview=true`}>Your browser does not support video.</video>
                  </div>
                ) : isAudioFile(viewingFile.file_type) ? (
                  <div className="flex items-center justify-center h-full">
                    <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-lg p-8 max-w-md w-full`}>
                      <audio controls className="w-full" src={`http://localhost:3002/api/files/${viewingFile.id}/download?user_id=${CURRENT_USER_ID}&preview=true`}>Your browser does not support audio.</audio>
                    </div>
                  </div>
                ) : isTextFile(viewingFile.file_type) ? (
                  <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-lg p-6 h-full overflow-auto`}>
                    <iframe src={`http://localhost:3002/api/files/${viewingFile.id}/download?user_id=${CURRENT_USER_ID}&preview=true`} className="w-full h-full border-0" title={viewingFile.name} />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className={`p-6 ${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-full mx-auto mb-4 w-20 h-20 flex items-center justify-center`}><File className={`w-10 h-10 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} /></div>
                      <h4 className={`text-lg font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Preview not available</h4>
                      <p className={`mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>This file type cannot be previewed.</p>
                      <button onClick={() => handleDownloadFile(viewingFile)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-2"><Download className="w-4 h-4" /> Download</button>
                    </div>
                  </div>
                )}
              </div>
              <div className={`border-t ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'} p-4`}>
                <div className={`flex items-center justify-between text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <div className="flex items-center gap-6">
                    <div><span className="font-medium">By:</span> {viewingFile.created_by_name || 'Unknown'}</div>
                    <div><span className="font-medium">Downloads:</span> {viewingFile.download_count}</div>
                  </div>
                  {hasPermission(CategoryPermissions.DELETE_FILE) && (
                    <button onClick={() => { closeFileViewer(); openModal('delete', 'file', viewingFile); }} className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg inline-flex items-center gap-1"><Trash2 className="w-4 h-4" /> Delete</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── RENAME MODAL ── */}
        {renameMode && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg max-w-md w-full p-6`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Rename File</h3>
                <button onClick={closeRenameModal} className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}><X className={`w-5 h-5 ${isDarkMode ? 'text-white' : 'text-black'}`} /></button>
              </div>
              {modalError && (
                <div className={`mb-4 p-3 border rounded-lg flex items-center gap-2 ${isDarkMode ? 'bg-red-900 border-red-700' : 'bg-red-50 border-red-200'}`}>
                  <AlertCircle className={`w-5 h-5 flex-shrink-0 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`} />
                  <span className={`text-sm ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>{modalError}</span>
                </div>
              )}
              <div className="mb-6">
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>New File Name</label>
                <input type="text" value={newFileName} onChange={e => setNewFileName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { const f = files.find(f => f.id === renameFileId); if (f) handleRenameFile(f); } }}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'}`}
                  placeholder="Enter new file name" autoFocus />
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={closeRenameModal} disabled={submitting} className={`px-4 py-2 rounded-lg disabled:opacity-50 ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}>Cancel</button>
                <button onClick={() => { const f = files.find(f => f.id === renameFileId); if (f) handleRenameFile(f); }} disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                  {submitting && <Loader className="w-4 h-4 animate-spin" />} Rename
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default FileManagement;