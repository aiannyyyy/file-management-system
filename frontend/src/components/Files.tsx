import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Filter, Grid3X3, List, Upload, FolderPlus,
  File, Folder, Image, FileText, Download, Share2, Trash2, Star,
  Clock, User, Calendar, ArrowUpDown, ChevronRight, Home, X,
  AlertCircle, CheckCircle, Edit, Info, RefreshCw, Send, Mail
} from 'lucide-react';
import { useDarkMode } from '../contexts/DarkModeContext';
import { useAuth, FilePermissions } from '../contexts/AuthContext';
import { ProtectedButton, ProtectedIconButton } from '../components/ProtectedButton';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
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
  const { hasPermission } = useAuth();

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

  // Folder Creation State
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Rename State
  const [itemToRename, setItemToRename] = useState<FileItem | null>(null);
  const [newName, setNewName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // Share State
  const [shareMessage, setShareMessage] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);

  // Preview State
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Filter State
  const [filterType, setFilterType] = useState('all');
  const [filterTime, setFilterTime] = useState('all');
  const [filterSize, setFilterSize] = useState('all');

  const CURRENT_USER_ID = currentUser.id?.toString() || '1';
  const API_BASE = 'http://localhost:3002/api/files';
  const isMainPage = currentFolder === null;

  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  const MAX_TOTAL_SIZE = 200 * 1024 * 1024;
  const ALLOWED_FILE_TYPES = [
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf', 'odt',
    'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico',
    'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v',
    'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma',
    'zip', 'rar', '7z', 'tar', 'gz',
    'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'xml', 'py', 'java', 'c', 'cpp', 'cs', 'php', 'rb', 'go', 'swift',
    'md', 'log', 'yaml', 'yml', 'sql'
  ];

  const isFileOwner = (file: FileItem, currentUserId: string): boolean =>
    String(file.created_by) === String(currentUserId);

  // ── Auto-hide banners ──────────────────────────────────────────────────────
  useEffect(() => {
    if (error) { const t = setTimeout(() => setError(null), 5000); return () => clearTimeout(t); }
  }, [error]);

  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(null), 3000); return () => clearTimeout(t); }
  }, [success]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    console.log('🔑 Token exists:', !!token);
  }, []);

  useEffect(() => { if (showShareModal) fetchUsers(); }, [showShareModal]);

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

  useEffect(() => { loadFilesAndFolders(); }, [currentFolder]);

  useEffect(() => {
    if (currentFolder) loadFolderPath();
    else setFolderPath([{ name: 'Home', path: '/', id: null }]);
  }, [currentFolder]);

  // ── Data loaders ──────────────────────────────────────────────────────────
  const loadFilesAndFolders = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const url = currentFolder ? `${API_BASE}/list/${currentFolder}` : `${API_BASE}/list`;
      const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load files`);
      const data: ApiResponse = await response.json();

      const starredRes = await fetch(`${API_BASE}/starred?user_id=${CURRENT_USER_ID}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      let starredIds = new Set<string>();
      if (starredRes.ok) {
        const starredData = await starredRes.json();
        starredIds = new Set((starredData.starredFiles || []).map((f: any) => String(f.id)));
      }

      setFiles((data.files || []).map(file => ({
        ...file,
        name: file.file_name || file.name || '',
        type: 'file' as const,
        size: file.file_size,
        fileType: file.file_type,
        modifiedAt: new Date(file.updated_at || file.created_at || Date.now()),
        modifiedBy: file.updated_by_name || file.created_by_name || 'Unknown',
        isStarred: starredIds.has(String(file.id)),
      })));

      setFolders((data.folders || []).map(folder => ({ ...folder, type: 'folder' as const })));
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
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to load folder path');
      const data = await response.json();
      setFolderPath([
        { name: 'Home', path: '/', id: null },
        ...data.path.map((f: any) => ({ name: f.name, path: f.id, id: f.id }))
      ]);
    } catch (err) {
      console.error('Error loading folder path:', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const response = await fetch('http://localhost:3002/api/share/users/all', {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
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
      setError('Failed to load users for sharing');
    }
  };

  // ── Computed lists ─────────────────────────────────────────────────────────
  const allItems = useMemo(() => {
    const folderItems: FileItem[] = folders.map(folder => ({
      ...folder,
      type: 'folder' as const,
      modifiedAt: new Date(folder.updated_at || folder.created_at),
      modifiedBy: folder.updated_by_name || folder.created_by_name || 'Unknown',
      isStarred: false,
    }));
    return [...folderItems, ...files];
  }, [files, folders]);

  const filteredAndSortedFiles = useMemo(() => {
    let filtered = allItems.filter(f =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (filterType !== 'all') {
      filtered = filtered.filter(file => {
        if (filterType === 'folders') return file.type === 'folder';
        const ext = file.fileType?.toLowerCase() || '';
        if (filterType === 'documents') return file.type === 'file' && ['doc','docx','pdf','txt','csv','xlsx','xls','ppt','pptx'].some(t => ext.includes(t));
        if (filterType === 'images') return file.type === 'file' && ['jpg','jpeg','png','gif','webp','bmp','svg'].some(t => ext.includes(t));
        if (filterType === 'pdfs') return file.type === 'file' && (ext.includes('pdf') || file.name.toLowerCase().endsWith('.pdf'));
        return true;
      });
    }

    if (filterTime !== 'all') {
      const now = new Date();
      filtered = filtered.filter(file => {
        const days = (now.getTime() - file.modifiedAt.getTime()) / (1000 * 3600 * 24);
        if (filterTime === '7days') return days <= 7;
        if (filterTime === '30days') return days <= 30;
        if (filterTime === '90days') return days <= 90;
        return true;
      });
    }

    if (filterSize !== 'all') {
      filtered = filtered.filter(file => {
        const mb = (file.size || 0) / (1024 * 1024);
        if (filterSize === 'under1mb') return mb < 1;
        if (filterSize === '1to10mb') return mb >= 1 && mb <= 10;
        if (filterSize === 'over10mb') return mb > 10;
        return true;
      });
    }

    filtered.sort((a, b) => {
      if (a.type === 'folder' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'folder') return 1;
      let cmp = 0;
      if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortBy === 'date') cmp = a.modifiedAt.getTime() - b.modifiedAt.getTime();
      else if (sortBy === 'size') cmp = (a.size || 0) - (b.size || 0);
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return filtered;
  }, [allItems, searchQuery, sortBy, sortOrder, filterType, filterTime, filterSize]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const formatFileSize = (bytes: number): string => {
    if (!bytes) return '0 Bytes';
    const k = 1024, sizes = ['Bytes','KB','MB','GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date: Date): string =>
    date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const getFileExtension = (filename: string): string => filename.split('.').pop()?.toLowerCase() || '';

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    if (file.size > MAX_FILE_SIZE)
      return { valid: false, error: `File is too large (${formatFileSize(file.size)}). Max is ${formatFileSize(MAX_FILE_SIZE)}.` };
    const ext = getFileExtension(file.name);
    if (!ext) return { valid: false, error: 'File has no extension.' };
    if (!ALLOWED_FILE_TYPES.includes(ext)) return { valid: false, error: `File type .${ext} is not supported.` };
    return { valid: true };
  };

  const validateFiles = (files: File[]): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    for (const f of files) {
      const v = validateFile(f);
      if (!v.valid && v.error) errors.push(`"${f.name}": ${v.error}`);
    }
    if (files.length > 1) {
      const total = files.reduce((s, f) => s + f.size, 0);
      if (total > MAX_TOTAL_SIZE)
        errors.push(`Total size (${formatFileSize(total)}) exceeds the ${formatFileSize(MAX_TOTAL_SIZE)} limit.`);
    }
    return { valid: errors.length === 0, errors };
  };

  const getFileIcon = (file: FileItem) => {
    if (file.type === 'folder') return <Folder className="w-5 h-5 text-blue-500" />;
    switch (file.fileType?.toLowerCase()) {
      case 'jpg': case 'jpeg': case 'png': case 'gif': case 'webp': case 'bmp': case 'svg':
        return <Image className="w-5 h-5 text-green-500" />;
      case 'pdf': return <FileText className="w-5 h-5 text-red-500" />;
      case 'doc': case 'docx': return <FileText className="w-5 h-5 text-blue-500" />;
      case 'xls': case 'xlsx': return <FileText className="w-5 h-5 text-green-600" />;
      case 'ppt': case 'pptx': return <FileText className="w-5 h-5 text-orange-500" />;
      case 'txt': case 'csv': return <FileText className="w-5 h-5 text-gray-600" />;
      default: return <File className="w-5 h-5 text-gray-500" />;
    }
  };

  const canPreviewFile = (file: FileItem) => {
    if (!file.fileType) return false;
    return ['jpg','jpeg','png','gif','webp','bmp','svg','pdf','txt','csv','json','xml','html','css','js','md'].includes(file.fileType.toLowerCase());
  };

  const renderFilePreview = () => {
    if (!previewFile) return null;
    const ft = previewFile.fileType?.toLowerCase();
    const url = `${API_BASE}/preview/${previewFile.id}`;
    if (['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ft || ''))
      return <img src={url} alt={previewFile.name} className="max-w-full max-h-96 object-contain mx-auto" onLoad={() => setPreviewLoading(false)} onError={() => setPreviewLoading(false)} />;
    if (ft === 'pdf')
      return <iframe src={url} className="w-full h-96 border-0" onLoad={() => setPreviewLoading(false)} />;
    if (['txt','csv','json','xml','html','css','js','md'].includes(ft || ''))
      return <iframe src={url} className="w-full h-96 border border-gray-200 rounded" onLoad={() => setPreviewLoading(false)} />;
    return (
      <div className="text-center py-8">
        <File className={`w-12 h-12 mx-auto mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
        <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Preview not available for this file type</p>
        <button onClick={() => handleDownload(previewFile)} className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 mx-auto">
          <Download className="w-4 h-4" /> Download to View
        </button>
      </div>
    );
  };

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fs = event.target.files;
    if (fs && fs.length > 0) {
      const v = validateFiles(Array.from(fs));
      if (!v.valid) { setError(v.errors.join('\n')); event.target.value = ''; return; }
      setUploadFiles(fs);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!uploadFiles || uploadFiles.length === 0) { setError('Please select files to upload'); return; }
    const dupes = Array.from(uploadFiles).filter(f => files.some(e => e.name?.toLowerCase() === f.name.toLowerCase()));
    if (dupes.length > 0) {
      const names = dupes.map(f => f.name).join(', ');
      setError(dupes.length === 1
        ? `A file named "${names}" already exists here. Please rename it or choose a different location.`
        : `These files already exist here: ${names}. Please rename them or choose a different location.`);
      return;
    }
    setIsUploading(true); setError(null);
    try {
      const token = localStorage.getItem('token');
      if (uploadFiles.length === 1) {
        const file = uploadFiles[0];
        const fd = new FormData();
        fd.append('file', file);
        if (currentFolder) fd.append('folder_id', currentFolder);
        fd.append('created_by', CURRENT_USER_ID);
        const res = await fetch(`${API_BASE}/upload`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Upload failed'); }
        setSuccess(`✅ "${file.name}" uploaded successfully!`);
      } else {
        const fd = new FormData();
        Array.from(uploadFiles).forEach(f => fd.append('files', f));
        if (currentFolder) fd.append('folder_id', currentFolder);
        fd.append('created_by', CURRENT_USER_ID);
        const res = await fetch(`${API_BASE}/upload/multiple`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Upload failed'); }
        const result = await res.json();
        const ok = result.totalUploaded || 0;
        const fail = result.totalErrors || 0;
        if (ok > 0) setSuccess(`✅ ${ok} file${ok > 1 ? 's' : ''} uploaded successfully!`);
        if (fail > 0) setError(`⚠️ ${fail} file${fail > 1 ? 's' : ''} failed to upload.`);
      }
      setShowUploadModal(false); setUploadFiles(null); loadFilesAndFolders();
    } catch (err) { setError(err instanceof Error ? err.message : 'Upload failed'); }
    finally { setIsUploading(false); }
  };

  // ── Create Folder ──────────────────────────────────────────────────────────
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) { setError('Folder name cannot be empty'); return; }
    if (folders.find(f => f.name.toLowerCase() === newFolderName.trim().toLowerCase())) {
      setError(`A folder named "${newFolderName.trim()}" already exists here.`); return;
    }
    setIsCreatingFolder(true); setError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: newFolderName.trim(), parent_id: currentFolder, created_by: CURRENT_USER_ID })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed to create folder'); }
      setSuccess(`✅ Folder "${newFolderName.trim()}" created successfully!`);
      setShowFolderModal(false); setNewFolderName(''); loadFilesAndFolders();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to create folder'); }
    finally { setIsCreatingFolder(false); }
  };

  // ── Rename ─────────────────────────────────────────────────────────────────
  const handleRename = async () => {
    if (!itemToRename || !newName.trim()) { setError('New name cannot be empty'); return; }
    if (allItems.find(i => i.name.toLowerCase() === newName.trim().toLowerCase() && i.id !== itemToRename.id && i.type === itemToRename.type)) {
      setError(`A ${itemToRename.type === 'folder' ? 'folder' : 'file'} named "${newName.trim()}" already exists here.`); return;
    }
    setIsRenaming(true); setError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/${itemToRename.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ new_name: newName.trim(), updated_by: CURRENT_USER_ID })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed to rename'); }
      setSuccess(`✅ "${itemToRename.name}" renamed to "${newName.trim()}" successfully!`);
      setShowRenameModal(false); setItemToRename(null); setNewName(''); loadFilesAndFolders();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to rename'); }
    finally { setIsRenaming(false); }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    const item = allItems.find(i => i.id === itemId);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/${itemId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ updated_by: CURRENT_USER_ID })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed to delete'); }
      setSuccess(`🗑️ "${item?.name || 'Item'}" deleted successfully!`);
      setSelectedFiles(prev => prev.filter(id => id !== itemId)); loadFilesAndFolders();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to delete item'); }
  };

  const handleBulkDelete = async () => {
    if (selectedFiles.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedFiles.length} selected item(s)?`)) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/bulk/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ids: selectedFiles, updated_by: CURRENT_USER_ID, force: false })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed to delete items'); }
      const result = await res.json();
      setSuccess(`🗑️ ${selectedFiles.length} item(s) deleted successfully!`);
      setSelectedFiles([]); loadFilesAndFolders();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to delete items'); }
  };

  // ── Download ───────────────────────────────────────────────────────────────
  const handleDownload = async (file: FileItem) => {
    if (file.type === 'folder') return handleFolderDownload(file.id, file.name);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/download/${file.id}?user_id=${CURRENT_USER_ID}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Download failed (Status: ${res.status})`); }
      const isPdfProtected = res.headers.get('X-PDF-Protection') === 'owner-password-enforced';
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = file.name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url);
      setSuccess(isPdfProtected ? `🔒 "${file.name}" downloaded with read-only protection!` : `📥 "${file.name}" downloaded successfully!`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Download failed'); }
  };

  const handleFolderDownload = async (folderId: string, folderName: string) => {
    try {
      setSuccess('⏳ Preparing folder download…');
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/download/folder/${folderId}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error('Folder download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${folderName}.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url);
      setSuccess(`📥 Folder "${folderName}" downloaded as ZIP successfully!`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Folder download failed'); }
  };

  const handleBulkDownload = async () => {
    if (selectedFiles.length === 0) return;
    if (selectedFiles.length === 1) { const item = allItems.find(i => i.id === selectedFiles[0]); if (item) await handleDownload(item); return; }
    try {
      setSuccess('⏳ Preparing bulk download…');
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/download/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ itemIds: selectedFiles })
      });
      if (!res.ok) throw new Error('Bulk download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `selected_files_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url);
      setSuccess(`📥 ${selectedFiles.length} items downloaded as ZIP!`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Bulk download failed'); }
  };

  // ── Star ───────────────────────────────────────────────────────────────────
  const handleToggleStar = async (e: React.MouseEvent, file: FileItem) => {
    e.stopPropagation();
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/star/${file.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ user_id: CURRENT_USER_ID })
      });
      if (!res.ok) throw new Error('Failed to toggle star');
      const result = await res.json();
      setFiles(prev => prev.map(f => f.id === file.id ? { ...f, isStarred: result.starred } : f));
      // Clear star message immediately when toggling (replaces previous message)
      setSuccess(result.starred
        ? `⭐ "${file.name}" added to Starred Files`
        : `"${file.name}" removed from Starred Files`
      );
    } catch (err) { setError('Failed to update star status'); }
  };

  // ── Share ──────────────────────────────────────────────────────────────────
  const addUser = (user: User) => { setSelectedUsers(prev => [...prev, user]); setUserSearchQuery(''); setShowUserDropdown(false); };
  const removeUser = (userId: string | number) => setSelectedUsers(prev => prev.filter(u => u.id !== userId));
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && userSearchQuery === '' && selectedUsers.length > 0)
      removeUser(selectedUsers[selectedUsers.length - 1].id!);
  };

  const generateMailtoLink = () => {
    const emails = selectedUsers.map(u => u.email).join(',');
    const subject = encodeURIComponent(`Shared files from ${currentUser.name}`);
    const fileNames = selectedFiles.map(id => allItems.find(i => i.id === id)?.name || 'file').join(', ');
    const body = encodeURIComponent(`${shareMessage || `${currentUser.name} has shared the following files with you:`}\n\nFiles: ${fileNames}\n\nPlease check your file sharing system for access.\n\nBest regards,\n${currentUser.name}`);
    return `mailto:${emails}?subject=${subject}&body=${body}`;
  };

  const handleShare = async (useOutlook = false) => {
    if (selectedFiles.length === 0) { setError('Please select at least one file to share'); return; }
    if (selectedUsers.length === 0) { setError('Please select at least one user to share with'); return; }

    if (useOutlook) {
      window.location.href = generateMailtoLink();
      setShowShareModal(false); setSelectedUsers([]); setShareMessage(''); setSelectedFiles([]);
      setSuccess(`📧 Outlook opened — email drafted for ${selectedUsers.length} recipient${selectedUsers.length > 1 ? 's' : ''}!`);
      return;
    }

    setIsSharing(true);
    try {
      const token = localStorage.getItem('token');
      const sharePromises = selectedFiles.map(async fileId => {
        const file = allItems.find(i => i.id === fileId);
        if (!file || file.type === 'folder') return;
        const userIds = selectedUsers.map(u => Number(u.id));
        const res = await fetch(`http://localhost:3002/api/share/files/${fileId}/share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ userIds })
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error || `Failed to share (Status: ${res.status})`); }
        return res.json();
      });
      await Promise.all(sharePromises);
      const sharedCount = selectedFiles.filter(id => allItems.find(i => i.id === id)?.type === 'file').length;
      const names = selectedUsers.map(u => u.name).join(', ');
      setSuccess(`✅ ${sharedCount} file${sharedCount > 1 ? 's' : ''} shared successfully with: ${names}`);
      setShowShareModal(false); setSelectedUsers([]); setShareMessage(''); setSelectedFiles([]);
    } catch (err) { setError('Failed to share files: ' + (err instanceof Error ? err.message : 'Unknown error')); }
    finally { setIsSharing(false); }
  };

  // ── Manage Shares ──────────────────────────────────────────────────────────
  const loadFileShares = async (fileId: string) => {
    setLoadingShares(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:3002/api/share/files/${fileId}/shares`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to load shares');
      const data = await res.json();
      setCurrentFileShares(data.data || data.users || []);
    } catch (err) { setError('Failed to load file shares'); }
    finally { setLoadingShares(false); }
  };

  const handleRemoveShare = async (shareId: number) => {
    if (!confirm('Remove access for this user?')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:3002/api/share/shares/${shareId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to remove share');
      setSuccess('✅ Access removed successfully!');
      if (selectedFileForShares) await loadFileShares(selectedFileForShares.id);
    } catch (err) { setError('Failed to remove access'); }
  };

  const openManageSharesModal = (file: FileItem) => { setSelectedFileForShares(file); setShowManageSharesModal(true); loadFileShares(file.id); };

  // ── Navigation helpers ─────────────────────────────────────────────────────
  const handleFolderClick = (folder: FileItem) => { if (folder.type === 'folder') setCurrentFolder(folder.id); };
  const handleBreadcrumbClick = (item: BreadcrumbItem) => setCurrentFolder(item.id || null);
  const handleSort = (col: 'name' | 'date' | 'size') => {
    if (sortBy === col) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortOrder('asc'); }
  };
  const handleItemClick = (item: FileItem) => { if (item.type === 'folder') handleFolderClick(item); else handleFilePreview(item); };
  const openRenameModal = (item: FileItem) => { setItemToRename(item); setNewName(item.name); setShowRenameModal(true); };
  const refresh = () => { loadFilesAndFolders(); setSuccess('🔄 Files refreshed!'); };
  const handleFilePreview = (file: FileItem) => { setPreviewFile(file); setShowPreviewModal(true); };
  const toggleFileSelection = (fileId: string) => setSelectedFiles(prev => prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]);

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'} p-6 transition-colors duration-200`}>
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className={`text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Files</h1>
            <button onClick={refresh} className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${isDarkMode ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'}`}>
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
          <nav className={`flex items-center space-x-2 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} mb-4`}>
            {folderPath.map((crumb, i) => (
              <div key={crumb.path || i} className="flex items-center">
                {i === 0 && <Home className="w-4 h-4 mr-1" />}
                <button className={`${isDarkMode ? 'hover:text-blue-400' : 'hover:text-blue-600'} transition-colors`} onClick={() => handleBreadcrumbClick(crumb)}>{crumb.name}</button>
                {i < folderPath.length - 1 && <ChevronRight className={`w-4 h-4 mx-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />}
              </div>
            ))}
          </nav>
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
        <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-4 mb-6 transition-colors duration-200`}>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input type="text" placeholder="Search files and folders..."
                  className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
              <button onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-3 py-2 border rounded-lg transition-colors ${showFilters ? isDarkMode ? 'bg-blue-900 border-blue-600 text-blue-300' : 'bg-blue-50 border-blue-300 text-blue-700' : isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                <Filter className="w-4 h-4" /> Filters
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className={`flex items-center border rounded-lg ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
                <button onClick={() => setViewMode('grid')} className={`p-2 rounded-l-lg ${viewMode === 'grid' ? 'bg-blue-500 text-white' : isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-50'}`}><Grid3X3 className="w-4 h-4" /></button>
                <button onClick={() => setViewMode('list')} className={`p-2 rounded-r-lg ${viewMode === 'list' ? 'bg-blue-500 text-white' : isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-50'}`}><List className="w-4 h-4" /></button>
              </div>
              {!isMainPage && (
                <ProtectedButton permission={FilePermissions.UPLOAD} onClick={() => setShowUploadModal(true)} variant="primary" size="md">
                  <Upload className="w-4 h-4 mr-2 inline" /> Upload
                </ProtectedButton>
              )}
              <button onClick={() => setShowFolderModal(true)} className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                <FolderPlus className="w-4 h-4" /> New Folder
              </button>
            </div>
          </div>
          {showFilters && (
            <div className={`mt-4 pt-4 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className="flex flex-wrap gap-4">
                <select value={filterType} onChange={e => setFilterType(e.target.value)} className={`px-3 py-2 border rounded-lg text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                  <option value="all">All Types</option><option value="folders">Folders</option><option value="documents">Documents</option><option value="images">Images</option><option value="pdfs">PDFs</option>
                </select>
                <select value={filterTime} onChange={e => setFilterTime(e.target.value)} className={`px-3 py-2 border rounded-lg text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                  <option value="all">All Time</option><option value="7days">Last 7 days</option><option value="30days">Last 30 days</option><option value="90days">Last 3 months</option>
                </select>
                <select value={filterSize} onChange={e => setFilterSize(e.target.value)} className={`px-3 py-2 border rounded-lg text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                  <option value="all">All Sizes</option><option value="under1mb">Less than 1MB</option><option value="1to10mb">1MB – 10MB</option><option value="over10mb">More than 10MB</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Main Page Notice */}
        {isMainPage && (
          <div className={`border rounded-lg p-4 mb-6 flex items-center gap-3 ${isDarkMode ? 'bg-blue-900 border-blue-700' : 'bg-blue-50 border-blue-200'}`}>
            <Info className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
            <div>
              <p className={`font-medium ${isDarkMode ? 'text-blue-300' : 'text-blue-700'}`}>Main Directory</p>
              <p className={`text-sm ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>You can only create folders in the main directory. To upload files, navigate into a folder first.</p>
            </div>
          </div>
        )}

        {/* ── Share Modal ── */}
        {showShareModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 w-full max-w-2xl`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Share Files</h3>
                <button onClick={() => { setShowShareModal(false); setSelectedUsers([]); setShareMessage(''); setUserSearchQuery(''); }}><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Share with</label>
                  <div className="relative">
                    <div className={`min-h-[42px] w-full px-3 py-2 border rounded-lg focus-within:ring-2 focus-within:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`}>
                      <div className="flex flex-wrap gap-2 items-center">
                        {selectedUsers.map(user => (
                          <div key={user.id} className="flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm">
                            <User className="w-3 h-3" /><span>{user.name}</span>
                            <button onClick={() => removeUser(user.id!)} className="hover:bg-blue-200 rounded-full p-0.5"><X className="w-3 h-3" /></button>
                          </div>
                        ))}
                        <input type="text" value={userSearchQuery} onChange={e => setUserSearchQuery(e.target.value)}
                          onKeyDown={handleSearchKeyDown}
                          placeholder={selectedUsers.length === 0 ? 'Search by name, email, or department...' : ''}
                          className={`flex-1 min-w-[200px] outline-none bg-transparent ${isDarkMode ? 'text-white placeholder-gray-400' : ''}`} />
                      </div>
                    </div>
                    {showUserDropdown && (
                      <div className={`absolute top-full left-0 right-0 mt-1 border rounded-lg shadow-lg max-h-60 overflow-y-auto z-10 ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`}>
                        {filteredUsers.map(user => (
                          <button key={user.id} onClick={() => addUser(user)} className={`w-full px-3 py-2 text-left flex items-center gap-3 border-b last:border-b-0 ${isDarkMode ? 'hover:bg-gray-600 border-gray-600' : 'hover:bg-gray-50 border-gray-100'}`}>
                            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">{user.name.charAt(0).toUpperCase()}</div>
                            <div>
                              <div className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{user.name}</div>
                              <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{user.email}</div>
                              {user.department && <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{user.department}</div>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Message (optional)</label>
                  <textarea value={shareMessage} onChange={e => setShareMessage(e.target.value)} placeholder="Add a message..." rows={3}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`} />
                </div>
                <div className="flex gap-3 pt-4">
                  <button onClick={() => { setShowShareModal(false); setSelectedUsers([]); setShareMessage(''); setUserSearchQuery(''); }} disabled={isSharing}
                    className={`flex-1 px-4 py-2 border rounded-lg ${isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>Cancel</button>
                  <button onClick={() => handleShare(true)} disabled={selectedUsers.length === 0}
                    className="flex items-center gap-2 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed">
                    <Mail className="w-4 h-4" /> Open in Outlook
                  </button>
                  <button onClick={() => handleShare(false)} disabled={selectedUsers.length === 0 || isSharing}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                    {isSharing ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Sharing…</> : <><Send className="w-4 h-4" /> Share via System</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Manage Shares Modal ── */}
        {showManageSharesModal && selectedFileForShares && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 w-full max-w-2xl`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Manage Access: {selectedFileForShares.name}</h3>
                <button onClick={() => { setShowManageSharesModal(false); setSelectedFileForShares(null); setCurrentFileShares([]); }}><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                {loadingShares ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
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
                  <button onClick={() => { setShowManageSharesModal(false); setSelectedFiles([selectedFileForShares.id]); setShowShareModal(true); }}
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

        {/* ── Files Content ── */}
        {loading ? (
          <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-12 text-center`}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Loading files…</p>
          </div>
        ) : (
          <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border overflow-hidden`}>
            {viewMode === 'list' ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className={`${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'} border-b`}>
                    <tr>
                      {[['name','Name'],['date','Modified'],['size','Size']].map(([col,label]) => (
                        <th key={col} className="text-left p-3">
                          <button onClick={() => handleSort(col as any)} className={`flex items-center gap-1 text-sm font-medium ${isDarkMode ? 'text-gray-300 hover:text-white' : 'text-gray-700 hover:text-gray-900'}`}>
                            {label} <ArrowUpDown className="w-3 h-3" />
                          </button>
                        </th>
                      ))}
                      <th className={`w-16 p-3 text-left text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-gray-700' : 'divide-gray-100'}`}>
                    {filteredAndSortedFiles.map(file => (
                      <tr key={file.id} onClick={() => handleItemClick(file)}
                        className={`transition-colors cursor-pointer ${selectedFiles.includes(file.id) ? isDarkMode ? 'bg-blue-900' : 'bg-blue-50' : isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}>
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            {getFileIcon(file)}
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{file.name}</span>
                              {file.isStarred && <Star className="w-4 h-4 text-yellow-400 fill-current" title="Starred" />}
                            </div>
                          </div>
                        </td>
                        <td className={`p-3 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          <div className="flex items-center gap-2"><Calendar className={`w-4 h-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />{formatDate(file.modifiedAt)}</div>
                          <div className="flex items-center gap-2 mt-1"><User className="w-4 h-4 text-gray-400" />{file.modifiedBy}</div>
                        </td>
                        <td className={`p-3 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{file.size ? formatFileSize(file.size) : '—'}</td>
                        <td className="p-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <ProtectedIconButton permission={FilePermissions.RENAME} icon={<Edit className="w-4 h-4" />} onClick={() => openRenameModal(file)} title="Rename" variant="primary" />
                            {file.type === 'file' && (
                              <>
                                <button onClick={e => handleToggleStar(e, file)}
                                  title={file.isStarred ? 'Remove from Starred Files' : 'Add to Starred Files'}
                                  className={`p-1 rounded transition-colors ${file.isStarred ? 'text-yellow-400 hover:text-yellow-500' : isDarkMode ? 'text-gray-500 hover:text-yellow-400' : 'text-gray-300 hover:text-yellow-400'}`}>
                                  <Star className={`w-4 h-4 ${file.isStarred ? 'fill-current' : ''}`} />
                                </button>
                                {isFileOwner(file, CURRENT_USER_ID) && (
                                  <ProtectedIconButton permission={FilePermissions.SHARE} icon={<Share2 className="w-4 h-4" />}
                                    onClick={e => { e.stopPropagation(); setSelectedFiles([file.id]); setShowShareModal(true); }}
                                    title="Share this file" variant="secondary" />
                                )}
                                <ProtectedIconButton permission={FilePermissions.DOWNLOAD} icon={<Download className="w-4 h-4" />}
                                  onClick={e => { e.stopPropagation(); handleDownload(file); }} title="Download" variant="primary" />
                              </>
                            )}
                            <ProtectedIconButton permission={FilePermissions.DELETE} icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDelete(file.id)} title="Delete" variant="danger" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                  {filteredAndSortedFiles.map(file => (
                    <div key={file.id}
                      className={`relative group p-4 border rounded-lg hover:shadow-md transition-all cursor-pointer ${isDarkMode ? 'border-gray-700 hover:border-gray-600 bg-gray-800' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                      onClick={() => { if (file.type === 'folder') handleFolderClick(file); else handleFilePreview(file); }}>
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <ProtectedIconButton permission={FilePermissions.RENAME} icon={<Edit className="w-4 h-4" />}
                          onClick={e => { e.stopPropagation(); openRenameModal(file); }} title="Rename" variant="primary" />
                        {file.type === 'file' && (
                          <>
                            <button onClick={e => handleToggleStar(e, file)}
                              title={file.isStarred ? 'Remove from Starred Files' : 'Add to Starred Files'}
                              className={`p-1 rounded transition-colors ${file.isStarred ? 'text-yellow-400 hover:text-yellow-500' : isDarkMode ? 'text-gray-500 hover:text-yellow-400' : 'text-gray-300 hover:text-yellow-400'}`}>
                              <Star className={`w-4 h-4 ${file.isStarred ? 'fill-current' : ''}`} />
                            </button>
                            {isFileOwner(file, CURRENT_USER_ID) && (
                              <ProtectedIconButton permission={FilePermissions.SHARE} icon={<Share2 className="w-4 h-4" />}
                                onClick={e => { e.stopPropagation(); setSelectedFiles([file.id]); setShowShareModal(true); }}
                                title="Share this file" variant="secondary" />
                            )}
                            <ProtectedIconButton permission={FilePermissions.DOWNLOAD} icon={<Download className="w-4 h-4" />}
                              onClick={e => { e.stopPropagation(); handleDownload(file); }} title="Download" variant="primary" />
                          </>
                        )}
                        <ProtectedIconButton permission={FilePermissions.DELETE} icon={<Trash2 className="w-4 h-4" />}
                          onClick={e => { e.stopPropagation(); handleDelete(file.id); }} title="Delete" variant="danger" />
                      </div>
                      <div className="flex flex-col items-center text-center mt-2">
                        <div className="w-12 h-12 mb-3 flex items-center justify-center">
                          {file.type === 'folder' ? <Folder className="w-10 h-10 text-blue-500" /> : (
                            <div className="relative">
                              {getFileIcon(file)}
                              {file.isStarred && <Star className="absolute -top-1 -right-1 w-3 h-3 text-yellow-400 fill-current" />}
                            </div>
                          )}
                        </div>
                        <h3 className={`font-medium text-sm mb-1 line-clamp-2 leading-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{file.name}</h3>
                        <div className={`text-xs space-y-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          <div className="flex items-center justify-center gap-1"><Clock className="w-3 h-3" />{formatDate(file.modifiedAt)}</div>
                          {file.size && <div>{formatFileSize(file.size)}</div>}
                          <div className="flex items-center justify-center gap-1"><User className="w-3 h-3" />{file.modifiedBy}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Empty State ── */}
        {!loading && filteredAndSortedFiles.length === 0 && (
          <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-12 text-center mt-6`}>
            <File className={`w-12 h-12 mx-auto mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
            <h3 className={`text-lg font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>No files found</h3>
            <p className={`mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              {searchQuery ? 'Try adjusting your search terms.' : isMainPage ? 'Create folders to organize your files, then upload files inside them.' : 'Upload your first file to get started.'}
            </p>
            {isMainPage
              ? <button onClick={() => setShowFolderModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 mx-auto"><FolderPlus className="w-4 h-4" /> Create Folder</button>
              : <button onClick={() => setShowUploadModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 mx-auto"><Upload className="w-4 h-4" /> Upload Files</button>
            }
          </div>
        )}

        {/* ── Upload Modal ── */}
        {showUploadModal && !isMainPage && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className={`rounded-lg p-6 w-full max-w-md ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Upload Files</h3>
                <button onClick={() => { setShowUploadModal(false); setUploadFiles(null); }} disabled={isUploading} className={`${isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Select Files</label>
                  <div className={`mb-3 p-3 rounded-lg text-xs ${isDarkMode ? 'bg-blue-900 border border-blue-700' : 'bg-blue-50 border border-blue-200'}`}>
                    <div className={`font-semibold mb-1 ${isDarkMode ? 'text-blue-300' : 'text-blue-900'}`}>📋 Upload Limits:</div>
                    <ul className={`space-y-0.5 ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>
                      <li>• Max file size: <span className="font-semibold">{formatFileSize(MAX_FILE_SIZE)}</span></li>
                      <li>• Max total size: <span className="font-semibold">{formatFileSize(MAX_TOTAL_SIZE)}</span></li>
                      <li>• Supported: PDF, DOC, XLS, PPT, images, videos, audio, archives, code files, and more</li>
                    </ul>
                  </div>
                  <input type="file" multiple onChange={handleFileSelect} disabled={isUploading}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`} />
                  {uploadFiles && uploadFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {Array.from(uploadFiles).map((f, i) => (
                        <p key={i} className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{f.name} ({formatFileSize(f.size)})</p>
                      ))}
                      <p className={`text-sm font-medium mt-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Total: {uploadFiles.length} file{uploadFiles.length > 1 ? 's' : ''}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 pt-4">
                  <button onClick={() => { setShowUploadModal(false); setUploadFiles(null); }} disabled={isUploading}
                    className={`flex-1 px-4 py-2 border rounded-lg ${isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>Cancel</button>
                  <button onClick={handleUpload} disabled={!uploadFiles || uploadFiles.length === 0 || isUploading}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {isUploading ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Uploading…</> : <><Upload className="w-4 h-4" /> Upload {uploadFiles && uploadFiles.length > 1 ? `${uploadFiles.length} Files` : 'File'}</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Create Folder Modal ── */}
        {showFolderModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 w-full max-w-md`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Create New Folder</h3>
                <button onClick={() => { setShowFolderModal(false); setNewFolderName(''); }} disabled={isCreatingFolder} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Folder Name</label>
                  <input type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Enter folder name…"
                    onKeyPress={e => { if (e.key === 'Enter' && newFolderName.trim() && !isCreatingFolder) handleCreateFolder(); }}
                    disabled={isCreatingFolder}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`} />
                </div>
                <div className="flex items-center gap-3 pt-4">
                  <button onClick={() => { setShowFolderModal(false); setNewFolderName(''); }} disabled={isCreatingFolder}
                    className={`flex-1 px-4 py-2 border rounded-lg ${isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>Cancel</button>
                  <button onClick={handleCreateFolder} disabled={!newFolderName.trim() || isCreatingFolder}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {isCreatingFolder ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Creating…</> : <><FolderPlus className="w-4 h-4" /> Create</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Rename Modal ── */}
        {showRenameModal && itemToRename && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 w-full max-w-md`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Rename {itemToRename.type === 'folder' ? 'Folder' : 'File'}</h3>
                <button onClick={() => { setShowRenameModal(false); setItemToRename(null); setNewName(''); }} disabled={isRenaming} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>New Name</label>
                  <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Enter new name…"
                    onKeyPress={e => { if (e.key === 'Enter' && newName.trim() && !isRenaming) handleRename(); }}
                    disabled={isRenaming}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`} />
                </div>
                <div className="flex items-center gap-3 pt-4">
                  <button onClick={() => { setShowRenameModal(false); setItemToRename(null); setNewName(''); }} disabled={isRenaming}
                    className={`flex-1 px-4 py-2 border rounded-lg ${isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>Cancel</button>
                  <button onClick={handleRename} disabled={!newName.trim() || isRenaming}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {isRenaming ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Renaming…</> : <><Edit className="w-4 h-4" /> Rename</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── File Preview Modal ── */}
        {showPreviewModal && previewFile && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden`}>
              <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="flex items-center gap-3">
                  {getFileIcon(previewFile)}
                  <div>
                    <h3 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{previewFile.name}</h3>
                    <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {previewFile.size ? `${formatFileSize(previewFile.size)} • ` : ''}Modified {formatDate(previewFile.modifiedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleDownload(previewFile)} className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
                    <Download className="w-4 h-4" /> Download
                  </button>
                  <button onClick={() => { setShowPreviewModal(false); setPreviewFile(null); setPreviewLoading(false); }}
                    className={`p-2 rounded-md ${isDarkMode ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className={`p-6 overflow-auto max-h-[calc(90vh-120px)] ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
                {previewLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                    <span className={`ml-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Loading preview…</span>
                  </div>
                ) : canPreviewFile(previewFile) ? (
                  <div className="text-center">{renderFilePreview()}</div>
                ) : (
                  <div className="text-center py-12">
                    <File className={`w-16 h-16 mx-auto mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                    <h4 className={`text-xl font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Preview Not Available</h4>
                    <p className={`mb-6 max-w-md mx-auto ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>This file type cannot be previewed in the browser. Download the file to view its contents.</p>
                    <button onClick={() => handleDownload(previewFile)} className="inline-flex items-center gap-2 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                      <Download className="w-4 h-4" /> Download File
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