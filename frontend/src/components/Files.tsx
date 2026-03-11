import React, { useState, useEffect, useMemo, useRef } from 'react'; // ← CHANGED: added useRef
import { 
  Search, Filter, Grid3X3, List, Upload, FolderPlus,
  File, Folder, Image, FileText, Download, Share2, Trash2, Star,
  Clock, User, Calendar, ArrowUpDown, ChevronRight, Home, X,
  AlertCircle, CheckCircle, Edit, Info, RefreshCw, Send, Mail,
  // ↓ NEW ICONS FOR MOVE FEATURE
  Move, RotateCcw, History, ChevronDown, FolderOpen, AlertTriangle,
  Copy, Layers, ArrowRight, Undo2, Loader
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

// ↓↓↓ NEW INTERFACES FOR MOVE FEATURE ↓↓↓
interface MoveItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
}

interface ConflictItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  conflicting_id: string;
  conflicting_name?: string;
}

interface MovePreview {
  can_move: MoveItem[];
  conflicts: ConflictItem[];
  errors: Array<{ id: string; name?: string; type: string; reason: string }>;
  warnings: Array<{ id: string; name?: string; type: string; reason: string }>;
}

interface FolderNode {
  id: string;
  name: string;
  parent_id: string | null;
  children?: FolderNode[];
  isLoaded?: boolean;
  isOpen?: boolean;
}

interface MoveHistoryBatch {
  batch_id: string;
  moved_at: string;
  item_count: number;
  can_undo: boolean;
  undone: boolean;
  undone_at: string | null;
  expires_in: string;
  items: Array<{
    id: number;
    item_type: string;
    item_id: string;
    item_name: string;
    from_folder: string;
    to_folder: string;
    from_folder_id: string | null;
    to_folder_id: string | null;
  }>;
}
// ↑↑↑ END NEW INTERFACES ↑↑↑

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

  // ↓↓↓ NEW STATE FOR MOVE FEATURE ↓↓↓
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveItems, setMoveItems] = useState<MoveItem[]>([]);
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string | null>(null);
  const [moveTargetFolderName, setMoveTargetFolderName] = useState<string>('Home (root)');
  const [movePreview, setMovePreview] = useState<MovePreview | null>(null);
  const [movePreviewLoading, setMovePreviewLoading] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [folderTreeLoading, setFolderTreeLoading] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [pendingConflicts, setPendingConflicts] = useState<ConflictItem[]>([]);
  const [conflictDecisions, setConflictDecisions] = useState<Record<string, 'overwrite' | 'version' | 'skip'>>({});
  const [conflictMovePayload, setConflictMovePayload] = useState<any>(null);
  const [undoToast, setUndoToast] = useState<{ batchId: string; message: string; visible: boolean } | null>(null);
  const undoToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [moveHistory, setMoveHistory] = useState<MoveHistoryBatch[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [draggedItem, setDraggedItem] = useState<MoveItem | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [showInlineFolderCreate, setShowInlineFolderCreate] = useState(false);
  const [inlineFolderName, setInlineFolderName] = useState('');
  const [isCreatingInlineFolder, setIsCreatingInlineFolder] = useState(false);
  const [uploadConflict, setUploadConflict] = useState<any>(null);
  const [showUploadConflictModal, setShowUploadConflictModal] = useState(false);
  // ↑↑↑ END NEW STATE ↑↑↑

  const CURRENT_USER_ID = currentUser.id?.toString() || '1';
  const API_BASE = 'http://localhost:3002/api/files';
  const MOVE_API = 'http://localhost:3002/api/move'; // ← NEW
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
      return <iframe src={url} className="w-full border-0" style={{ height: '80vh' }} onLoad={() => setPreviewLoading(false)} />;
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

        // ── Handle conflict ──
        if (res.status === 409) {
          const conflictData = await res.json();
          setIsUploading(false);
          setShowUploadModal(false);
          setUploadFiles(null);
          setUploadConflict(conflictData);
          setShowUploadConflictModal(true);
          return;
        }

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

  const handleResolveUploadConflict = async (strategy: 'overwrite' | 'version' | 'skip') => {
    if (!uploadConflict) return;
    setIsUploading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/upload/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          conflict_strategy: strategy,
          temp_path: uploadConflict.uploaded_file.temp_path,
          file_name: uploadConflict.uploaded_file.file_name,
          file_size: uploadConflict.uploaded_file.file_size,
          file_type: uploadConflict.uploaded_file.file_type,
          folder_id: currentFolder,
          created_by: CURRENT_USER_ID,
          existing_file_id: uploadConflict.existing_file.id
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resolve conflict');
      setShowUploadConflictModal(false);
      setUploadConflict(null);
      loadFilesAndFolders();
      setSuccess(
        strategy === 'skip' ? '⏭️ Upload skipped.' :
        strategy === 'overwrite' ? `✅ "${data.fileName}" overwritten successfully!` :
        `✅ Saved as "${data.fileName}" (version ${data.versionNumber})!`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve conflict');
    } finally {
      setIsUploading(false);
    }
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

      // ✅ Update the files list
      setFiles(prev => prev.map(f => f.id === file.id ? { ...f, isStarred: result.starred } : f));

      // ✅ Update previewFile if it's the same file (so the star icon updates immediately in the modal)
      setPreviewFile(prev => prev?.id === file.id ? { ...prev, isStarred: result.starred } : prev);

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
      setShowShareModal(false);
      setSelectedUsers([]);
      setShareMessage('');
      setSelectedFileForShares(null);
      setUserSearchQuery('');
      setSuccess(`📧 Outlook opened — email drafted for ${selectedUsers.length} recipient${selectedUsers.length > 1 ? 's' : ''}!`);
      return;
    }

    setIsSharing(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Authentication token missing');
      const res = await fetch(`http://localhost:3002/api/share/files/${selectedFileForShares.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userIds: selectedUsers.map(u => u.id?.toString()) })
      });
      if (!res.ok) throw new Error((await res.json()).error || `Failed to share file (${res.status})`);

      const names = selectedUsers.map(u => u.name).join(', ');
      setSuccess(`✅ "${selectedFileForShares.name}" shared successfully with: ${names}`);
      setShowShareModal(false);
      setSelectedUsers([]);
      setShareMessage('');
      setSelectedFileForShares(null);
      setUserSearchQuery('');
    } catch (err) {
      setError('Failed to share file: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally { setIsSharing(false); }
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
  const handleFolderClick = (folder: FileItem) => {
    if (folder.type === 'folder') {
      exitSelectMode();
      setCurrentFolder(folder.id);
    }
  };
  const handleBreadcrumbClick = (item: BreadcrumbItem) => {
    if (isSelectMode) return;
    setCurrentFolder(item.id || null);
  };
  const handleSort = (col: 'name' | 'date' | 'size') => {
    if (sortBy === col) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortOrder('asc'); }
  };
  const handleItemClick = (item: FileItem) => {
    if (isSelectMode) {
      toggleFileSelection(item.id);
      return; // ← block ALL navigation and preview in select mode
    }
    if (item.type === 'folder') handleFolderClick(item);
    else handleFilePreview(item);
  };
  const openRenameModal = (item: FileItem) => {
    if (!isFileOwner(item, CURRENT_USER_ID)) {
      setError('You can only rename files you own.');
      return;
    }
    setItemToRename(item); setNewName(item.name); setShowRenameModal(true);
  };
  const refresh = () => { loadFilesAndFolders(); setSuccess('🔄 Files refreshed!'); };
  const handleFilePreview = (file: FileItem) => { setPreviewFile(file); setShowPreviewModal(true); };
  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev => {
      const next = prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId];
      return next;
    });
  };

  const exitSelectMode = () => {
    setIsSelectMode(false);
    setSelectedFiles([]);
  };

  // ↓↓↓ NEW MOVE FEATURE HANDLERS ↓↓↓

  const openMoveModal = (items: MoveItem[]) => {
    setMoveItems(items);
    setMoveTargetFolderId(null);
    setMoveTargetFolderName('Home (root)');
    setMovePreview(null);
    setShowMoveModal(true);
    loadFolderTree();
  };

  const openMoveModalForSelected = () => {
    const items = selectedFiles
      .map(id => {
        const item = allItems.find(i => i.id === id);
        return item && isFileOwner(item, CURRENT_USER_ID) ? { id: item.id, name: item.name, type: item.type } : null;
      })
      .filter(Boolean) as MoveItem[];
    if (items.length === 0) {
      setError('You can only move files you own. None of the selected items belong to you.');
      return;
    }
    const skipped = selectedFiles.length - items.length;
    if (skipped > 0) setError(`${skipped} item(s) skipped — you can only move files you own.`);
    openMoveModal(items);
  };

  const openMoveModalForItem = (item: FileItem) => {
    openMoveModal([{ id: item.id, name: item.name, type: item.type }]);
  };

  const loadFolderTree = async () => {
    setFolderTreeLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/list`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to load folders');
      const data = await res.json();
      const rootFolders: FolderNode[] = (data.folders || []).map((f: any) => ({
        id: String(f.id), name: f.name, parent_id: null, children: [], isLoaded: false, isOpen: false
      }));
      setFolderTree(rootFolders);
    } catch (err) {
      console.error('Error loading folder tree:', err);
    } finally {
      setFolderTreeLoading(false);
    }
  };

  const loadFolderChildren = async (folderId: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/list/${folderId}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to load subfolders');
      const data = await res.json();
      const children: FolderNode[] = (data.folders || []).map((f: any) => ({
        id: String(f.id), name: f.name, parent_id: folderId, children: [], isLoaded: false, isOpen: false
      }));
      setFolderTree(prev => updateNodeInTree(prev, folderId, node => ({ ...node, children, isLoaded: true, isOpen: true })));
    } catch (err) {
      console.error('Error loading folder children:', err);
    }
  };

  const updateNodeInTree = (
    nodes: FolderNode[],
    targetId: string,
    updater: (n: FolderNode) => FolderNode
  ): FolderNode[] =>
    nodes.map(n =>
      n.id === targetId
        ? updater(n)
        : { ...n, children: n.children ? updateNodeInTree(n.children, targetId, updater) : [] }
    );

  const toggleFolderInTree = (folderId: string, folderName: string, isOpen: boolean) => {
    if (!isOpen) {
      loadFolderChildren(folderId);
    } else {
      setFolderTree(prev => updateNodeInTree(prev, folderId, n => ({ ...n, isOpen: false })));
    }
  };

  const selectDestination = async (folderId: string | null, folderName: string) => {
    setMoveTargetFolderId(folderId);
    setMoveTargetFolderName(folderName);
    setMovePreview(null);
    if (moveItems.length === 0) return;
    setMovePreviewLoading(true);
    try {
      const token = localStorage.getItem('token');
      const fileIds = moveItems.filter(i => i.type === 'file').map(i => i.id);
      const folderIds = moveItems.filter(i => i.type === 'folder').map(i => i.id);
      const params = new URLSearchParams();
      fileIds.forEach(id => params.append('file_ids', id));
      folderIds.forEach(id => params.append('folder_ids', id));
      if (folderId) params.append('target_folder_id', folderId);
      const res = await fetch(`${MOVE_API}/preview?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Preview failed');
      const data = await res.json();
      setMovePreview(data.preview);
    } catch (err) {
      console.error('Error getting move preview:', err);
    } finally {
      setMovePreviewLoading(false);
    }
  };

  const executeMove = async (conflictStrategy: string = 'ask') => {
    if (moveItems.length === 0) return;
    setIsMoving(true);
    try {
      const token = localStorage.getItem('token');
      const fileIds = moveItems.filter(i => i.type === 'file').map(i => i.id);
      const folderIds = moveItems.filter(i => i.type === 'folder').map(i => i.id);
      let endpoint = `${MOVE_API}/bulk`;
      let body: any = {
        file_ids: fileIds,
        folder_ids: folderIds,
        target_folder_id: moveTargetFolderId || null,
        moved_by: CURRENT_USER_ID,
        conflict_strategy: conflictStrategy
      };
      if (moveItems.length === 1 && moveItems[0].type === 'folder' && fileIds.length === 0) {
        endpoint = `${MOVE_API}/folder`;
        body = { folder_id: folderIds[0], target_folder_id: moveTargetFolderId || null, moved_by: CURRENT_USER_ID, conflict_strategy: conflictStrategy };
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.status === 409 && data.conflict) {
        setPendingConflicts(data.conflicts || []);
        setConflictMovePayload({ endpoint, body });
        setShowMoveModal(false);
        setShowConflictModal(true);
        setIsMoving(false);
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Move failed');
      const movedCount = (data.results?.moved_files?.length || 0) + (data.results?.moved_folders?.length || 0);
      setShowMoveModal(false);
      setSelectedFiles([]);
      loadFilesAndFolders();
      if (data.batch_id) {
        showUndoToast(data.batch_id, `Moved ${movedCount} item${movedCount !== 1 ? 's' : ''} to "${moveTargetFolderName}"`);
      } else {
        setSuccess(`✅ Moved ${movedCount} item${movedCount !== 1 ? 's' : ''} to "${moveTargetFolderName}"`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Move failed');
    } finally {
      setIsMoving(false);
    }
  };

  const applyConflictDecision = (itemId: string, strategy: 'overwrite' | 'version' | 'skip') => {
    setConflictDecisions(prev => ({ ...prev, [itemId]: strategy }));
  };

  const applyAllConflicts = (strategy: 'overwrite' | 'version' | 'skip') => {
    const decisions: Record<string, 'overwrite' | 'version' | 'skip'> = {};
    pendingConflicts.forEach(c => { decisions[c.id] = strategy; });
    setConflictDecisions(decisions);
  };

  const confirmConflicts = async () => {
    const undecided = pendingConflicts.filter(c => !conflictDecisions[c.id]);
    if (undecided.length > 0) { setError(`Please choose a strategy for all ${undecided.length} remaining conflict(s)`); return; }
    const allStrategies = new Set(Object.values(conflictDecisions));
    if (allStrategies.size === 1) {
      const strategy = [...allStrategies][0];
      setShowConflictModal(false);
      setConflictDecisions({});
      await executeMove(strategy);
    } else {
      setShowConflictModal(false);
      setIsMoving(true);
      try {
        const token = localStorage.getItem('token');
        let totalMoved = 0;
        let lastBatchId = '';
        for (const [itemId, strategy] of Object.entries(conflictDecisions)) {
          const item = moveItems.find(i => i.id === itemId);
          if (!item) continue;
          const body: any = {
            file_ids: item.type === 'file' ? [itemId] : [],
            folder_ids: item.type === 'folder' ? [itemId] : [],
            target_folder_id: moveTargetFolderId || null,
            moved_by: CURRENT_USER_ID,
            conflict_strategy: strategy
          };
          const res = await fetch(`${MOVE_API}/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body)
          });
          const data = await res.json();
          if (res.ok) {
            totalMoved += (data.results?.moved_files?.length || 0) + (data.results?.moved_folders?.length || 0);
            if (data.batch_id) lastBatchId = data.batch_id;
          }
        }
        setSelectedFiles([]);
        loadFilesAndFolders();
        if (lastBatchId) showUndoToast(lastBatchId, `Moved ${totalMoved} item${totalMoved !== 1 ? 's' : ''} to "${moveTargetFolderName}"`);
        else setSuccess(`✅ Moved ${totalMoved} item${totalMoved !== 1 ? 's' : ''} to "${moveTargetFolderName}"`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Move failed');
      } finally {
        setIsMoving(false);
        setConflictDecisions({});
      }
    }
  };

  const showUndoToast = (batchId: string, message: string) => {
    if (undoToastTimer.current) clearTimeout(undoToastTimer.current);
    setUndoToast({ batchId, message, visible: true });
    undoToastTimer.current = setTimeout(() => setUndoToast(null), 8000);
  };

  const handleUndoMove = async (batchId: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${MOVE_API}/undo/${batchId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ user_id: CURRENT_USER_ID })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Undo failed');
      setUndoToast(null);
      loadFilesAndFolders();
      setSuccess(`↩️ Move undone — ${data.summary?.total_undone || 0} item(s) restored`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Undo failed');
    }
  };

  const loadMoveHistory = async () => {
    setHistoryLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${MOVE_API}/history?user_id=${CURRENT_USER_ID}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load history');
      const data = await res.json();
      setMoveHistory(data.history || []);
    } catch (err) {
      setError('Failed to load move history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistoryModal = () => { setShowHistoryModal(true); loadMoveHistory(); };

  const handleCreateInlineFolder = async () => {
    if (!inlineFolderName.trim()) return;
    setIsCreatingInlineFolder(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          name: inlineFolderName.trim(),
          parent_id: moveTargetFolderId || null,
          created_by: CURRENT_USER_ID
        })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed to create folder'); }
      const data = await res.json();
      const newFolderId = String(data.folder?.id || data.id);
      const newFolderName = inlineFolderName.trim();
      // Refresh the folder tree and auto-select the new folder
      await loadFolderTree();
      await selectDestination(newFolderId, newFolderName);
      setInlineFolderName('');
      setShowInlineFolderCreate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder');
    } finally {
      setIsCreatingInlineFolder(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, item: MoveItem) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggedItem(item);
  };

  const handleDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolderId(folderId);
  };

  const handleDragLeave = () => setDragOverFolderId(null);

  const handleDrop = async (e: React.DragEvent, targetFolderId: string, targetFolderName: string) => {
    e.preventDefault();
    setDragOverFolderId(null);
    if (!draggedItem) return;
    if (draggedItem.type === 'folder' && draggedItem.id === targetFolderId) return;
    setDraggedItem(null);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      params.append(draggedItem.type === 'file' ? 'file_ids' : 'folder_ids', draggedItem.id);
      params.append('target_folder_id', targetFolderId);
      const previewRes = await fetch(`${MOVE_API}/preview?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const previewData = await previewRes.json();
      if (previewData.preview?.conflicts?.length > 0) {
        setMoveItems([draggedItem]);
        setMoveTargetFolderId(targetFolderId);
        setMoveTargetFolderName(targetFolderName);
        setMovePreview(previewData.preview);
        setShowMoveModal(true);
        loadFolderTree();
      } else if (previewData.preview?.errors?.length > 0) {
        setError(previewData.preview.errors.map((e: any) => e.reason).join(', '));
      } else {
        const moveRes = await fetch(`${MOVE_API}/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            file_ids: draggedItem.type === 'file' ? [draggedItem.id] : [],
            folder_ids: draggedItem.type === 'folder' ? [draggedItem.id] : [],
            target_folder_id: targetFolderId,
            moved_by: CURRENT_USER_ID,
            conflict_strategy: 'skip'
          })
        });
        const moveData = await moveRes.json();
        if (!moveRes.ok) throw new Error(moveData.error || 'Move failed');
        loadFilesAndFolders();
        if (moveData.batch_id) showUndoToast(moveData.batch_id, `Moved "${draggedItem.name}" to "${targetFolderName}"`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Move failed');
    }
  };
  // ↑↑↑ END NEW MOVE FEATURE HANDLERS ↑↑↑

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'} p-6 transition-colors duration-200`}>
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className={`text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Files</h1>
            {/* ↓ CHANGED: wrapped in flex div, added History button */}
            <div className="flex items-center gap-2">
              <button
                onClick={openHistoryModal}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${isDarkMode ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'}`}
              >
                <History className="w-4 h-4" /> History
              </button>
              <button onClick={refresh} className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${isDarkMode ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'}`}>
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
            </div>
            {/* Upload Conflict Modal */}
            {showUploadConflictModal && uploadConflict && (
              <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
                <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${isDarkMode ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}>
                  <div className={`flex items-center justify-between px-6 py-4 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-yellow-900' : 'bg-yellow-100'}`}>
                        <AlertTriangle className="w-5 h-5 text-yellow-500" />
                      </div>
                      <div>
                        <h3 className={`font-semibold text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>File Already Exists</h3>
                        <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{uploadConflict.message}</p>
                      </div>
                    </div>
                    <button onClick={() => { setShowUploadConflictModal(false); setUploadConflict(null); }}
                      className={`p-2 rounded-lg ${isDarkMode ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}>
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="px-6 py-5 space-y-3">
                    <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      How would you like to handle <span className="font-semibold">"{uploadConflict.uploaded_file.file_name}"</span>?
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      {([
                        { key: 'overwrite' as const, label: 'Overwrite', desc: 'Replace existing file', icon: <Copy className="w-5 h-5" />, color: 'text-red-500', bg: isDarkMode ? 'hover:bg-red-900' : 'hover:bg-red-50', border: isDarkMode ? 'hover:border-red-700' : 'hover:border-red-300' },
                        { key: 'version' as const,   label: 'New Version', desc: 'Save alongside as v2', icon: <Layers className="w-5 h-5" />, color: 'text-blue-500', bg: isDarkMode ? 'hover:bg-blue-900' : 'hover:bg-blue-50', border: isDarkMode ? 'hover:border-blue-700' : 'hover:border-blue-300' },
                        { key: 'skip' as const,      label: 'Skip', desc: "Don't upload this file", icon: <X className="w-5 h-5" />, color: 'text-gray-500', bg: isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100', border: isDarkMode ? 'hover:border-gray-500' : 'hover:border-gray-300' },
                      ]).map(s => (
                        <button key={s.key} onClick={() => handleResolveUploadConflict(s.key)} disabled={isUploading}
                          className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all disabled:opacity-50 ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'} ${s.bg} ${s.border}`}>
                          <span className={s.color}>{s.icon}</span>
                          <span className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{s.label}</span>
                          <span className={`text-xs text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{s.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {isUploading && (
                    <div className={`px-6 py-3 border-t flex items-center gap-2 ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                      <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Processing…</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* ↑ END CHANGED */}
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

        {/* Success Banner */}
        {success && (
          <div className={`border rounded-lg p-4 mb-6 flex items-center gap-3 transition-colors duration-200 ${isDarkMode ? 'bg-green-900 border-green-700' : 'bg-green-50 border-green-200'}`}>
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
            <span className={`flex-1 ${isDarkMode ? 'text-green-300' : 'text-green-700'}`}>{success}</span>
            <button onClick={() => setSuccess(null)} className="text-green-500 hover:text-green-700 ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Error Banner */}
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
              {/* ↓ NEW: bulk Move button — only shows when items are selected */}
              {/* Select mode toggle */}
              {/* Select mode toggle — just one small button */}
              <button
                onClick={() => isSelectMode ? exitSelectMode() : setIsSelectMode(true)}
                className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
                  isSelectMode
                    ? isDarkMode ? 'border-blue-500 bg-blue-900 text-blue-300' : 'border-blue-400 bg-blue-50 text-blue-700'
                    : isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <CheckCircle className="w-4 h-4" />
                {isSelectMode ? 'Selecting' : 'Select'}
              </button>
              {/* ↑ END NEW */}
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
        {/* ── SELECTION ACTION BAR — slides in below toolbar when select mode is active ── */}
        <div className={`transition-all duration-200 overflow-hidden ${isSelectMode ? 'max-h-20 mb-4' : 'max-h-0 mb-0'}`}>
          <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} shadow-sm`}>
            {/* Left: select all + count */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <input
                type="checkbox"
                checked={selectedFiles.length === filteredAndSortedFiles.length && filteredAndSortedFiles.length > 0}
                onChange={e => {
                  if (e.target.checked) setSelectedFiles(filteredAndSortedFiles.map(f => f.id));
                  else setSelectedFiles([]);
                }}
                className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
              />
              <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                {selectedFiles.length > 0 ? `${selectedFiles.length} selected` : 'Select all'}
              </span>
            </div>

            {/* Divider */}
            <div className={`w-px h-5 flex-shrink-0 ${isDarkMode ? 'bg-gray-600' : 'bg-gray-200'}`} />

            {/* Middle: action buttons — only when something is selected */}
            <div className="flex items-center gap-2 flex-1">
              {selectedFiles.length > 0 ? (
                <>
                  <button
                    onClick={openMoveModalForSelected}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    <Move className="w-3.5 h-3.5" /> Move
                  </button>
                  <button
                    onClick={handleBulkDownload}
                    className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg transition-colors text-sm font-medium ${isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </>
              ) : (
                <span className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Click items or use the checkbox above to select all
                </span>
              )}
            </div>

            {/* Right: cancel */}
            <button
              onClick={exitSelectMode}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors flex-shrink-0 ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          </div>
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

        {/* Share Modal — UNCHANGED */}
        {showShareModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
            <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 w-full max-w-2xl`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Share Files</h3>
                <button
                  onClick={() => {
                    setShowShareModal(false);
                    setSelectedUsers([]);
                    setShareMessage('');
                    setUserSearchQuery('');
                    setSelectedFileForShares(null);
                  }}
                >
                  <X className="w-5 h-5" />
                </button>
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
                        <input
                          type="text"
                          value={userSearchQuery}
                          onChange={e => setUserSearchQuery(e.target.value)}
                          onKeyDown={handleSearchKeyDown}
                          placeholder={selectedUsers.length === 0 ? 'Search by name, email, or department...' : ''}
                          className={`flex-1 min-w-[200px] outline-none bg-transparent ${isDarkMode ? 'text-white placeholder-gray-400' : ''}`}
                        />
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
                  <textarea
                    value={shareMessage}
                    onChange={e => setShareMessage(e.target.value)}
                    placeholder="Add a message..."
                    rows={3}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
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
                    disabled={isSharing}
                    className={`flex-1 px-4 py-2 border rounded-lg ${isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleShare(true)}
                    disabled={selectedUsers.length === 0}
                    className="flex items-center gap-2 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Mail className="w-4 h-4" /> Open in Outlook
                  </button>
                  <button
                    onClick={() => handleShare(false)}
                    disabled={selectedUsers.length === 0 || isSharing}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSharing
                      ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Sharing…</>
                      : <><Send className="w-4 h-4" /> Share via System</>
                    }
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Manage Shares Modal — UNCHANGED */}
        {showManageSharesModal && selectedFileForShares && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
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
              </div>
            </div>
          </div>
        )}

        {/* Files Content */}
        {loading ? (
          <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-12 text-center`}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Loading files…</p>
          </div>
        ) : (
          <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border overflow-hidden`}>

            {/* ── LIST VIEW ── */}
            {viewMode === 'list' ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className={`${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'} border-b`}>
                    <tr>
                      <th className="w-10 p-3">
                        {isSelectMode && (
                          <input
                            type="checkbox"
                            checked={selectedFiles.length === filteredAndSortedFiles.length && filteredAndSortedFiles.length > 0}
                            onChange={e => {
                              if (e.target.checked) setSelectedFiles(filteredAndSortedFiles.map(f => f.id));
                              else setSelectedFiles([]);
                            }}
                            className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                          />
                        )}
                      </th>
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
                      // ↓ CHANGED: added drag/drop props + dragOver highlight
                       <tr
                        key={file.id}
                        onClick={() => handleItemClick(file)}
                        draggable={!isSelectMode && isFileOwner(file, CURRENT_USER_ID)}
                        onDragStart={!isSelectMode && isFileOwner(file, CURRENT_USER_ID) ? e => handleDragStart(e, { id: file.id, name: file.name, type: file.type }) : undefined}
                        onDragOver={!isSelectMode && file.type === 'folder' ? e => handleDragOver(e, file.id) : undefined}
                        onDragLeave={!isSelectMode && file.type === 'folder' ? handleDragLeave : undefined}
                        onDrop={!isSelectMode && file.type === 'folder' ? e => handleDrop(e, file.id, file.name) : undefined}
                        className={`transition-colors cursor-pointer ${
                          dragOverFolderId === file.id && file.type === 'folder'
                            ? isDarkMode ? 'bg-blue-900 ring-2 ring-inset ring-blue-500' : 'bg-blue-50 ring-2 ring-inset ring-blue-400'
                            : selectedFiles.includes(file.id)
                              ? isDarkMode ? 'bg-blue-900' : 'bg-blue-50'
                              : isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="p-3 w-10" onClick={e => e.stopPropagation()}>
                          {isSelectMode && (
                            <input
                              type="checkbox"
                              checked={selectedFiles.includes(file.id)}
                              onChange={() => toggleFileSelection(file.id)}
                              className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                            />
                          )}
                        </td>
                      {/* ↑ END CHANGED */}
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
                            {isFileOwner(file, CURRENT_USER_ID) && (
                              <ProtectedIconButton permission={FilePermissions.RENAME} icon={<Edit className="w-4 h-4" />} onClick={() => openRenameModal(file)} title="Rename" variant="primary" />
                            )}
                            {/* ↓ NEW: Move button */}
                            {isFileOwner(file, CURRENT_USER_ID) && (
                              <button
                                onClick={e => { e.stopPropagation(); openMoveModalForItem(file); }}
                                title="Move"
                                className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'text-gray-400 hover:text-blue-400 hover:bg-gray-700' : 'text-gray-400 hover:text-blue-600 hover:bg-gray-100'}`}
                              >
                                <Move className="w-4 h-4" />
                              </button>
                            )}
                            {/* ↑ END NEW */}
                            {file.type === 'file' && (
                              <>
                                <button onClick={e => handleToggleStar(e, file)}
                                  title={file.isStarred ? 'Remove from Starred Files' : 'Add to Starred Files'}
                                  className={`p-1.5 rounded-lg transition-colors ${file.isStarred ? 'text-yellow-400 hover:text-yellow-500' : isDarkMode ? 'text-gray-500 hover:text-yellow-400' : 'text-gray-300 hover:text-yellow-400'}`}>
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
              // ── GRID VIEW ──
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                  {filteredAndSortedFiles.map(file => (
                    // ↓ CHANGED: added drag/drop props + dragOver highlight
                    <div
                      key={file.id}
                      draggable={!isSelectMode && isFileOwner(file, CURRENT_USER_ID)}
                      onDragStart={!isSelectMode && isFileOwner(file, CURRENT_USER_ID) ? e => handleDragStart(e, { id: file.id, name: file.name, type: file.type }) : undefined}
                      onDragOver={!isSelectMode && file.type === 'folder' ? e => handleDragOver(e, file.id) : undefined}
                      onDragLeave={!isSelectMode && file.type === 'folder' ? handleDragLeave : undefined}
                      onDrop={!isSelectMode && file.type === 'folder' ? e => handleDrop(e, file.id, file.name) : undefined}
                      onClick={() => handleItemClick(file)}
                      className={`relative group p-4 border rounded-lg transition-all cursor-pointer ${
                        dragOverFolderId === file.id && file.type === 'folder'
                          ? isDarkMode ? 'border-blue-500 bg-blue-900 shadow-lg scale-105' : 'border-blue-400 bg-blue-50 shadow-lg scale-105'
                          : isSelectMode && selectedFiles.includes(file.id)
                            ? isDarkMode ? 'border-blue-500 bg-blue-950 ring-2 ring-blue-500' : 'border-blue-400 bg-blue-50 ring-2 ring-blue-400'
                          : isSelectMode
                            ? isDarkMode ? 'border-gray-700 bg-gray-800 hover:border-blue-600 hover:bg-gray-750' : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50'
                          : isDarkMode ? 'border-gray-700 hover:border-gray-600 bg-gray-800 hover:shadow-md' : 'border-gray-200 hover:border-gray-300 bg-white hover:shadow-md'
                      }`}
                    >
                    {/* ↑ END CHANGED */}
                      {/* Checkbox — only visible in select mode */}
                      {isSelectMode && (
                        <div
                          className="absolute top-2 left-2 z-10"
                          onClick={e => { e.stopPropagation(); toggleFileSelection(file.id); }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedFiles.includes(file.id)}
                            onChange={() => {}}
                            className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                          />
                        </div>
                      )}

                      {/* Action icons — single row at top, hidden in select mode */}
                      {!isSelectMode && (
                         <div className="absolute top-1.5 inset-x-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-0.5 flex-nowrap">
                          {isFileOwner(file, CURRENT_USER_ID) && (
                            <ProtectedIconButton
                              permission={FilePermissions.RENAME}
                              icon={<Edit className="w-3.5 h-3.5" />}
                              onClick={e => { e.stopPropagation(); openRenameModal(file); }}
                              title="Rename" variant="primary"
                            />
                          )}
                          {isFileOwner(file, CURRENT_USER_ID) && (
                            <button
                              onClick={e => { e.stopPropagation(); openMoveModalForItem(file); }}
                              title="Move"
                              className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'text-gray-400 hover:text-blue-400 hover:bg-gray-700' : 'text-gray-400 hover:text-blue-600 hover:bg-gray-100'}`}
                            >
                              <Move className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {file.type === 'file' && (
                            <button
                              onClick={e => handleToggleStar(e, file)}
                              title={file.isStarred ? 'Remove from Starred' : 'Add to Starred'}
                              className={`p-1.5 rounded-lg transition-colors ${file.isStarred ? 'text-yellow-400 hover:text-yellow-500' : isDarkMode ? 'text-gray-500 hover:text-yellow-400' : 'text-gray-300 hover:text-yellow-400'}`}
                            >
                              <Star className={`w-3.5 h-3.5 ${file.isStarred ? 'fill-current' : ''}`} />
                            </button>
                          )}
                          {file.type === 'file' && isFileOwner(file, CURRENT_USER_ID) && (
                            <ProtectedIconButton
                              permission={FilePermissions.SHARE}
                              icon={<Share2 className="w-3.5 h-3.5" />}
                              onClick={e => { e.stopPropagation(); setSelectedFiles([file.id]); setShowShareModal(true); }}
                              title="Share" variant="secondary"
                            />
                          )}
                          {file.type === 'file' && (
                            <ProtectedIconButton
                              permission={FilePermissions.DOWNLOAD}
                              icon={<Download className="w-3.5 h-3.5" />}
                              onClick={e => { e.stopPropagation(); handleDownload(file); }}
                              title="Download" variant="primary"
                            />
                          )}
                          <ProtectedIconButton
                            permission={FilePermissions.DELETE}
                            icon={<Trash2 className="w-3.5 h-3.5" />}
                            onClick={e => { e.stopPropagation(); handleDelete(file.id); }}
                            title="Delete" variant="danger"
                          />
                        </div>
                      )}
                      <div className="flex flex-col items-center text-center mt-8">
                        <div className="w-12 h-12 mb-3 flex items-center justify-center">
                          {file.type === 'folder' ? <Folder className="w-10 h-10 text-blue-500" /> : (
                            <div className="relative">
                              {getFileIcon(file)}
                              {file.isStarred && <Star className="absolute -top-1 -right-1 w-3 h-3 text-yellow-400 fill-current" />}
                            </div>
                          )}
                        </div>
                        <h3 className={`font-medium text-sm mb-2 line-clamp-2 leading-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{file.name}</h3>
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

        {/* Empty State — UNCHANGED */}
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

        {/* Upload Modal — UNCHANGED */}
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

        {/* Create Folder Modal — UNCHANGED */}
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

        {/* Rename Modal — UNCHANGED */}
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

        {showPreviewModal && previewFile && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="w-full h-full flex flex-col bg-white dark:bg-gray-900" style={{ maxWidth: '100vw', maxHeight: '100vh' }}>

              {/* ── Top Bar ── */}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white flex-shrink-0">
                {/* Left: file icon + name + size */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate text-white leading-tight">{previewFile.name}</p>
                    <p className="text-xs text-gray-400 leading-tight">
                      {previewFile.size ? formatFileSize(previewFile.size) : '—'} • {previewFile.fileType?.toUpperCase() || 'FILE'}
                    </p>
                  </div>
                </div>

                {/* Right: action buttons */}
                <div className="flex items-center gap-1 flex-shrink-0 ml-4">
                  {/* Star */}
                  <button
                    onClick={e => handleToggleStar(e, previewFile)}
                    title={previewFile.isStarred ? 'Remove from Starred' : 'Add to Starred'}
                    className={`p-2 rounded-lg transition-colors ${
                      previewFile.isStarred
                        ? 'text-yellow-400 hover:text-yellow-300'
                        : 'text-gray-400 hover:text-yellow-400 hover:bg-gray-700'
                    }`}
                  >
                    <Star className={`w-5 h-5 ${previewFile.isStarred ? 'fill-current' : ''}`} />
                  </button>

                  {/* Share */}
                  {isFileOwner(previewFile, CURRENT_USER_ID) && (
                    <button
                      onClick={() => {
                        setSelectedFileForShares(previewFile);
                        setShowShareModal(true);
                      }}
                      title="Share"
                      className="p-2 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-gray-700 transition-colors"
                    >
                      <Share2 className="w-5 h-5" />
                    </button>
                  )}

                  {/* Download */}
                  <button
                    onClick={() => handleDownload(previewFile)}
                    title="Download"
                    className="p-2 rounded-lg text-gray-400 hover:text-green-400 hover:bg-gray-700 transition-colors"
                  >
                    <Download className="w-5 h-5" />
                  </button>

                  {/* Delete */}
                  {isFileOwner(previewFile, CURRENT_USER_ID) && (
                    <button
                      onClick={() => { handleDelete(previewFile.id); setShowPreviewModal(false); setPreviewFile(null); }}
                      title="Delete"
                      className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-700 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}

                  {/* Divider */}
                  <div className="w-px h-5 bg-gray-600 mx-1" />

                  {/* Close */}
                  <button
                    onClick={() => { setShowPreviewModal(false); setPreviewFile(null); setPreviewLoading(false); }}
                    className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* ── Bottom bar: By + Downloads ── */}
              <div className="flex items-center justify-between px-4 py-2 bg-gray-800 text-xs text-gray-400 flex-shrink-0 border-b border-gray-700">
                <span>By: <span className="text-gray-300 font-medium">{previewFile.modifiedBy}</span></span>
                <span>Downloads: <span className="text-gray-300 font-medium">{(previewFile as any).download_count ?? 0}</span></span>
              </div>

              {/* ── Content Area ── */}
              <div className="flex-1 overflow-hidden bg-gray-700 flex items-center justify-center">
                {previewLoading && (
                  <div className="flex flex-col items-center gap-3 text-white">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
                    <span className="text-sm text-gray-400">Loading preview…</span>
                  </div>
                )}

                {canPreviewFile(previewFile) ? (
                  <>
                    {/* Image */}
                    {['jpg','jpeg','png','gif','webp','bmp','svg'].includes(previewFile.fileType?.toLowerCase() || '') && (
                      <img
                        src={`${API_BASE}/preview/${previewFile.id}`}
                        alt={previewFile.name}
                        className="max-w-full max-h-full object-contain"
                        onLoad={() => setPreviewLoading(false)}
                        onError={() => setPreviewLoading(false)}
                      />
                    )}

                    {/* PDF */}
                    {previewFile.fileType?.toLowerCase() === 'pdf' && (
                      <iframe
                        src={`${API_BASE}/preview/${previewFile.id}`}
                        className="w-full h-full border-0"
                        onLoad={() => setPreviewLoading(false)}
                        title={previewFile.name}
                      />
                    )}

                    {/* Text / Code */}
                    {['txt','csv','json','xml','html','css','js','md'].includes(previewFile.fileType?.toLowerCase() || '') && (
                      <iframe
                        src={`${API_BASE}/preview/${previewFile.id}`}
                        className="w-full h-full border-0 bg-white"
                        onLoad={() => setPreviewLoading(false)}
                        title={previewFile.name}
                      />
                    )}
                  </>
                ) : (
                  /* No preview available */
                  <div className="text-center">
                    <div className="w-20 h-20 bg-gray-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <File className="w-10 h-10 text-gray-400" />
                    </div>
                    <h4 className="text-lg font-semibold text-white mb-2">Preview Not Available</h4>
                    <p className="text-gray-400 text-sm mb-6 max-w-xs">This file type cannot be previewed in the browser.</p>
                    <button
                      onClick={() => handleDownload(previewFile)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      <Download className="w-4 h-4" /> Download to View
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* ↓↓↓ NEW: MOVE MODAL ↓↓↓ */}
        {showMoveModal && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col ${isDarkMode ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`} style={{ maxHeight: '85vh' }}>
              <div className={`flex items-center justify-between px-6 py-4 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-blue-900' : 'bg-blue-100'}`}>
                    <Move className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <h3 className={`font-semibold text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      Move {moveItems.length === 1 ? `"${moveItems[0].name}"` : `${moveItems.length} items`}
                    </h3>
                    <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {moveItems.filter(i => i.type === 'file').length} file(s), {moveItems.filter(i => i.type === 'folder').length} folder(s)
                    </p>
                  </div>
                </div>
                <button onClick={() => { setShowMoveModal(false); setMovePreview(null); setShowInlineFolderCreate(false); setInlineFolderName(''); }} className={`p-2 rounded-lg ${isDarkMode ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className={`px-6 py-3 border-b ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center gap-2 text-sm">
                  <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Moving to:</span>
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${isDarkMode ? 'bg-blue-900 text-blue-300' : 'bg-blue-100 text-blue-700'}`}>
                    <Folder className="w-3.5 h-3.5" /> {moveTargetFolderName}
                  </div>
                </div>
                {movePreviewLoading && (
                  <div className={`flex items-center gap-2 text-sm mt-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    <Loader className="w-4 h-4 animate-spin" /> Checking destination…
                  </div>
                )}
                {!movePreviewLoading && movePreview && (
                  <div className="mt-3 space-y-2">
                    {movePreview.can_move.length > 0 && (
                      <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${isDarkMode ? 'bg-green-900 text-green-300' : 'bg-green-50 text-green-700'}`}>
                        <CheckCircle className="w-4 h-4 flex-shrink-0" />
                        {movePreview.can_move.length} item{movePreview.can_move.length !== 1 ? 's' : ''} ready to move
                      </div>
                    )}
                    {movePreview.conflicts.length > 0 && (
                      <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${isDarkMode ? 'bg-yellow-900 text-yellow-300' : 'bg-yellow-50 text-yellow-700'}`}>
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        {movePreview.conflicts.length} name conflict{movePreview.conflicts.length !== 1 ? 's' : ''} — you'll choose how to handle them next
                      </div>
                    )}
                    {movePreview.errors.length > 0 && (
                      <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${isDarkMode ? 'bg-red-900 text-red-300' : 'bg-red-50 text-red-700'}`}>
                        <X className="w-4 h-4 flex-shrink-0" /> {movePreview.errors[0]?.reason}
                      </div>
                    )}
                    {movePreview.warnings.length > 0 && (
                      <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${isDarkMode ? 'bg-orange-900 text-orange-300' : 'bg-orange-50 text-orange-700'}`}>
                        <Info className="w-4 h-4 flex-shrink-0" /> {movePreview.warnings[0]?.reason}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {/* Header row: label + New Folder button */}
                <div className="flex items-center justify-between mb-3 px-2">
                  <p className={`text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    Select destination
                  </p>
                  <button
                    onClick={() => { setShowInlineFolderCreate(v => !v); setInlineFolderName(''); }}
                    className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
                      showInlineFolderCreate
                        ? isDarkMode ? 'bg-blue-900 border-blue-600 text-blue-300' : 'bg-blue-50 border-blue-300 text-blue-700'
                        : isDarkMode ? 'border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-gray-200' : 'border-gray-300 text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    }`}
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    New Folder
                  </button>
                </div>

                {/* Inline folder creation input */}
                {showInlineFolderCreate && (
                  <div className={`mx-2 mb-3 p-3 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                    <p className={`text-xs mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Creating inside: <span className="font-medium">{moveTargetFolderName}</span>
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={inlineFolderName}
                        onChange={e => setInlineFolderName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && inlineFolderName.trim() && !isCreatingInlineFolder) handleCreateInlineFolder();
                          if (e.key === 'Escape') { setShowInlineFolderCreate(false); setInlineFolderName(''); }
                        }}
                        placeholder="Folder name…"
                        autoFocus
                        className={`flex-1 text-sm px-3 py-1.5 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
                      />
                      <button
                        onClick={handleCreateInlineFolder}
                        disabled={!inlineFolderName.trim() || isCreatingInlineFolder}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isCreatingInlineFolder
                          ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Creating…</>
                          : <><CheckCircle className="w-3.5 h-3.5" /> Create</>
                        }
                      </button>
                      <button
                        onClick={() => { setShowInlineFolderCreate(false); setInlineFolderName(''); }}
                        className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'text-gray-500 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-200'}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                <div
                  onClick={() => selectDestination(null, 'Home (root)')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors mb-1 ${moveTargetFolderId === null ? 'bg-blue-600 text-white' : isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  <Home className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-medium">Home (root)</span>
                </div>
                {folderTreeLoading ? (
                  <div className={`flex items-center gap-2 px-3 py-3 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    <Loader className="w-4 h-4 animate-spin" /> Loading folders…
                  </div>
                ) : (
                  folderTree.map(node => (
                    <MoveTreeNode
                      key={node.id}
                      node={node}
                      selectedId={moveTargetFolderId}
                      onSelect={selectDestination}
                      onToggle={toggleFolderInTree}
                      disabledIds={moveItems.filter(i => i.type === 'folder').map(i => i.id)}
                      isDarkMode={isDarkMode}
                    />
                  ))
                )}
              </div>
              <div className={`px-6 py-4 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'} flex gap-3`}>
                <button onClick={() => { setShowMoveModal(false); setMovePreview(null); }} className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                  Cancel
                </button>
                <button
                  onClick={() => executeMove('ask')}
                  disabled={isMoving || movePreviewLoading}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                >
                  {isMoving ? <><Loader className="w-4 h-4 animate-spin" /> Moving…</> : <><ArrowRight className="w-4 h-4" /> Move here</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ↓↓↓ NEW: CONFLICT MODAL ↓↓↓ */}
        {showConflictModal && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div className={`w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col ${isDarkMode ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`} style={{ maxHeight: '85vh' }}>
              <div className={`flex items-center justify-between px-6 py-4 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-yellow-900' : 'bg-yellow-100'}`}>
                    <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  </div>
                  <div>
                    <h3 className={`font-semibold text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      {pendingConflicts.length} Naming Conflict{pendingConflicts.length !== 1 ? 's' : ''}
                    </h3>
                    <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>These files already exist at the destination</p>
                  </div>
                </div>
                <button onClick={() => { setShowConflictModal(false); setPendingConflicts([]); setConflictDecisions({}); }} className={`p-2 rounded-lg ${isDarkMode ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              {pendingConflicts.length > 1 && (
                <div className={`px-6 py-3 border-b ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs mr-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Apply to all:</span>
                    {(['overwrite', 'version', 'skip'] as const).map(s => (
                      <button key={s} onClick={() => applyAllConflicts(s)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          s === 'overwrite' ? isDarkMode ? 'bg-red-900 border-red-700 text-red-300 hover:bg-red-800' : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                          : s === 'version' ? isDarkMode ? 'bg-blue-900 border-blue-700 text-blue-300 hover:bg-blue-800' : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                          : isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'
                        }`}>
                        {s === 'overwrite' ? 'Overwrite all' : s === 'version' ? 'Version all' : 'Skip all'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {pendingConflicts.map(conflict => {
                  const decided = conflictDecisions[conflict.id];
                  return (
                    <div key={conflict.id} className={`rounded-xl border p-4 ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
                      <div className="flex items-start gap-3 mb-3">
                        <FileText className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-sm truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{conflict.name}</p>
                          <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Already exists at destination</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { key: 'overwrite' as const, label: 'Overwrite', icon: <Copy className="w-4 h-4" />, active: 'bg-red-600 text-white border-red-600' },
                          { key: 'version' as const,   label: 'New version', icon: <Layers className="w-4 h-4" />, active: 'bg-blue-600 text-white border-blue-600' },
                          { key: 'skip' as const,      label: 'Skip', icon: <X className="w-4 h-4" />, active: isDarkMode ? 'bg-gray-600 text-white border-gray-600' : 'bg-gray-700 text-white border-gray-700' }
                        ]).map(s => (
                          <button key={s.key} onClick={() => applyConflictDecision(conflict.id, s.key)}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all ${
                              decided === s.key ? s.active : isDarkMode ? 'border-gray-600 text-gray-400 hover:border-gray-500' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                            }`}>
                            {s.icon}
                            <span className="text-xs font-medium">{s.label}</span>
                          </button>
                        ))}
                      </div>
                      {decided && (
                        <p className={`mt-2 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          ✓ {decided === 'overwrite' ? 'Replace existing. Previous version saved.' : decided === 'version' ? 'Keep both as versions.' : "This file won't be moved."}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className={`px-6 py-4 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'} flex gap-3`}>
                <button onClick={() => { setShowConflictModal(false); setPendingConflicts([]); setConflictDecisions({}); }} className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                  Cancel
                </button>
                <button onClick={confirmConflicts} disabled={pendingConflicts.some(c => !conflictDecisions[c.id])}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {pendingConflicts.filter(c => !conflictDecisions[c.id]).length > 0
                    ? `${pendingConflicts.filter(c => !conflictDecisions[c.id]).length} left to decide`
                    : <><CheckCircle className="w-4 h-4" /> Confirm Move</>
                  }
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ↓↓↓ NEW: UNDO TOAST ↓↓↓ */}
        {undoToast?.visible && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4">
            <div className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl shadow-2xl border ${isDarkMode ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isDarkMode ? 'bg-green-900' : 'bg-green-100'}`}>
                <CheckCircle className="w-4 h-4 text-green-500" />
              </div>
              <p className="flex-1 text-sm font-medium truncate">{undoToast.message}</p>
              <button onClick={() => handleUndoMove(undoToast.batchId)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${isDarkMode ? 'bg-blue-900 text-blue-300 hover:bg-blue-800' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>
                <Undo2 className="w-3.5 h-3.5" /> Undo
              </button>
              <button onClick={() => setUndoToast(null)} className={`p-1.5 rounded-lg flex-shrink-0 ${isDarkMode ? 'text-gray-500 hover:bg-gray-800' : 'text-gray-400 hover:bg-gray-100'}`}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ↓↓↓ NEW: MOVE HISTORY MODAL ↓↓↓ */}
        {showHistoryModal && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div className={`w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col ${isDarkMode ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`} style={{ maxHeight: '85vh' }}>
              <div className={`flex items-center justify-between px-6 py-4 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-purple-900' : 'bg-purple-100'}`}>
                    <History className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <h3 className={`font-semibold text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Move History</h3>
                    <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Last {moveHistory.length} move{moveHistory.length !== 1 ? 's' : ''} — undoable within 24 hours</p>
                  </div>
                </div>
                <button onClick={() => setShowHistoryModal(false)} className={`p-2 rounded-lg ${isDarkMode ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {historyLoading ? (
                  <div className="flex items-center justify-center py-12 gap-3">
                    <Loader className="w-5 h-5 animate-spin text-blue-500" />
                    <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Loading history…</span>
                  </div>
                ) : moveHistory.length === 0 ? (
                  <div className={`text-center py-12 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No move history yet</p>
                    <p className="text-sm mt-1">Your moves will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {moveHistory.map(batch => {
                      const isExpanded = expandedBatch === batch.batch_id;
                      const movedAt = new Date(batch.moved_at);
                      return (
                        <div key={batch.batch_id} className={`rounded-xl border overflow-hidden ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                          <div onClick={() => setExpandedBatch(prev => prev === batch.batch_id ? null : batch.batch_id)}
                            className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isDarkMode ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-50 hover:bg-gray-100'}`}>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${batch.undone ? isDarkMode ? 'bg-gray-700' : 'bg-gray-200' : batch.can_undo ? isDarkMode ? 'bg-blue-900' : 'bg-blue-100' : isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                              {batch.undone ? <RotateCcw className="w-4 h-4 text-gray-400" /> : <Move className={`w-4 h-4 ${batch.can_undo ? 'text-blue-500' : 'text-gray-400'}`} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Moved {batch.item_count} item{batch.item_count !== 1 ? 's' : ''}</p>
                                {batch.undone && <span className={`text-xs px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500'}`}>Undone</span>}
                                {batch.can_undo && !batch.undone && <span className={`text-xs px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-blue-900 text-blue-300' : 'bg-blue-100 text-blue-700'}`}>Can undo</span>}
                              </div>
                              <div className={`flex items-center gap-2 text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                <Clock className="w-3 h-3" />
                                {movedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {movedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                {batch.can_undo && <span className="text-blue-400">· expires in {batch.expires_in}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {batch.can_undo && !batch.undone && (
                                <button onClick={e => { e.stopPropagation(); handleUndoMove(batch.batch_id); }}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${isDarkMode ? 'bg-blue-900 text-blue-300 hover:bg-blue-800' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>
                                  <Undo2 className="w-3.5 h-3.5" /> Undo
                                </button>
                              )}
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                            </div>
                          </div>
                          {isExpanded && (
                            <div className={`divide-y ${isDarkMode ? 'divide-gray-700' : 'divide-gray-100'}`}>
                              {batch.items.map(item => (
                                <div key={item.id} className={`flex items-center gap-3 px-4 py-2.5 ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
                                  {item.item_type === 'folder' ? <Folder className="w-4 h-4 text-blue-400 flex-shrink-0" /> : <File className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                                  <span className={`text-sm flex-1 min-w-0 truncate ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{item.item_name}</span>
                                  <div className={`flex items-center gap-1.5 text-xs flex-shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                    <span className="truncate max-w-[80px]">{item.from_folder}</span>
                                    <ArrowRight className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate max-w-[80px]">{item.to_folder}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className={`px-6 py-4 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <button onClick={() => setShowHistoryModal(false)} className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

// ↓↓↓ NEW: FOLDER TREE NODE COMPONENT (used inside Move Modal) ↓↓↓
const MoveTreeNode: React.FC<{
  node: FolderNode;
  selectedId: string | null;
  onSelect: (id: string, name: string) => void;
  onToggle: (id: string, name: string, isOpen: boolean) => void;
  disabledIds: string[];
  isDarkMode: boolean;
  depth?: number;
}> = ({ node, selectedId, onSelect, onToggle, disabledIds, isDarkMode, depth = 0 }) => {
  const isSelected = selectedId === node.id;
  const isDisabled = disabledIds.includes(node.id);
  const hasChildren = !node.isLoaded || (node.children && node.children.length > 0);

  return (
    <div>
      <div
        style={{ paddingLeft: `${12 + (depth * 20)}px` }}
        onClick={() => !isDisabled && onSelect(node.id, node.name)}
        className={`flex items-center gap-2 pr-3 py-2 rounded-lg cursor-pointer transition-colors select-none ${
          isSelected ? 'bg-blue-600 text-white'
          : isDisabled ? `${isDarkMode ? 'text-gray-600' : 'text-gray-300'} cursor-not-allowed opacity-50`
          : isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        <button
          onClick={e => { e.stopPropagation(); if (!isDisabled) onToggle(node.id, node.name, !!node.isOpen); }}
          className="w-4 h-4 flex-shrink-0 flex items-center justify-center"
        >
          {hasChildren
            ? node.isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
            : <span className="w-4" />
          }
        </button>
        {node.isOpen
          ? <FolderOpen className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-white' : 'text-blue-400'}`} />
          : <Folder className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-white' : 'text-blue-400'}`} />
        }
        <span className="text-sm truncate flex-1">{node.name}</span>
        {isDisabled && <span className={`text-xs ml-auto flex-shrink-0 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`}>can't move here</span>}
      </div>
      {node.isOpen && node.children && node.children.map(child => (
        <MoveTreeNode key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} onToggle={onToggle} disabledIds={disabledIds} isDarkMode={isDarkMode} depth={(depth || 0) + 1} />
      ))}
    </div>
  );
};

export default Files;