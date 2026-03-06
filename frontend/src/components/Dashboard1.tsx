import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Users,
  HardDrive,
  Upload,
  Download,
  Share2,
  TrendingUp,
  TrendingDown,
  Clock,
  Star,
  Folder,
  Image,
  File,
  MoreHorizontal,
  Activity,
  Calendar,
  User,
  FolderPlus,
  Edit3,
  Trash2,
  Copy,
  Move,
  RefreshCw,
  Search,
  X,
  Eye
} from 'lucide-react';
import { useDarkMode } from '../contexts/DarkModeContext';

interface User {
  id?: string | number;
  name: string;
  user_name: string;
  department?: string;
  role: string;
}

interface DashboardProps {
  currentUser: User;
}

interface DashboardStats {
  totalFiles: number;
  totalFolders: number;
  totalSize: number;
  totalSizeFormatted: string;
  fileTypes: Array<{
    file_type: string;
    count: number;
    total_size: number;
  }>;
}

interface ActivityLog {
  id: number;
  user_id: number;
  user_name: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'DOWNLOAD' | 'COPY' | 'MOVE' | 'RENAME' | 'SHARED';
  target_type: 'FILE' | 'FOLDER';
  target_id: number | null;
  target_name: string;
  additional_info: string | null;
  created_at: string;
}

interface SharedFile {
  id: number;
  file_name: string;
  original_name?: string;
  file_size: number;
  file_type: string;
  owner_name: string;
  owner_email: string;
  shared_at: string;
  source_type: 'regular' | 'category';
  category_name?: string;
  department_name?: string;
  shared_by?: string;
  shared_by_name?: string;
}

export default function Dashboard({ currentUser }: DashboardProps) {
  const { isDarkMode } = useDarkMode();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivities, setRecentActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([]);
  const [sharedLoading, setSharedLoading] = useState(false);

  const [showFilePreviewModal, setShowFilePreviewModal] = useState(false);
  const [previewFile, setPreviewFile] = useState<SharedFile | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'size'>('recent');
  const [filterType, setFilterType] = useState<'all' | 'pdf' | 'doc' | 'image'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<SharedFile | null>(null);

  const API_BASE = 'http://localhost:3002/api/files';

  // Load dashboard data
  useEffect(() => {
    loadDashboardData();
  }, []);

  // Safety timeout for preview loading
  useEffect(() => {
    if (previewLoading && showFilePreviewModal) {
      const timeoutId = setTimeout(() => {
        console.warn('⚠️ Preview loading timeout - forcing stop');
        setPreviewLoading(false);
      }, 8000); // 8 second timeout
      
      return () => clearTimeout(timeoutId);
    }
  }, [previewLoading, showFilePreviewModal]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load statistics
      const statsResponse = await fetch(`${API_BASE}/stats`);
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData);
      }

      // Load real activity logs
      await loadActivityLogs();
      
      // Load shared files
      await loadSharedFiles();
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const loadActivityLogs = async () => {
    try {
      setActivityLoading(true);
      
      const response = await fetch(`${API_BASE}/activity-logs?limit=10&offset=0`);
      if (response.ok) {
        const data = await response.json();
        setRecentActivities(data.logs || []);
      } else {
        console.error('Failed to fetch activity logs');
      }
    } catch (err) {
      console.error('Error loading activity logs:', err);
    } finally {
      setActivityLoading(false);
    }
  };

  const loadSharedFiles = async () => {
    try {
      setSharedLoading(true);
      
      const response = await fetch('http://localhost:3002/api/share/shared-with-me', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSharedFiles(data.data || []);
      } else {
        console.error('Failed to fetch shared files');
      }
    } catch (err) {
      console.error('Error loading shared files:', err);
    } finally {
      setSharedLoading(false);
    }
  };

  const getFileIcon = (fileType: string) => {
    if (fileType === 'pdf') {
      return <FileText className="w-4 h-4 text-red-600" />;
    } else if (['doc', 'docx', 'txt'].includes(fileType)) {
      return <FileText className="w-4 h-4 text-blue-600" />;
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileType)) {
      return <Image className="w-4 h-4 text-purple-600" />;
    } else if (['xls', 'xlsx', 'csv'].includes(fileType)) {
      return <FileText className="w-4 h-4 text-green-600" />;
    }
    return <File className="w-4 h-4 text-gray-600" />;
  };

  const getFileTypeColor = (fileType: string) => {
    if (fileType === 'pdf') return 'bg-red-100 text-red-700';
    if (['doc', 'docx', 'txt'].includes(fileType)) return 'bg-blue-100 text-blue-700';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileType)) return 'bg-purple-100 text-purple-700';
    if (['xls', 'xlsx', 'csv'].includes(fileType)) return 'bg-green-100 text-green-700';
    return 'bg-gray-100 dark:bg-gray-700 text-gray-700';
  };

  const getProcessedSharedFiles = () => {
    let processed = [...sharedFiles];

    if (searchQuery.trim()) {
      processed = processed.filter(file =>
        (file.file_name || file.original_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        file.owner_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (filterType !== 'all') {
      const filterMap = {
        pdf: ['pdf'],
        doc: ['doc', 'docx', 'txt'],
        image: ['jpg', 'jpeg', 'png', 'gif', 'webp']
      };
      processed = processed.filter(f =>
        filterMap[filterType as keyof typeof filterMap].includes(f.file_type)
      );
    }

    processed.sort((a, b) => {
      if (sortBy === 'recent') {
        return new Date(b.shared_at).getTime() - new Date(a.shared_at).getTime();
      }
      if (sortBy === 'name') {
        return (a.file_name || '').localeCompare(b.file_name || '');
      }
      if (sortBy === 'size') {
        return b.file_size - a.file_size;
      }
      return 0;
    });

    return processed;
  };

  const handleDownloadSharedFile = async (file: SharedFile) => {
    try {
      const endpoint = file.source_type === 'category' 
        ? `http://localhost:3002/api/categories/files/${file.id}/download`
        : `http://localhost:3002/api/files/download/${file.id}`;
      
      const response = await fetch(`${endpoint}?user_id=${currentUser.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.file_name || file.original_name || 'download';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert('Failed to download file. You may not have access.');
      }
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Failed to download file');
    }
  };

  const handleViewFile = (file: SharedFile) => {
    setSelectedFile(file);
    setShowModal(true);
  };

  const getActivityIcon = (action: string, targetType: 'FILE' | 'FOLDER') => {
    switch (action) {
      case 'CREATE':
      case 'CREATED':
        return targetType === 'FOLDER' ? (
          <FolderPlus className="w-4 h-4" />
        ) : (
          <Upload className="w-4 h-4" />
        );
      case 'UPDATE':
      case 'RENAME':
        return <Edit3 className="w-4 h-4" />;
      case 'DELETE':
      case 'DELETED':
        return <Trash2 className="w-4 h-4" />;
      case 'DOWNLOAD':
      case 'DOWNLOADED':
        return <Download className="w-4 h-4" />;
      case 'UPLOAD':
      case 'UPLOADED':
        return <Upload className="w-4 h-4" />;
      case 'COPY':
        return <Copy className="w-4 h-4" />;
      case 'MOVE':
        return <Move className="w-4 h-4" />;
      case 'SHARED':
        return <Share2 className="w-4 h-4" />;
      default:
        return targetType === 'FOLDER' ? (
          <Folder className="w-4 h-4" />
        ) : (
          <File className="w-4 h-4" />
        );
    }
  };

  const getActionDescription = (action: string, targetType: 'FILE' | 'FOLDER', targetName: string) => {
    const itemType = targetType.toLowerCase();
    
    switch (action) {
      case 'CREATE':
      case 'CREATED':
        return `created ${itemType} "${targetName}"`;
      case 'UPDATE':
        return `updated ${itemType} "${targetName}"`;
      case 'RENAME':
        return `renamed ${itemType} "${targetName}"`;
      case 'DELETE':
      case 'DELETED':
        return `deleted ${itemType} "${targetName}"`;
      case 'DOWNLOAD':
      case 'DOWNLOADED':
        return `downloaded file "${targetName}"`;
      case 'UPLOAD':
      case 'UPLOADED':
        return `uploaded file "${targetName}"`;
      case 'COPY':
        return `copied ${itemType} "${targetName}"`;
      case 'MOVE':
        return `moved ${itemType} "${targetName}"`;
      case 'SHARED':
        return `shared file "${targetName}"`;
      default:
        return `performed action on ${itemType} "${targetName}"`;
    }
  };
  
  const getActivityBadge = (action: string, targetType: 'FILE' | 'FOLDER') => {
    const getBadgeClasses = (color: string) => 
      `text-${color}-600 text-xs ml-2 bg-${color}-100 px-2 py-1 rounded-full`;

    switch (action) {
      case 'CREATE':
        return (
          <span className={getBadgeClasses('green')}>
            {targetType === 'FOLDER' ? 'Created' : 'Uploaded'}
          </span>
        );
      case 'UPDATE':
      case 'RENAME':
        return <span className={getBadgeClasses('orange')}>Modified</span>;
      case 'DELETE':
        return <span className={getBadgeClasses('red')}>Deleted</span>;
      case 'DOWNLOAD':
        return <span className={getBadgeClasses('purple')}>Downloaded</span>;
      case 'COPY':
        return <span className={getBadgeClasses('indigo')}>Copied</span>;
      case 'MOVE':
        return <span className={getBadgeClasses('teal')}>Moved</span>;
      case 'SHARED':
        return <span className={getBadgeClasses('blue')}>Shared</span>;
      default:
        return null;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTimeAgo = (dateString: string): string => {
    const now = new Date();
    const date = new Date(dateString);
    const diff = now.getTime() - date.getTime();
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
  };

  const canPreviewFile = (fileType: string) => {
    if (!fileType) return false;
    const type = fileType.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'pdf', 'txt', 'csv', 'json', 'xml', 'html', 'css', 'js', 'md'].includes(type);
  };

  const handlePreviewFile = (file: SharedFile) => {
    console.log('🔍 Opening preview for file:', file);
    setPreviewFile(file);
    setPreviewLoading(true);
    setPreviewError(null);
    setShowFilePreviewModal(true);
  };

  const renderFilePreview = () => {
    if (!previewFile) return null;
    
    const fileType = previewFile.file_type?.toLowerCase();
    
    // ✅ FIXED: Correct preview URL format
    const previewUrl = previewFile.source_type === 'category' 
      ? `http://localhost:3002/api/categories/files/${previewFile.id}/preview?user_id=${currentUser.id}`
      : `http://localhost:3002/api/files/preview/${previewFile.id}?user_id=${currentUser.id}`;
    
    // Image files
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(fileType || '')) {
      return (
        <div className="relative">
          {previewLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <span className="text-sm text-gray-600">Loading image...</span>
              </div>
            </div>
          )}
          <img 
            src={previewUrl}
            alt={previewFile.file_name}
            className="max-w-full max-h-[500px] object-contain mx-auto"
            onLoad={() => {
              console.log('✅ Image loaded successfully');
              setPreviewLoading(false);
            }}
            onError={(e) => {
              console.error('❌ Image load error:', e);
              setPreviewLoading(false);
            }}
            style={{ display: previewLoading ? 'none' : 'block' }}
          />
        </div>
      );
    }
    
    // PDF files
    if (fileType === 'pdf') {
      return (
        <div className="relative h-[600px]">
          {previewLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded z-10">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <span className="text-sm text-gray-600">Loading PDF...</span>
              </div>
            </div>
          )}
          <iframe
            src={`${previewUrl}&token=${localStorage.getItem('token')}`}
            className="w-full h-full border-0 rounded"
            onLoad={() => {
              console.log('✅ PDF loaded successfully');
              setTimeout(() => setPreviewLoading(false), 500);
            }}
            onError={() => {
              console.error('❌ PDF iframe error');
              setPreviewLoading(false);
            }}
          />
        </div>
      );
    }
    
    // Text files
    if (['txt', 'csv', 'json', 'xml', 'html', 'css', 'js', 'md'].includes(fileType || '')) {
      return (
        <div className="relative h-[500px]">
          {previewLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded z-10">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <span className="text-sm text-gray-600">Loading file...</span>
              </div>
            </div>
          )}
          <iframe
            src={`${previewUrl}&token=${localStorage.getItem('token')}`}
            className="w-full h-full border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800"
            onLoad={() => {
              console.log('✅ Text file loaded successfully');
              setTimeout(() => setPreviewLoading(false), 300);
            }}
            onError={() => {
              console.error('❌ Text file iframe error');
              setPreviewLoading(false);
            }}
          />
        </div>
      );
    }
    
    // Fallback for unsupported types
    setPreviewLoading(false);
    return (
      <div className="text-center py-8">
        <File className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">Preview not available for this file type</p>
        <button 
          onClick={() => handleDownloadSharedFile(previewFile)}
          className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors mx-auto"
        >
          <Download className="w-4 h-4" />
          Download to View
        </button>
      </div>
    );
  };

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'upload':
      case 'folder':
      case 'share':
        navigate('/files');
        break;
      case 'reports':
        console.log('Reports feature coming soon');
        break;
    }
  };

  const handleRefreshActivity = async () => {
    await loadActivityLogs();
  };

  const processedSharedFiles = getProcessedSharedFiles();

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2 dark:text-white">Dashboard</h2>
          <p className="text-gray-600 dark:text-gray-400">Loading dashboard data...</p>
        </div>
        <div className="animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-gray-200 dark:bg-gray-700 rounded-xl h-32"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2 dark:text-white">Dashboard</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Welcome back, {currentUser.name}! Here's what's happening with your files today.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Files</h3>
              <p className="text-2xl font-bold mt-2 text-gray-900 dark:text-white">
                {stats?.totalFiles || 0}
              </p>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">Storage Used</h3>
              <p className="text-2xl font-bold mt-2 text-gray-900 dark:text-white">
                {stats?.totalSizeFormatted || '0 Bytes'}
              </p>
              <div className="flex items-center mt-2 text-sm">
                <span className="text-gray-500 dark:text-gray-400">Total storage</span>
              </div>
            </div>
            <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
              <HardDrive className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Folders</h3>
              <p className="text-2xl font-bold mt-2 text-gray-900 dark:text-white">
                {stats?.totalFolders || 0}
              </p>
              <div className="flex items-center mt-2 text-sm">
                <span className="text-gray-500 dark:text-gray-400">Folders created</span>
              </div>
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <Folder className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">File Types</h3>
              <p className="text-2xl font-bold mt-2 text-gray-900 dark:text-white">
                {stats?.fileTypes?.length || 0}
              </p>
              <span className="text-gray-500 dark:text-gray-400">Different types</span>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg">
              <File className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Storage Usage Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Storage Usage by Type</h3>
            <button className="text-gray-400 hover:text-gray-600">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>

          {stats?.fileTypes && stats.fileTypes.length > 0 ? (
            <div className="space-y-4">
              {stats.fileTypes.slice(0, 5).map((fileType, index) => {
                const percentage = stats.totalSize > 0 
                  ? Math.round((fileType.total_size / stats.totalSize) * 100) 
                  : 0;
                const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-red-500'];
                
                return (
                  <div key={fileType.file_type}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 ${colors[index % colors.length]} rounded`}></div>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200 capitalize">
                          {fileType.file_type || 'Unknown'} Files
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {formatFileSize(fileType.total_size)}
                        </div>
                        <div className="text-xs text-gray-500">{percentage}%</div>
                      </div>
                    </div>
                    <div className="bg-gray-200 rounded-full h-2 mt-2">
                      <div 
                        className={`${colors[index % colors.length]} h-2 rounded-full`} 
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <File className="w-12 h-12 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
              <p>No file data available</p>
            </div>
          )}
        </div>

        {/* Shared With Me - Enhanced */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Shared With Me</h3>
              <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-1 rounded-full">
                {sharedFiles.length}
              </span>
            </div>
            <button 
              onClick={loadSharedFiles}
              disabled={sharedLoading}
              className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 font-medium p-1 rounded hover:bg-gray-100 dark:bg-gray-700 disabled:opacity-50"
              title="Refresh shared files"
            >
              <RefreshCw className={`w-4 h-4 ${sharedLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {sharedFiles.length > 0 && (
            <div className="mb-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search files or owners..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-9 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="flex-1 px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-800 hover:border-gray-400 focus:outline-none focus:border-blue-500"
                >
                  <option value="recent">Sort: Recent</option>
                  <option value="name">Sort: Name</option>
                  <option value="size">Sort: Size</option>
                </select>

                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as any)}
                  className="flex-1 px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-800 hover:border-gray-400 focus:outline-none focus:border-blue-500"
                >
                  <option value="all">Type: All</option>
                  <option value="pdf">Type: PDF</option>
                  <option value="doc">Type: Documents</option>
                  <option value="image">Type: Images</option>
                </select>
              </div>
            </div>
          )}

          <div className="h-80 overflow-y-auto overflow-x-hidden">
            {sharedLoading && (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-4 h-4 animate-spin text-gray-500" />
                <span className="ml-2 text-sm text-gray-500">Loading shared files...</span>
              </div>
            )}
            
            {!sharedLoading && processedSharedFiles.length > 0 && (
              <div className="space-y-3 pr-2">
                {processedSharedFiles.slice(0, 10).map((file) => (
                  <div 
                    key={`${file.source_type}-${file.id}`}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-900 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 dark:text-white text-base truncate">
                            {file.file_name || file.original_name}
                          </h3>
                          <div className="text-sm text-gray-600 dark:text-gray-300 mt-2 space-y-1">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-gray-400" />
                              <div className="flex flex-col">
                                <span>Owner: <span className="font-medium">{file.owner_name}</span></span>
                                {file.shared_by_name && file.shared_by_name !== file.owner_name && (
                                  <span className="text-gray-500">Shared by: <span className="font-medium text-gray-700">{file.shared_by_name}</span></span>
                                )}
                              </div>
                              {file.owner_email && (
                                <span className="text-gray-400">({file.owner_email})</span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 flex-wrap">
                              <span className="flex items-center gap-1">
                                <HardDrive className="w-4 h-4 text-gray-400" />
                                {formatFileSize(file.file_size)}
                              </span>
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getFileTypeColor(file.file_type)}`}>
                                {file.file_type.toUpperCase()}
                              </span>
                              <span className="flex items-center gap-1 text-gray-500">
                                <Clock className="w-4 h-4" />
                                {formatTimeAgo(file.shared_at)}
                              </span>
                            </div>
                            {file.category_name && (
                              <div className="flex items-center gap-2 text-gray-600">
                                <Folder className="w-4 h-4" />
                                <span>{file.category_name}</span>
                              </div>
                            )}
                            {file.department_name && (
                              <div className="flex items-center gap-2 text-gray-600">
                                <Users className="w-4 h-4" />
                                <span>{file.department_name}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => handlePreviewFile(file)}
                          className="p-3 hover:bg-blue-100 rounded-lg transition-colors"
                          title={canPreviewFile(file.file_type) ? "Preview file" : "Preview not available"}
                        >
                          <Eye className="w-5 h-5 text-blue-600" />
                        </button>
                        <button
                          onClick={() => handleDownloadSharedFile(file)}
                          className="p-3 hover:bg-blue-100 rounded-lg transition-colors"
                          title="Download file"
                        >
                          <Download className="w-5 h-5 text-blue-600" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!sharedLoading && processedSharedFiles.length === 0 && sharedFiles.length > 0 && (
              <div className="text-center py-8 text-gray-500">
                <File className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p className="font-medium">No files match your filter</p>
                <p className="text-sm mt-1">Try adjusting your search or filters</p>
              </div>
            )}

            {!sharedLoading && sharedFiles.length === 0 && (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400 h-full flex flex-col justify-center">
                <Share2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">No shared files</p>
                <p className="text-sm mt-1">Files shared with you will appear here</p>
              </div>
            )}
          </div>

          {/* File Preview Modal */}
          {showFilePreviewModal && previewFile && (
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[9999] p-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0">
                      {getFileIcon(previewFile.file_type)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                        {previewFile.file_name || previewFile.original_name}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {formatFileSize(previewFile.file_size)} • Shared by {previewFile.owner_name}
                      </p>
                    </div>
                  </div>
                
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    <button
                      onClick={() => {
                        console.log('Downloading from modal');
                        handleDownloadSharedFile(previewFile);
                      }}
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </button>
                    <button
                      onClick={() => {
                        console.log('Closing preview modal');
                        setShowFilePreviewModal(false);
                        setPreviewFile(null);
                        setPreviewLoading(false);
                      }}
                      className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-300 rounded-md transition-colors"
                      aria-label="Close preview"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              
                <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
                  {previewLoading ? (
                    <div className="flex items-center justify-center h-full min-h-[400px]">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <span className="text-gray-600 dark:text-gray-300 font-medium">Loading preview...</span>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">This may take a few moments</p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6">
                      {canPreviewFile(previewFile.file_type) ? (
                        renderFilePreview()
                      ) : (
                        <div className="text-center py-12">
                          <File className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                          <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Preview Not Available</h4>
                          <p className="text-gray-600 dark:text-gray-300 mb-6 max-w-md mx-auto">
                            This file type ({previewFile.file_type.toUpperCase()}) cannot be previewed in the browser. Download the file to view its contents.
                          </p>
                          <button
                            onClick={() => handleDownloadSharedFile(previewFile)}
                            className="inline-flex items-center gap-2 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                            Download File
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {processedSharedFiles.length > 10 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <button 
                onClick={() => setShowModal(true)}
                className="w-full text-center text-sm text-blue-600 hover:text-blue-700 font-medium py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
              >
                View All Shared Files ({sharedFiles.length})
              </button>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <button 
              onClick={() => handleQuickAction('upload')}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-900 rounded-lg transition-colors"
            >
              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <Upload className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <div className="font-medium text-gray-900 dark:text-white">Upload Files</div>
                <div className="text-sm text-gray-500">Add new documents</div>
              </div>
            </button>

            <button 
              onClick={() => handleQuickAction('folder')}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-900 rounded-lg transition-colors"
            >
              <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <FolderPlus className="w-4 h-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="font-medium text-gray-900 dark:text-white">Create Folder</div>
                <div className="text-sm text-gray-500">Organize your files</div>
              </div>
            </button>

            <button 
              onClick={() => handleQuickAction('share')}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-900 rounded-lg transition-colors"
            >
              <div className="p-2 bg-purple-50 rounded-lg">
                <Share2 className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <div className="font-medium text-gray-900 dark:text-white">Manage Files</div>
                <div className="text-sm text-gray-500">Go to file manager</div>
              </div>
            </button>

            <button 
              onClick={() => handleQuickAction('reports')}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-900 rounded-lg transition-colors"
            >
              <div className="p-2 bg-orange-50 rounded-lg">
                <Activity className="w-4 h-4 text-orange-600" />
              </div>
              <div>
                <div className="font-medium text-gray-900 dark:text-white">View Reports</div>
                <div className="text-sm text-gray-500">Analyze usage data</div>
              </div>
            </button>
          </div>
        </div>

      </div>

      {/* Recent Activity and Analytics Section */}
      <div className="grid grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Activity</h3>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleRefreshActivity}
                disabled={activityLoading}
                className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 font-medium px-2 py-1 rounded hover:bg-gray-100 dark:bg-gray-700 disabled:opacity-50"
                title="Refresh activities"
              >
                <RefreshCw className={`w-3 h-3 ${activityLoading ? 'animate-spin' : ''}`} />
                {activityLoading ? 'Refreshing...' : 'Refresh'}
              </button>
              <button 
                onClick={() => navigate('/files')}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                View All Files
              </button>
            </div>
          </div>
          
          <div className="h-80 overflow-y-auto overflow-x-hidden">
            {activityLoading && (
              <div className="flex items-center justify-center py-4">
                <RefreshCw className="w-4 h-4 animate-spin text-gray-500" />
                <span className="ml-2 text-sm text-gray-500">Loading activities...</span>
              </div>
            )}
            
            {!activityLoading && recentActivities.length > 0 && (
              <div className="space-y-4 pr-2">
                {recentActivities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className={`p-1.5 rounded-full mt-1 flex-shrink-0 ${
                      activity.action === 'DELETE' || activity.action === 'DELETED'
                        ? 'bg-red-100' 
                        : activity.action === 'CREATE' || activity.action === 'CREATED' || activity.action === 'UPLOAD' || activity.action === 'UPLOADED'
                        ? 'bg-green-100'
                        : activity.action === 'DOWNLOAD' || activity.action === 'DOWNLOADED'
                        ? 'bg-blue-100'
                        : activity.action === 'UPDATE' || activity.action === 'RENAME'
                        ? 'bg-orange-100'
                        : activity.action === 'COPY'
                        ? 'bg-indigo-100'
                        : activity.action === 'MOVE'
                        ? 'bg-teal-100'
                        : activity.action === 'SHARED'
                        ? 'bg-blue-100'
                        : 'bg-gray-100'
                    }`}>
                      {getActivityIcon(activity.action, activity.target_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900 dark:text-white">
                        <span className="font-medium">{activity.user_name}</span>{' '}
                        {getActionDescription(activity.action, activity.target_type, activity.target_name)}
                        {' '}
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          activity.action === 'DELETE' || activity.action === 'DELETED'
                            ? 'bg-red-100 text-red-700' 
                            : activity.action === 'CREATE' || activity.action === 'CREATED'
                            ? 'bg-green-100 text-green-700'
                            : activity.action === 'UPLOAD' || activity.action === 'UPLOADED'
                            ? 'bg-green-100 text-green-700'
                            : activity.action === 'DOWNLOAD' || activity.action === 'DOWNLOADED'
                            ? 'bg-blue-100 text-blue-700'
                            : activity.action === 'UPDATE'
                            ? 'bg-orange-100 text-orange-700'
                            : activity.action === 'RENAME'
                            ? 'bg-orange-100 text-orange-700'
                            : activity.action === 'COPY'
                            ? 'bg-indigo-100 text-indigo-700'
                            : activity.action === 'MOVE'
                            ? 'bg-teal-100 text-teal-700'
                            : activity.action === 'SHARED'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700'
                        }`}>
                          {activity.action === 'DELETE' || activity.action === 'DELETED' ? 'Deleted' : 
                          activity.action === 'UPLOAD' || activity.action === 'UPLOADED' ? 'Uploaded' :
                          activity.action === 'CREATE' || activity.action === 'CREATED' ? 'Created' :
                          activity.action === 'DOWNLOAD' || activity.action === 'DOWNLOADED' ? 'Downloaded' : 
                          activity.action === 'UPDATE' ? 'Updated' :
                          activity.action === 'RENAME' ? 'Renamed' :
                          activity.action === 'COPY' ? 'Copied' :
                          activity.action === 'MOVE' ? 'Moved' :
                          activity.action === 'SHARED' ? 'Shared' :
                          activity.action}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-1 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                        <Clock className="w-3 h-3 flex-shrink-0" />
                        {formatTimeAgo(activity.created_at)}
                        <span className="ml-2">
                          • {activity.target_type === 'FOLDER' ? 'Folder' : 'File'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!activityLoading && recentActivities.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400 h-full flex flex-col justify-center">
                <Activity className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>No recent activity</p>
                <button 
                  onClick={() => navigate('/files')}
                  className="mt-2 text-blue-600 hover:text-blue-700 font-medium"
                >
                  Upload your first file
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Analytics & Insights Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Analytics & Insights</h3>
            <button 
              onClick={() => handleQuickAction('reports')}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              View Details
            </button>
          </div>
          
          <div className="h-80 overflow-y-auto overflow-x-hidden pr-2 space-y-6">
            {/* User Activity Summary */}
            <div className="border-b border-gray-100 dark:border-gray-700 pb-4">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" />
                User Activity Summary
              </h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-300">Active Today</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {new Set(recentActivities.map(a => a.user_name)).size} users
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-300">Total Actions</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {recentActivities.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-300">Most Active</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {recentActivities.length > 0 
                      ? Object.entries(
                          recentActivities.reduce((acc, curr) => {
                            acc[curr.user_name] = (acc[curr.user_name] || 0) + 1;
                            return acc;
                          }, {} as Record<string, number>)
                        ).sort((a, b) => b[1] - a[1])[0]?.[1] || 0
                      : 0} actions
                  </span>
                </div>
              </div>
            </div>

            {/* Action Breakdown */}
            <div className="border-b border-gray-100 dark:border-gray-700 pb-4">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-green-600" />
                Action Breakdown
              </h4>
              <div className="space-y-3">
                {(() => {
                  const actionCounts = recentActivities.reduce((acc, curr) => {
                    const normalizedAction = curr.action === 'UPLOADED' || curr.action === 'UPLOAD' ? 'UPLOAD' :
                                           curr.action === 'DOWNLOADED' || curr.action === 'DOWNLOAD' ? 'DOWNLOAD' :
                                           curr.action === 'CREATED' || curr.action === 'CREATE' ? 'CREATE' :
                                           curr.action === 'DELETED' || curr.action === 'DELETE' ? 'DELETE' :
                                           curr.action;
                    acc[normalizedAction] = (acc[normalizedAction] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>);
                  
                  const total = recentActivities.length || 1;
                  
                  return Object.entries(actionCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([action, count]) => {
                      const percentage = Math.round((count / total) * 100);
                      const colors = {
                        'UPLOAD': 'bg-green-500',
                        'DOWNLOAD': 'bg-blue-500',
                        'DELETE': 'bg-red-500',
                        'CREATE': 'bg-purple-500',
                        'UPDATE': 'bg-orange-500',
                        'RENAME': 'bg-yellow-500',
                        'COPY': 'bg-indigo-500',
                        'MOVE': 'bg-teal-500'
                      };
                      
                      return (
                        <div key={action}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-200 capitalize">
                              {action.toLowerCase()}s
                            </span>
                            <span className="text-xs text-gray-600 dark:text-gray-400">{count} ({percentage}%)</span>
                          </div>
                          <div className="bg-gray-200 rounded-full h-1.5">
                            <div 
                              className={`${colors[action as keyof typeof colors] || 'bg-gray-500'} h-1.5 rounded-full`}
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    });
                })()}
              </div>
            </div>

            {/* File Type Distribution */}
            <div className="border-b border-gray-100 dark:border-gray-700 pb-4">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                <File className="w-4 h-4 text-purple-600" />
                File Type Distribution
              </h4>
              <div className="space-y-2">
                {stats?.fileTypes && stats.fileTypes.length > 0 ? (
                  stats.fileTypes.slice(0, 3).map((fileType) => {
                    const percentage = stats.totalSize > 0 
                      ? Math.round((fileType.total_size / stats.totalSize) * 100) 
                      : 0;
                    return (
                      <div key={fileType.file_type} className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-300 capitalize">
                          {fileType.file_type || 'Unknown'}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">{fileType.count} files</span>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">{percentage}%</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-gray-500">No file data available</p>
                )}
              </div>
            </div>

            {/* Storage Insights */}
            <div className="pb-4">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-orange-600" />
                Storage Insights
              </h4>
              <div className="space-y-3">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-blue-900 dark:text-blue-100">Average File Size</div>
                        <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                        {stats && stats.totalFiles > 0 
                          ? formatFileSize(Math.round(stats.totalSize / stats.totalFiles))
                          : '0 Bytes'} per file
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-green-50 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <Folder className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-green-900">Folder Organization</div>
                      <div className="text-xs text-green-700 mt-1">
                        {stats && stats.totalFolders > 0 && stats.totalFiles > 0
                          ? `${Math.round(stats.totalFiles / stats.totalFolders)} files per folder`
                          : 'No data available'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-purple-50 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <Calendar className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-purple-900">Recent Activity</div>
                      <div className="text-xs text-purple-700 mt-1">
                        {recentActivities.length > 0
                          ? `${recentActivities.filter(a => {
                              const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
                              return new Date(a.created_at) > hourAgo;
                            }).length} actions in last hour`
                          : 'No recent activity'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal for viewing all shared files */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-screen overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Share2 className="w-6 h-6 text-blue-600" />
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">All Shared Files</h2>
                  <p className="text-sm text-gray-500">{processedSharedFiles.length} files</p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 dark:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-6 h-6 text-gray-600" />
              </button>
            </div>

            {/* Modal Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-3">
                {processedSharedFiles.length > 0 ? (
                  processedSharedFiles.map((file) => (
                    <div 
                      key={`${file.source_type}-${file.id}`}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 flex-1 min-w-0">
                          {/* File Icon */}
                          <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg flex-shrink-0">
                            {getFileIcon(file.file_type)}
                          </div>
                          
                          {/* File Info */}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 dark:text-white text-base truncate">
                              {file.file_name || file.original_name}
                            </h3>
                            <div className="text-sm text-gray-600 dark:text-gray-300 mt-2 space-y-1">
                              <div className="flex items-center gap-2">
                                <User className="w-4 h-4 text-gray-400" />
                                <span>{file.owner_name}</span>
                                {file.owner_email && (
                                  <span className="text-gray-400">({file.owner_email})</span>
                                )}
                              </div>
                              <div className="flex items-center gap-4 flex-wrap">
                                <span className="flex items-center gap-1">
                                  <HardDrive className="w-4 h-4 text-gray-400" />
                                  {formatFileSize(file.file_size)}
                                </span>
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getFileTypeColor(file.file_type)}`}>
                                  {file.file_type.toUpperCase()}
                                </span>
                                <span className="flex items-center gap-1 text-gray-500">
                                  <Clock className="w-4 h-4" />
                                  {formatTimeAgo(file.shared_at)}
                                </span>
                              </div>
                              {file.category_name && (
                                <div className="flex items-center gap-2 text-gray-600">
                                  <Folder className="w-4 h-4" />
                                  <span>{file.category_name}</span>
                                </div>
                              )}
                              {file.department_name && (
                                <div className="flex items-center gap-2 text-gray-600">
                                  <Users className="w-4 h-4" />
                                  <span>{file.department_name}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => {
                              setShowModal(false);
                              handlePreviewFile(file);
                            }}
                            className="p-3 hover:bg-blue-100 rounded-lg transition-colors"
                            title="Preview file"
                          >
                            <Eye className="w-5 h-5 text-blue-600" />
                          </button>
                          <button
                            onClick={() => handleDownloadSharedFile(file)}
                            className="p-3 hover:bg-blue-100 rounded-lg transition-colors"
                            title="Download file"
                          >
                            <Download className="w-5 h-5 text-blue-600" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <Share2 className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <p className="font-medium text-lg">No shared files</p>
                    <p className="text-sm mt-1">Files shared with you will appear here</p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            {processedSharedFiles.length > 0 && (
              <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-6 flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Showing {processedSharedFiles.length} of {sharedFiles.length} files
                </p>
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}