const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ================== Security Configuration ==================
const ALLOWED_FILE_TYPES = [
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', // Images
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', // Documents
  'txt', 'csv', 'json', 'xml', 'html', 'css', 'js', // Text files
  'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', // Video
  'mp3', 'wav', 'flac', 'aac', 'ogg', // Audio
  'zip', 'rar', '7z', 'tar', 'gz' // Archives
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILES_PER_REQUEST = 10;

// ================== Helper Functions ==================
function validateFileType(fileName) {
  const ext = path.extname(fileName).substring(1).toLowerCase();
  return ALLOWED_FILE_TYPES.includes(ext);
}

function ensureUploadDir(uploadPath) {
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
    console.log(`📁 Created upload directory: ${uploadPath}`);
  }
}

function generateUniqueFilename(originalName) {
  const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${Date.now()}-${sanitizedName}`;
}

// ================== Storage Configuration ==================
const createStorage = (uploadPath = 'uploads/') => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      console.log(`📁 Setting upload destination: ${uploadPath}`);
      ensureUploadDir(uploadPath);
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const filename = generateUniqueFilename(file.originalname);
      console.log(`📝 Generated filename: ${filename}`);
      cb(null, filename);
    },
  });
};

// ================== File Filter Configuration ==================
const fileFilter = (req, file, cb) => {
  console.log("🔍 File filter check:", {
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size
  });
  
  if (!validateFileType(file.originalname)) {
    console.log("❌ File type not allowed:", file.originalname);
    return cb(new Error(`File type not allowed. Allowed types: ${ALLOWED_FILE_TYPES.join(', ')}`), false);
  }
  
  cb(null, true);
};

// ================== Multer Instance Factory ==================
const createMulterInstance = (options = {}) => {
  const config = {
    uploadPath: options.uploadPath || 'uploads/',
    maxFileSize: options.maxFileSize || MAX_FILE_SIZE,
    maxFiles: options.maxFiles || MAX_FILES_PER_REQUEST,
  };

  return multer({
    storage: createStorage(config.uploadPath),
    limits: {
      fileSize: config.maxFileSize,
      files: config.maxFiles,
    },
    fileFilter: fileFilter
  });
};

// ================== Pre-configured Instances ==================
const upload = createMulterInstance();

const uploadSingle = (fieldName = 'file') => upload.single(fieldName);
const uploadMultiple = (fieldName = 'files', maxCount = MAX_FILES_PER_REQUEST) => 
  upload.array(fieldName, maxCount);
const uploadFields = (fields) => upload.fields(fields);

// ================== Error Handler Middleware ==================
const handleMulterError = (error, req, res, next) => {
  console.error("💥 Multer error:", error);
  
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({ 
          error: `File too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`,
          code: 'FILE_TOO_LARGE'
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({ 
          error: "Unexpected file field.",
          code: 'UNEXPECTED_FILE'
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({ 
          error: `Too many files. Maximum is ${MAX_FILES_PER_REQUEST} files per request.`,
          code: 'TOO_MANY_FILES'
        });
      default:
        return res.status(400).json({ 
          error: "File upload error: " + error.message,
          code: 'UPLOAD_ERROR'
        });
    }
  }
  
  if (error.message.includes('File type not allowed')) {
    return res.status(400).json({ 
      error: error.message,
      code: 'INVALID_FILE_TYPE'
    });
  }
  
  next(error);
};

// ================== Utility Functions ==================
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function validateFilePath(filePath) {
  const normalizedPath = path.normalize(filePath);
  return !normalizedPath.includes('..') && normalizedPath.includes('uploads');
}

async function cleanupFiles(files) {
  const fs = require('fs').promises;
  
  try {
    if (!files) return;
    const fileArray = Array.isArray(files) ? files : [files];
    
    for (const file of fileArray) {
      if (file && file.path && require('fs').existsSync(file.path)) {
        await fs.unlink(file.path);
        console.log(`🧹 Cleaned up file: ${file.path}`);
      }
    }
  } catch (error) {
    console.error('💥 Error cleaning up files:', error);
  }
}

// ================== Export Configuration ==================
module.exports = {
  upload,
  uploadSingle,
  uploadMultiple,
  uploadFields,
  createMulterInstance,
  handleMulterError,
  validateFileType,
  validateFilePath,
  formatFileSize,
  cleanupFiles,
  ensureUploadDir,
  generateUniqueFilename,
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE,
  MAX_FILES_PER_REQUEST,
  createStorage
};