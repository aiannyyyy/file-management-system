// ============================================
// FILE PREVIEW MODAL COMPONENT - WITH PDF IFRAME SUPPORT
// File: components/FilePreviewModal.tsx
// ============================================

import React, { useEffect, useState } from 'react';
import { X, Download, FileText, Music, Video, Archive, File, Image } from 'lucide-react';
import '../styles/FilePreviewModal.css';

interface FilePreviewModalProps {
  fileUrl: string;
  fileName: string;
  fileType: string;
  isOpen: boolean;
  onClose: () => void;
}

const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  fileUrl,
  fileName,
  fileType,
  isOpen,
  onClose
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detectedType, setDetectedType] = useState<string>(fileType);

  // ✅ Detect file type from filename if necessary
  useEffect(() => {
    let type = fileType;

    // If file type is generic or octet-stream, try to detect from filename
    if (!type || type === 'application/octet-stream' || type.includes('octet')) {
      const ext = fileName.split('.').pop()?.toLowerCase();
      
      const typeMap: { [key: string]: string } = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'svg': 'image/svg+xml',
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'avi': 'video/x-msvideo',
        'mov': 'video/quicktime',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'pdf': 'application/pdf',
        'txt': 'text/plain',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'zip': 'application/zip',
        'rar': 'application/x-rar-compressed',
        '7z': 'application/x-7z-compressed'
      };

      if (ext && typeMap[ext]) {
        type = typeMap[ext];
        console.log(`✅ Detected file type from extension: ${ext} -> ${type}`);
      }
    }

    setDetectedType(type);
  }, [fileType, fileName]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      window.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      window.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !fileUrl) return null;

  // ✅ File type detection
  const isImage = detectedType.startsWith('image/');
  const isVideo = detectedType.startsWith('video/');
  const isAudio = detectedType.startsWith('audio/');
  const isPdf = detectedType === 'application/pdf';
  const isText = detectedType.startsWith('text/');

  const getFileIcon = () => {
    if (isImage) return <Image size={48} />;
    if (isVideo) return <Video size={48} />;
    if (isAudio) return <Music size={48} />;
    if (isPdf) return <FileText size={48} />;
    if (detectedType.includes('archive') || detectedType.includes('zip') || detectedType.includes('rar') || detectedType.includes('7z')) {
      return <Archive size={48} />;
    }
    return <File size={48} />;
  };

  const handleDownload = () => {
    try {
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = fileName;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Error downloading file:', err);
      setError('Failed to download file');
    }
  };

  const handleImageError = () => {
    setLoading(false);
    setError('Failed to load image');
  };

  const handleImageLoad = () => {
    setLoading(false);
    setError(null);
  };

  const handleVideoError = () => {
    setLoading(false);
    setError('Failed to load video');
  };

  return (
    <>
      {isOpen && (
        <div
          className="file-preview-overlay"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="file-preview-title"
        >
          <div
            className={`file-preview-modal ${isPdf ? 'pdf-modal' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="file-preview-header">
              <h2 className="file-preview-title" id="file-preview-title">
                {fileName}
              </h2>
              <div className="file-preview-actions">
                <button
                  className="file-preview-btn download-btn"
                  onClick={handleDownload}
                  title="Download file"
                  aria-label="Download file"
                >
                  <Download size={20} />
                </button>
                <button
                  className="file-preview-btn close-btn"
                  onClick={onClose}
                  title="Close preview"
                  aria-label="Close preview"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Preview Content */}
            <div className="file-preview-content">
              {error && (
                <div className="preview-error">
                  <p>⚠️ {error}</p>
                  <button className="open-btn" onClick={handleDownload}>
                    Download Instead
                  </button>
                </div>
              )}

              {!error && (
                <>
                  {isImage ? (
                    <div className="image-preview">
                      {loading && (
                        <div className="loading-spinner">
                          <div className="spinner"></div>
                        </div>
                      )}
                      <img
                        src={fileUrl}
                        alt={fileName}
                        onLoad={handleImageLoad}
                        onError={handleImageError}
                        className={loading ? 'loading' : 'loaded'}
                        style={{ display: loading ? 'none' : 'block' }}
                      />
                    </div>
                  ) : isVideo ? (
                    <div className="video-preview">
                      {loading && (
                        <div className="loading-spinner">
                          <div className="spinner"></div>
                        </div>
                      )}
                      <video
                        controls
                        autoPlay
                        onLoadedData={handleImageLoad}
                        onError={handleVideoError}
                        style={{ display: loading ? 'none' : 'block' }}
                      >
                        <source src={fileUrl} type={detectedType} />
                        Your browser does not support the video tag.
                      </video>
                    </div>
                  ) : isAudio ? (
                    <div className="audio-preview">
                      <Music size={64} className="audio-icon" />
                      <p className="audio-title">{fileName}</p>
                      <audio controls autoPlay>
                        <source src={fileUrl} type={detectedType} />
                        Your browser does not support the audio element.
                      </audio>
                    </div>
                  ) : isPdf ? (
                    <div className="pdf-preview">
                      {loading && (
                        <div className="loading-spinner">
                          <div className="spinner"></div>
                        </div>
                      )}
                      <iframe
                        src={fileUrl}
                        className={`pdf-iframe ${loading ? 'loading' : 'loaded'}`}
                        title={fileName}
                        onLoad={handleImageLoad}
                        style={{ display: loading ? 'none' : 'block' }}
                      />
                      <button
                        className="open-in-browser-btn"
                        onClick={() => window.open(fileUrl, '_blank')}
                        title="Open in new tab"
                      >
                        Open in New Tab
                      </button>
                    </div>
                  ) : isText ? (
                    <div className="text-preview">
                      {loading && (
                        <div className="loading-spinner">
                          <div className="spinner"></div>
                        </div>
                      )}
                      <iframe
                        src={fileUrl}
                        className={loading ? 'loading' : 'loaded'}
                        title={fileName}
                        onLoad={handleImageLoad}
                        style={{ display: loading ? 'none' : 'block' }}
                      />
                    </div>
                  ) : (
                    <div className="generic-preview">
                      {getFileIcon()}
                      <p className="file-name">{fileName}</p>
                      <p className="file-type">{detectedType || 'Unknown file type'}</p>
                      <button className="open-btn" onClick={handleDownload}>
                        Download File
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="file-preview-footer">
              <span className="file-info">{detectedType}</span>
              <button
                className="file-preview-btn download-btn"
                onClick={handleDownload}
              >
                <Download size={16} /> Download
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FilePreviewModal;