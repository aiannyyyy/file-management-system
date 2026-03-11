const express = require('express');
const path = require('path');
const inhouseDb = require("../dbInhouse");
const fs = require('fs');
const util = require('util');
const validator = require('validator');
const archiver = require('archiver');
const unlinkAsync = util.promisify(fs.unlink);
const mysql = require('mysql2/promise');
const qpdf = require('node-qpdf2');
const passwordManager = require('../utils/passwordManager');
const wordPasswordManager = require('../utils/wordPasswordManager');
const excelPasswordManager = require('../utils/excelPasswordManager');

const { 
  uploadSingle, 
  uploadMultiple, 
  handleMulterError, 
  formatFileSize, 
  validateFileType, 
  validateFilePath, 
  cleanupFiles,
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE,
  MAX_FILES_PER_REQUEST 
} = require('../config/multerConfig.js');

const router = express.Router();

// ================== Helper: Validate User ==================
async function validateUser(userId) {
  console.log("🔍 Validating user ID:", userId, "Type:", typeof userId);
  
  try {
    const [rows] = await inhouseDb.query("SELECT id, name, email FROM users WHERE id = ?", [userId]);
    console.log("📋 User validation query result:", rows);
    
    if (rows.length > 0) {
      console.log("✅ User found:", rows[0]);
      return true;
    } else {
      console.log("❌ No user found with ID:", userId);
      return false;
    }
  } catch (error) {
    console.error("💥 Error validating user:", error);
    return false;
  }
}

// ================== Helper: Get User Details ==================
async function getUserDetails(userId) {
  try {
    const [rows] = await inhouseDb.query("SELECT id, name, user_name, email FROM users WHERE id = ?", [userId]);
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error("Error getting user details:", error);
    return null;
  }
}

/*
// ================== Helper: Validate File Path ==================
function validateFilePath(filePath) {
  const normalizedPath = path.normalize(filePath);
  // Just check for path traversal attacks, allow any path containing 'uploads'
  return !normalizedPath.includes('..') && normalizedPath.includes('uploads');
}
*/

/*
// ================== Helper: Validate File Type ==================
function validateFileType(filename) {
  const ext = path.extname(filename).substring(1).toLowerCase();
  return ALLOWED_FILE_TYPES.includes(ext);
}
*/

// ================== Helper: Sanitize Input ==================
function sanitizeInput(input) {
  if (!input) return input;
  return validator.escape(input.toString().trim());
}

// ========== Helper: Check File Access (Owner or Shared) ============
async function checkFileAccess(fileId, userId, fileType = 'regular') {
    try {
        let fileTable, shareColumn;
        
        if (fileType === 'regular') {
            fileTable = 'files';
            shareColumn = 'file_id';
        } else {
            fileTable = 'categories_files';
            shareColumn = 'category_file_id';
        }

        // Check if user owns the file
        const [files] = await inhouseDb.query(
            `SELECT created_by FROM ${fileTable} WHERE id = ?`,
            [fileId]
        );

        if (files.length === 0) {
            return { hasAccess: false, isOwner: false, error: 'File not found' };
        }

        // User is owner
        if (files[0].created_by === userId) {
            return { hasAccess: true, isOwner: true };
        }

        // Check if file is shared with user
        const [shares] = await inhouseDb.query(
            `SELECT id FROM file_shares WHERE ${shareColumn} = ? AND shared_with = ?`,
            [fileId, userId]
        );

        if (shares.length > 0) {
            return { hasAccess: true, isOwner: false };
        }

        // No access
        return { hasAccess: false, isOwner: false, error: 'Access denied' };

    } catch (error) {
        console.error('Error checking file access:', error);
        return { hasAccess: false, isOwner: false, error: 'Access check failed' };
    }
}
/*
// ================== Helper: Format File Size ==================
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
*/

// ================== Helper: Add Activity Log ==================
async function addActivityLog(userId, action, targetType, targetId, targetName, additionalInfo = null) {
  try {
    const actionMap = {
      'create': 'CREATE',
      'upload': 'CREATE', 
      'update': 'UPDATE',
      'rename': 'RENAME',
      'move': 'MOVE',
      'move_rename': 'MOVE',
      'delete': 'DELETE',
      'download': 'DOWNLOAD',
      'copy': 'COPY'
    };

    // ✅ NEW: Separate categories from folders
        const entityTypeMap = {
            'category': 'CATEGORY',    // Categories get their own type
            'folder': 'FOLDER',        // Folders use FOLDER type
            'file': 'FILE'             // Files use FILE type
        };

    const mappedAction = actionMap[action] || 'CREATE';
    const mappedEntityType = entityTypeMap[targetType] || 'FILE';

    await inhouseDb.query(
      `INSERT INTO activity_logs (user_id, action, target_type, target_id, target_name, additional_info, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [userId, mappedAction, mappedEntityType, targetId, targetName, additionalInfo]
    );
    
    console.log(`📝 Log: ${mappedAction} ${mappedEntityType} (${targetName}) by user ${userId}`);
  } catch (error) {
    console.error("💥 Error adding activity log:", error);
  }
}

// ================== Helper: Execute with Transaction ==================
async function executeWithTransaction(operations) {
  const connection = await inhouseDb.getConnection();
  try {
    await connection.beginTransaction();
    
    const results = [];
    for (const operation of operations) {
      const result = await operation(connection);
      results.push(result);
    }
    
    await connection.commit();
    return results;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/*
// ================== Configure Storage ==================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log("📁 Setting upload destination: uploads/");
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = Date.now() + "-" + sanitizedName;
    console.log("📝 Generated filename:", filename);
    cb(null, filename);
  },
});
*/

/*
const upload = multer({ 
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES_PER_REQUEST,
  },
  fileFilter: (req, file, cb) => {
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
  }
});
*/

// ================== Create Folder ==================
router.post("/folders", async (req, res) => {
  console.log("\n🆕 ===== CREATE FOLDER REQUEST =====");
  console.log("📥 Request body:", req.body);
  
  const { name, parent_id, created_by } = req.body;
  
  // Debug logging
  console.log("📊 Extracted values:");
  console.log("  - name:", name, "Type:", typeof name);
  console.log("  - parent_id:", parent_id, "Type:", typeof parent_id);
  console.log("  - created_by:", created_by, "Type:", typeof created_by);
  
  try {
    // Validate required fields
    if (!name || name.trim() === '') {
      console.log("❌ Missing or empty folder name");
      return res.status(400).json({ error: "Folder name is required" });
    }
    
    if (!created_by) {
      console.log("❌ Missing created_by user ID");
      return res.status(400).json({ error: "created_by user ID is required" });
    }
    
    // Sanitize input
    const sanitizedName = sanitizeInput(name);
    
    // Validate user exists
    console.log("🔍 Validating user...");
    const userExists = await validateUser(created_by);
    if (!userExists) {
      console.log("❌ User validation failed for ID:", created_by);
      return res.status(400).json({ error: "Invalid created_by user" });
    }
    
    // Check if parent folder exists (if provided)
    if (parent_id) {
      console.log("🔍 Checking parent folder:", parent_id);
      const [parentCheck] = await inhouseDb.query("SELECT id FROM folders WHERE id = ?", [parent_id]);
      if (parentCheck.length === 0) {
        console.log("❌ Parent folder not found:", parent_id);
        return res.status(400).json({ error: "Parent folder not found" });
      }
      console.log("✅ Parent folder exists");
    }
    
    // Check for duplicate folder names in the same parent
    const duplicateCheck = parent_id 
      ? await inhouseDb.query("SELECT id FROM folders WHERE name = ? AND parent_id = ?", [sanitizedName, parent_id])
      : await inhouseDb.query("SELECT id FROM folders WHERE name = ? AND parent_id IS NULL", [sanitizedName]);
    
    if (duplicateCheck[0].length > 0) {
      console.log("❌ Duplicate folder name found");
      return res.status(400).json({ error: "A folder with this name already exists in the same location" });
    }
    
    console.log("💾 Inserting folder into database...");
    const [result] = await inhouseDb.query(
      `INSERT INTO folders (name, parent_id, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [sanitizedName, parent_id || null, created_by, created_by]
    );
    
    console.log("✅ Folder created successfully!");
    console.log("📋 Insert result:", result);
    console.log("🆔 New folder ID:", result.insertId);
    
    // Get user details for response
    const userDetails = await getUserDetails(created_by);
    
    res.json({ 
      message: "Folder created successfully",
      folderId: result.insertId,
      folderName: sanitizedName,
      createdBy: userDetails,
      parentId: parent_id || null
    });
    
    await addActivityLog(created_by, "create", "folder", result.insertId, sanitizedName);

  } catch (err) {
    console.error("💥 Error creating folder:", err);
    console.error("📋 Error stack:", err.stack);
    res.status(500).json({ error: "Failed to create folder: " + err.message });
  }
});

// ================== Upload File (Single) ==================
router.post("/upload", uploadSingle('file'), async (req, res) => {
  console.log("\n📤 ===== FILE UPLOAD REQUEST =====");
  console.log("📥 Request body:", req.body);
  console.log("📎 File info:", req.file);
  
  const { folder_id, created_by } = req.body;
  
  console.log("📊 Extracted values:");
  console.log("  - folder_id:", folder_id, "Type:", typeof folder_id);
  console.log("  - created_by:", created_by, "Type:", typeof created_by);
  
  try {
    // Validate file
    const file = req.file;
    if (!file) {
      console.log("❌ No file uploaded");
      return res.status(400).json({ error: "No file uploaded" });
    }
    
    // Validate file path
    if (!validateFilePath(file.path)) {
      console.log("❌ Invalid file path:", file.path);
      await unlinkAsync(file.path);
      return res.status(400).json({ error: "Invalid file path" });
    }
    
    console.log("📋 File details:");
    console.log("  - Original name:", file.originalname);
    console.log("  - File path:", file.path);
    console.log("  - File size:", file.size);
    console.log("  - Mime type:", file.mimetype);
    
    // Validate created_by
    if (!created_by) {
      console.log("❌ Missing created_by user ID");
      await unlinkAsync(file.path);
      return res.status(400).json({ error: "created_by user ID is required" });
    }
    
    console.log("🔍 Validating user...");
    const userExists = await validateUser(created_by);
    if (!userExists) {
      console.log("❌ User validation failed for ID:", created_by);
      await unlinkAsync(file.path);
      return res.status(400).json({ error: "Invalid created_by user" });
    }
    
    // Validate folder exists (if provided)
    if (folder_id) {
      console.log("🔍 Checking folder:", folder_id);
      const [folderCheck] = await inhouseDb.query("SELECT id FROM folders WHERE id = ?", [folder_id]);
      if (folderCheck.length === 0) {
        console.log("❌ Folder not found:", folder_id);
        await unlinkAsync(file.path);
        return res.status(400).json({ error: "Folder not found" });
      }
      console.log("✅ Folder exists");
    }
    
    // Check for duplicate file names in the same folder
    const duplicateCheck = folder_id 
      ? await inhouseDb.query("SELECT id, file_name FROM files WHERE file_name = ? AND folder_id = ?", [file.originalname, folder_id])
      : await inhouseDb.query("SELECT id, file_name FROM files WHERE file_name = ? AND folder_id IS NULL", [file.originalname]);

    if (duplicateCheck[0].length > 0) {
      const existingFile = duplicateCheck[0][0];
      console.log("⚠️ Duplicate file detected — returning conflict");
      // Don't delete the uploaded file — keep it for user decision
      return res.status(409).json({
        conflict: true,
        message: `A file named "${file.originalname}" already exists in this location.`,
        existing_file: {
          id: existingFile.id,
          file_name: existingFile.file_name,
        },
        uploaded_file: {
          temp_path: file.path,
          file_name: file.originalname,
          file_size: file.size,
          file_type: path.extname(file.originalname).substring(1).toLowerCase(),
        },
        available_strategies: ['overwrite', 'version', 'skip'],
        hint: 'Resubmit with conflict_strategy and temp_path to resolve'
      });
    }
    
    console.log("💾 Inserting file into database...");
    const [result] = await inhouseDb.query(
      `INSERT INTO files (folder_id, file_name, file_path, file_type, file_size, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        folder_id || null,
        file.originalname,
        file.path,
        path.extname(file.originalname).substring(1).toLowerCase(),
        file.size,
        created_by,
        created_by,
      ]
    );

    console.log("✅ File uploaded successfully!");
    console.log("📋 Insert result:", result);
    console.log("🆔 New file ID:", result.insertId);
    
    // Get user details for response
    const userDetails = await getUserDetails(created_by);
    
    res.json({ 
      message: "File uploaded successfully",
      fileId: result.insertId,
      fileName: file.originalname,
      fileSize: file.size,
      fileSizeFormatted: formatFileSize(file.size),
      fileType: path.extname(file.originalname).substring(1).toLowerCase(),
      createdBy: userDetails,
      folderId: folder_id || null
    });

    await addActivityLog(created_by, "upload", "file", result.insertId, file.originalname, JSON.stringify({ size: file.size, type: file.mimetype }));
    
  } catch (err) {
    console.error("💥 Error uploading file:", err);
    console.error("📋 Error stack:", err.stack);
    
    // Clean up uploaded file if database insert failed
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        await unlinkAsync(req.file.path);
        console.log("🧹 Cleaned up uploaded file after error");
      } catch (cleanupError) {
        console.error("💥 Error cleaning up file:", cleanupError);
      }
    }
    
    res.status(500).json({ error: "Failed to upload file: " + err.message });
  }
});

// ================== Resolve Upload Conflict ==================
router.post("/upload/resolve", async (req, res) => {
  console.log("\n⚡ ===== RESOLVE UPLOAD CONFLICT =====");
  const { conflict_strategy, temp_path, file_name, file_size, file_type, folder_id, created_by, existing_file_id } = req.body;

  try {
    if (!conflict_strategy) return res.status(400).json({ error: "conflict_strategy is required" });
    if (!temp_path) return res.status(400).json({ error: "temp_path is required" });
    if (!created_by) return res.status(400).json({ error: "created_by is required" });

    const userExists = await validateUser(created_by);
    if (!userExists) {
      await unlinkAsync(temp_path).catch(() => {});
      return res.status(400).json({ error: "Invalid created_by user" });
    }

    if (!fs.existsSync(temp_path)) {
      return res.status(400).json({ error: "Uploaded file no longer exists. Please upload again." });
    }

    // ── SKIP ──────────────────────────────────────────────────
    if (conflict_strategy === 'skip') {
      await unlinkAsync(temp_path).catch(() => {});
      return res.json({ message: "Upload skipped.", skipped: true });
    }

    // ── OVERWRITE ─────────────────────────────────────────────
    if (conflict_strategy === 'overwrite') {
      const [existingRows] = await inhouseDb.query("SELECT * FROM files WHERE id = ?", [existing_file_id]);
      if (existingRows.length === 0) {
        await unlinkAsync(temp_path).catch(() => {});
        return res.status(404).json({ error: "Existing file not found" });
      }
      const existingFile = existingRows[0];

      if (existingFile.file_path && fs.existsSync(existingFile.file_path)) {
        await unlinkAsync(existingFile.file_path).catch(() => {});
      }

      await inhouseDb.query(
        `UPDATE files SET file_path = ?, file_size = ?, file_type = ?, updated_by = ?, updated_at = NOW() WHERE id = ?`,
        [temp_path, file_size, file_type, created_by, existing_file_id]
      );

      await addActivityLog(created_by, "update", "file", existing_file_id, file_name,
        JSON.stringify({ action: 'overwrite_upload' })
      );

      return res.json({
        message: `"${file_name}" overwritten successfully.`,
        fileId: existing_file_id,
        fileName: file_name,
        strategy: 'overwrite'
      });
    }

    // ── VERSION ───────────────────────────────────────────────
    if (conflict_strategy === 'version') {
      const [existingRows] = await inhouseDb.query("SELECT * FROM files WHERE id = ?", [existing_file_id]);
      if (existingRows.length === 0) {
        await unlinkAsync(temp_path).catch(() => {});
        return res.status(404).json({ error: "Existing file not found" });
      }
      const existingFile = existingRows[0];

      const [versionRows] = await inhouseDb.query(
        "SELECT MAX(version_number) as max_version FROM file_versions WHERE file_id = ?",
        [existing_file_id]
      );
      const versionNumber = (versionRows[0].max_version || 0) + 1;

      const ext = path.extname(file_name);
      const baseName = path.basename(file_name, ext);
      const versionedFileName = `${baseName} (Version ${versionNumber})${ext}`;

      const versionedPhysicalName = `${Date.now()}-${versionedFileName.replace(/[^a-zA-Z0-9.\-()]/g, '_')}`;
      const versionedFilePath = path.join('uploads', versionedPhysicalName);
      const resolvedVersionedPath = path.join(process.cwd(), versionedFilePath);

      await fs.promises.rename(temp_path, resolvedVersionedPath);

      const [result] = await inhouseDb.query(
        `INSERT INTO files (folder_id, file_name, file_path, file_type, file_size, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [folder_id || null, versionedFileName, versionedFilePath, file_type, file_size, created_by, created_by]
      );

      await inhouseDb.query(
        `INSERT INTO file_versions 
         (file_id, version_number, file_name, file_path, file_size, file_type, moved_from_folder_id, created_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          existing_file_id, versionNumber, versionedFileName,
          versionedFilePath, file_size, file_type,
          folder_id || null, created_by,
          `Version ${versionNumber} — uploaded alongside existing file`
        ]
      );

      await addActivityLog(created_by, "upload", "file", result.insertId, versionedFileName,
        JSON.stringify({ action: 'version_upload', original_file_id: existing_file_id, version_number: versionNumber })
      );

      return res.json({
        message: `Saved as "${versionedFileName}" (version ${versionNumber}).`,
        fileId: result.insertId,
        fileName: versionedFileName,
        strategy: 'version',
        versionNumber
      });
    }

    return res.status(400).json({ error: `Unknown conflict_strategy: ${conflict_strategy}` });

  } catch (err) {
    console.error("💥 Error resolving upload conflict:", err);
    await unlinkAsync(temp_path).catch(() => {});
    return res.status(500).json({ error: "Failed to resolve conflict: " + err.message });
  }
});

// ================== Upload Multiple Files ==================
router.post("/upload/multiple", uploadMultiple('files'), async (req, res) => {
  console.log("\n📤 ===== MULTIPLE FILE UPLOAD REQUEST =====");
  console.log("📥 Request body:", req.body);
  console.log("📎 Files count:", req.files?.length || 0);
  
  const { folder_id, created_by } = req.body;
  const uploadedFiles = [];
  const errors = [];
  
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }
    
    // Validate user
    const userExists = await validateUser(created_by);
    if (!userExists) {
      // Clean up all uploaded files
      for (const file of req.files) {
        if (fs.existsSync(file.path)) {
          await unlinkAsync(file.path);
        }
      }
      return res.status(400).json({ error: "Invalid created_by user" });
    }
    
    // Validate folder (if provided)
    if (folder_id) {
      const [folderCheck] = await inhouseDb.query("SELECT id FROM folders WHERE id = ?", [folder_id]);
      if (folderCheck.length === 0) {
        // Clean up all uploaded files
        for (const file of req.files) {
          if (fs.existsSync(file.path)) {
            await unlinkAsync(file.path);
          }
        }
        return res.status(400).json({ error: "Folder not found" });
      }
    }
    
    // Process each file
    for (const file of req.files) {
      try {
        // Check for duplicates
        const duplicateCheck = folder_id 
          ? await inhouseDb.query("SELECT id FROM files WHERE file_name = ? AND folder_id = ?", [file.originalname, folder_id])
          : await inhouseDb.query("SELECT id FROM files WHERE file_name = ? AND folder_id IS NULL", [file.originalname]);
        
        if (duplicateCheck[0].length > 0) {
          errors.push({ fileName: file.originalname, error: "File already exists" });
          await unlinkAsync(file.path);
          continue;
        }
        
        // Insert file
        const [result] = await inhouseDb.query(
          `INSERT INTO files (folder_id, file_name, file_path, file_type, file_size, created_by, updated_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            folder_id || null,
            file.originalname,
            file.path,
            path.extname(file.originalname).substring(1).toLowerCase(),
            file.size,
            created_by,
            created_by,
          ]
        );
        
        uploadedFiles.push({
          fileId: result.insertId,
          fileName: file.originalname,
          fileSize: file.size,
          fileSizeFormatted: formatFileSize(file.size),
          fileType: path.extname(file.originalname).substring(1).toLowerCase(),
        });
        
        await addActivityLog(created_by, "upload", "file", result.insertId, file.originalname);
        
      } catch (fileError) {
        console.error("💥 Error processing file:", file.originalname, fileError);
        errors.push({ fileName: file.originalname, error: fileError.message });
        if (fs.existsSync(file.path)) {
          await unlinkAsync(file.path);
        }
      }
    }
    
    res.json({
      message: `${uploadedFiles.length} files uploaded successfully`,
      uploadedFiles,
      errors: errors.length > 0 ? errors : undefined,
      totalUploaded: uploadedFiles.length,
      totalErrors: errors.length
    });
    
  } catch (err) {
    console.error("💥 Error in multiple upload:", err);
    
    // Clean up all uploaded files
    if (req.files) {
      for (const file of req.files) {
        if (fs.existsSync(file.path)) {
          try {
            await unlinkAsync(file.path);
          } catch (cleanupError) {
            console.error("💥 Error cleaning up file:", cleanupError);
          }
        }
      }
    }
    
    res.status(500).json({ error: "Failed to upload files: " + err.message });
  }
});

// ================== Get Files (Root & Subfolders) ==================
router.get("/list", async (req, res) => {
  console.log("\n📂 ===== GET ROOT FILES/FOLDERS =====");
  
  try {
    console.log("🔍 Querying root files...");
    const [files] = await inhouseDb.query(
      `SELECT f.*, u.name AS created_by_name, u2.name AS updated_by_name
       FROM files f
       LEFT JOIN users u ON f.created_by = u.id
       LEFT JOIN users u2 ON f.updated_by = u2.id
       WHERE folder_id IS NULL
       ORDER BY f.file_name ASC`
    );
    
    console.log("🔍 Querying root folders...");
    const [folders] = await inhouseDb.query(
      `SELECT f.*, u.name AS created_by_name, u2.name AS updated_by_name
       FROM folders f
       LEFT JOIN users u ON f.created_by = u.id
       LEFT JOIN users u2 ON f.updated_by = u2.id
       WHERE parent_id IS NULL
       ORDER BY f.name ASC`
    );
    
    console.log("📊 Query results:");
    console.log("  - Files found:", files.length);
    console.log("  - Folders found:", folders.length);
    
    res.json({ 
      folders: folders || [], 
      files: files || [],
      location: "root"
    });
    
  } catch (err) {
    console.error("💥 Error getting root files/folders:", err);
    res.status(500).json({ error: "Failed to get files/folders: " + err.message });
  }
});

router.get("/list/:folderId", async (req, res) => {
  const { folderId } = req.params;
  
  console.log("\n📂 ===== GET FOLDER CONTENTS =====");
  console.log("📁 Folder ID:", folderId);
  
  try {
    // Validate folder exists
    console.log("🔍 Checking if folder exists...");
    const [folderCheck] = await inhouseDb.query("SELECT * FROM folders WHERE id = ?", [folderId]);
    if (folderCheck.length === 0) {
      console.log("❌ Folder not found:", folderId);
      return res.status(404).json({ error: "Folder not found" });
    }
    
    const folderInfo = folderCheck[0];
    console.log("✅ Folder found:", folderInfo.name);
    
    console.log("🔍 Querying files in folder...");
    const [files] = await inhouseDb.query(
      `SELECT f.*, u.name AS created_by_name, u2.name AS updated_by_name
       FROM files f
       LEFT JOIN users u ON f.created_by = u.id
       LEFT JOIN users u2 ON f.updated_by = u2.id
       WHERE folder_id = ?
       ORDER BY f.file_name ASC`,
      [folderId]
    );
    
    console.log("🔍 Querying subfolders...");
    const [folders] = await inhouseDb.query(
      `SELECT f.*, u.name AS created_by_name, u2.name AS updated_by_name
       FROM folders f
       LEFT JOIN users u ON f.created_by = u.id
       LEFT JOIN users u2 ON f.updated_by = u2.id
       WHERE parent_id = ?
       ORDER BY f.name ASC`,
      [folderId]
    );
    
    console.log("📊 Query results:");
    console.log("  - Files found:", files.length);
    console.log("  - Subfolders found:", folders.length);
    
    res.json({ 
      folders: folders || [], 
      files: files || [],
      currentFolder: folderInfo,
      location: folderInfo.name
    });
    
  } catch (err) {
    console.error("💥 Error getting folder contents:", err);
    res.status(500).json({ error: "Failed to get folder contents: " + err.message });
  }
});

// ================== Get Folder Path (Breadcrumb) ==================
router.get("/path/:folderId", async (req, res) => {
  const { folderId } = req.params;
  
  console.log("\n🧭 ===== GET FOLDER PATH =====");
  console.log("📁 Folder ID:", folderId);
  
  try {
    const path = [];
    let currentId = folderId;
    
    while (currentId) {
      const [folderResult] = await inhouseDb .query(
        "SELECT id, name, parent_id FROM folders WHERE id = ?",
        [currentId]
      );
      
      if (folderResult.length === 0) break;
      
      const folder = folderResult[0];
      path.unshift(folder); // Add to beginning of array
      currentId = folder.parent_id;
    }
    
    console.log("🧭 Folder path:", path);
    res.json({ path });
    
  } catch (err) {
    console.error("💥 Error getting folder path:", err);
    res.status(500).json({ error: "Failed to get folder path: " + err.message });
  }
});

// ================== Diagnostic: Check File Path ==================
router.get("/diagnostic/:id", async (req, res) => {
  const { id } = req.params;
  
  try {
    console.log("🔍 DIAGNOSTIC: Checking file ID:", id);
    
    const [result] = await inhouseDb.query("SELECT * FROM files WHERE id = ?", [id]);
    
    if (result.length === 0) {
      return res.json({ 
        error: "File not found in database",
        fileId: id 
      });
    }

    const file = result[0];
    
    // Check all possible path variations
    const pathChecks = {
      stored_path: file.file_path,
      stored_path_exists: fs.existsSync(file.file_path),
      
      resolved_path: path.resolve(file.file_path),
      resolved_exists: fs.existsSync(path.resolve(file.file_path)),
      
      from_cwd: path.join(process.cwd(), file.file_path),
      from_cwd_exists: fs.existsSync(path.join(process.cwd(), file.file_path)),
      
      uploads_dir: path.join(process.cwd(), 'uploads', path.basename(file.file_path)),
      uploads_exists: fs.existsSync(path.join(process.cwd(), 'uploads', path.basename(file.file_path))),
      
      from_dirname: path.join(__dirname, '..', file.file_path),
      from_dirname_exists: fs.existsSync(path.join(__dirname, '..', file.file_path)),
      
      uploads_from_dirname: path.join(__dirname, '../uploads', path.basename(file.file_path)),
      uploads_from_dirname_exists: fs.existsSync(path.join(__dirname, '../uploads', path.basename(file.file_path)))
    };
    
    // Environment info
    const envInfo = {
      cwd: process.cwd(),
      dirname: __dirname,
      platform: process.platform,
      node_version: process.version
    };
    
    // Check uploads directory
    const uploadsDir = path.join(process.cwd(), 'uploads');
    let uploadsDirContents = [];
    
    if (fs.existsSync(uploadsDir)) {
      uploadsDirContents = fs.readdirSync(uploadsDir).slice(0, 10); // First 10 files
    }
    
    res.json({
      success: true,
      file: {
        id: file.id,
        name: file.file_name,
        type: file.file_type,
        size: file.file_size,
        created_at: file.created_at
      },
      pathChecks,
      envInfo,
      uploadsDirectory: {
        path: uploadsDir,
        exists: fs.existsSync(uploadsDir),
        firstTenFiles: uploadsDirContents
      }
    });
    
  } catch (err) {
    console.error("Diagnostic error:", err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

router.get("/download/:id", async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.query;
  
  console.log("\n⬇️ ===== DOWNLOAD FILE =====");
  console.log("📎 File ID:", id);
  console.log("👤 User ID:", user_id);
  
  try {
    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    console.log("🔍 Querying file details...");
    const [result] = await inhouseDb.query("SELECT * FROM files WHERE id = ?", [id]);
    
    if (result.length === 0) {
      console.log("❌ File not found in database:", id);
      return res.status(404).json({ error: "File not found in database" });
    }

    const file = result[0];
    console.log("📋 File details from database:", {
      id: file.id,
      name: file.file_name,
      stored_path: file.file_path,
      size: file.file_size,
      type: file.file_type
    });
    
    // ✅ Try multiple path variations to find the file
    let actualFilePath = file.file_path;
    let fileExists = false;
    
    const pathVariations = [
      file.file_path,
      path.resolve(file.file_path),
      path.join(process.cwd(), file.file_path),
      path.join(process.cwd(), 'uploads', path.basename(file.file_path)),
      path.join(__dirname, '..', file.file_path),
      path.join(__dirname, '../uploads', path.basename(file.file_path))
    ];
    
    console.log("🔍 Searching for file in multiple locations...");
    
    for (const testPath of pathVariations) {
      console.log(`  - Testing: ${testPath}`);
      if (fs.existsSync(testPath)) {
        actualFilePath = testPath;
        fileExists = true;
        console.log(`  ✅ FOUND at: ${testPath}`);
        break;
      } else {
        console.log(`  ❌ Not found`);
      }
    }
    
    // ✅ FALLBACK: Search by filename pattern if not found
    if (!fileExists) {
      console.log("⚠️  File not found at stored path, searching by filename pattern...");
      
      const uploadsDir = path.join(process.cwd(), 'uploads');
      const originalFileName = file.file_name;
      const fileExtension = path.extname(originalFileName);
      const baseFileName = path.basename(originalFileName, fileExtension);
      
      const searchPattern = new RegExp(`\\d+-${baseFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${fileExtension.replace('.', '\\.')}`, 'i');
      
      console.log(`  - Searching in: ${uploadsDir}`);
      console.log(`  - Pattern: ${searchPattern}`);
      
      if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        
        for (const filename of files) {
          if (searchPattern.test(filename)) {
            const foundPath = path.join(uploadsDir, filename);
            console.log(`  ✅ FOUND MATCH: ${filename}`);
            actualFilePath = foundPath;
            fileExists = true;
            
            const correctPath = path.join('uploads', filename);
            await inhouseDb.query("UPDATE files SET file_path = ? WHERE id = ?", [correctPath, id]);
            console.log(`  📝 Updated database with correct path: ${correctPath}`);
            
            break;
          }
        }
      }
    }
    
    if (!fileExists) {
      console.log("❌ File not found in any location!");
      return res.status(404).json({ 
        error: "File missing on server",
        debug: {
          storedPath: file.file_path,
          searchedLocations: pathVariations,
          fileName: file.file_name
        }
      });
    }

    console.log("✅ File found at:", actualFilePath);

    // Validate file path (basic security check)
    const resolvedPath = path.resolve(actualFilePath);
    if (!resolvedPath.includes('uploads')) {
      console.log("❌ Security check failed - file not in uploads directory");
      return res.status(403).json({ error: "Invalid file location" });
    }

    // Log the download activity
    await addActivityLog(user_id, "download", "file", file.id, file.file_name, 'Public download');

    // ============================================================
    // PROTECTION LOGIC: PDF, DOCX, XLSX
    // ============================================================
    const fileType = file.file_type ? file.file_type.toLowerCase() : '';
    const needsProtection = ['pdf', 'docx', 'doc', 'xlsx', 'xls'].includes(fileType);

    if (needsProtection) {
      console.log(`🔒 ===== ${fileType.toUpperCase()} PROTECTION PROCESS =====`);
      console.log('📋 Original file:', actualFilePath);
      
      try {
        // Create temp directory if not exists
        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
          console.log('📁 Created temp directory:', tempDir);
        }

        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(7);
        const fileExt = path.extname(file.file_name);
        const securedFilePath = path.join(tempDir, `secured_${timestamp}_${randomStr}${fileExt}`);

        let protectionSuccess = false;
        let encryptionMethod = 'none';
        let passwordManager;
        let ownerPassword;

        // ==================== PDF PROTECTION ====================
        if (fileType === 'pdf') {
          console.log('🔒 Applying PDF Protection...');
          
          ownerPassword = 'nscsl';
          passwordManager = require('../utils/passwordManager');

          // Save password to storage
          passwordManager.savePassword(
            file.id,
            file.file_name,
            ownerPassword,
            user_id || file.created_by
          );
          console.log('💾 PDF Password saved to JSON storage');

          // Try native qpdf command first
          const { execSync } = require('child_process');
          const inputFile = actualFilePath.replace(/\\/g, '/');
          const outputFile = securedFilePath.replace(/\\/g, '/');
          
          const qpdfCommand = `qpdf --encrypt "" "${ownerPassword}" 256 --print=full --modify=none --extract=n --annotate=n --form=n --assemble=n -- "${inputFile}" "${outputFile}"`;
          
          console.log('📋 Attempting native qpdf command...');
          
          try {
            execSync(qpdfCommand, { 
              encoding: 'utf8',
              stdio: ['pipe', 'pipe', 'pipe'],
              windowsHide: true,
              shell: true,
              timeout: 30000
            });
            
            if (fs.existsSync(securedFilePath)) {
              console.log('✅ PDF protection SUCCESS (native qpdf)');
              protectionSuccess = true;
              encryptionMethod = 'native-qpdf';
            }
          } catch (execError) {
            console.error('❌ Native qpdf failed, trying node-qpdf2...');
            
            try {
              const qpdf = require('node-qpdf2');
              await qpdf.encrypt({
                input: actualFilePath,
                output: securedFilePath,
                ownerPassword: ownerPassword,
                userPassword: '',
                keyLength: 256,
                restrictions: {
                  print: 'full',
                  modify: 'none',
                  extract: 'n',
                  annotate: 'n',
                  fillForms: 'n',
                  assembly: 'n'
                }
              });
              
              if (fs.existsSync(securedFilePath)) {
                console.log('✅ PDF protection SUCCESS (node-qpdf2)');
                protectionSuccess = true;
                encryptionMethod = 'node-qpdf2';
              }
            } catch (qpdf2Error) {
              console.error('❌ Both PDF encryption methods failed');
            }
          }
        }

        // ==================== WORD PROTECTION ====================
        else if (fileType === 'docx' || fileType === 'doc') {
          console.log('🔒 Applying Word Protection...');
          
          passwordManager = wordPasswordManager;
          ownerPassword = passwordManager.generateFixedPassword(file.id);

          try {
            await passwordManager.protectWordDocument(
              actualFilePath,
              securedFilePath,
              ownerPassword
            );

            if (fs.existsSync(securedFilePath)) {
              // Save password to storage
              passwordManager.savePassword(
                file.id,
                file.file_name,
                ownerPassword,
                user_id || file.created_by
              );
              
              console.log('✅ Word protection SUCCESS');
              console.log('💾 Word password saved to JSON storage');
              protectionSuccess = true;
              encryptionMethod = 'officecrypto-tool';
            }
          } catch (wordError) {
            console.error('❌ Word encryption failed:', wordError.message);
          }
        }

        // ==================== EXCEL PROTECTION ====================
        else if (fileType === 'xlsx' || fileType === 'xls') {
          console.log('🔒 Applying Excel Protection...');
          
          passwordManager = excelPasswordManager;
          ownerPassword = passwordManager.generateFixedPassword(file.id);

          try {
            await passwordManager.protectExcelDocument(
              actualFilePath,
              securedFilePath,
              ownerPassword
            );

            if (fs.existsSync(securedFilePath)) {
              // Save password to storage
              passwordManager.savePassword(
                file.id,
                file.file_name,
                ownerPassword,
                user_id || file.created_by
              );
              
              console.log('✅ Excel protection SUCCESS');
              console.log('💾 Excel password saved to JSON storage');
              protectionSuccess = true;
              encryptionMethod = 'officecrypto-tool';
            }
          } catch (excelError) {
            console.error('❌ Excel encryption failed:', excelError.message);
          }
        }

        // ==================== SEND PROTECTED FILE ====================
        if (!protectionSuccess || !fs.existsSync(securedFilePath)) {
          throw new Error(`${fileType.toUpperCase()} protection failed - output file not created`);
        }

        // Verify the output file
        const securedSize = fs.statSync(securedFilePath).size;
        console.log('📊 Secured file size:', securedSize, 'bytes');
        
        if (securedSize < 1000) {
          throw new Error(`Secured file is suspiciously small (${securedSize} bytes)`);
        }

        // Read the secured file
        const securedBuffer = fs.readFileSync(securedFilePath);

        // Determine content type
        const contentTypes = {
          'pdf': 'application/pdf',
          'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'doc': 'application/msword',
          'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'xls': 'application/vnd.ms-excel'
        };

        // Set response headers
        res.setHeader('Content-Type', contentTypes[fileType] || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.file_name)}"`);
        res.setHeader('Content-Length', securedBuffer.length);
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        res.setHeader('X-File-Protection', 'password-protected');
        res.setHeader('X-Encryption-Method', encryptionMethod);

        console.log(`📤 Sending secured ${fileType.toUpperCase()} to client...`);
        console.log('   Buffer size:', securedBuffer.length, 'bytes');
        console.log('   Encryption method:', encryptionMethod);
        
        // Send the secured file
        res.send(securedBuffer);

        // Cleanup temp file after sending
        setTimeout(() => {
          try {
            if (fs.existsSync(securedFilePath)) {
              fs.unlinkSync(securedFilePath);
              console.log('🧹 Temp secured file cleaned up');
            }
          } catch (cleanupError) {
            console.error('⚠️  Failed to cleanup temp file:', cleanupError.message);
          }
        }, 10000);

        console.log(`✅ ===== ${fileType.toUpperCase()} PROTECTION COMPLETED =====`);

      } catch (protectionError) {
        console.error(`\n❌ ===== ${fileType.toUpperCase()} PROTECTION FAILED =====`);
        console.error('Error:', protectionError.message);
        console.error('Stack:', protectionError.stack);
        
        // CRITICAL: Send error instead of unprotected file
        console.error('🚫 REFUSING to send unprotected file');
        
        return res.status(500).json({ 
          error: `${fileType.toUpperCase()} protection failed - download aborted`,
          message: `The system cannot apply security restrictions to this ${fileType.toUpperCase()} file. Please contact the administrator.`,
          details: protectionError.message,
          troubleshooting: {
            install_dependency: fileType === 'pdf' 
              ? 'Install qpdf or run: npm install node-qpdf2'
              : 'Run: npm install officecrypto-tool',
            check_permissions: 'Ensure temp directory is writable'
          }
        });
      }

    } else {
      // ==================== NON-PROTECTED FILES ====================
      // For non-protected file types, serve normally
      console.log("✅ Non-protected file type, starting normal download...");
      
      res.download(actualFilePath, file.file_name, (err) => {
        if (err) {
          console.error("💥 Error during download:", err);
          if (!res.headersSent) {
            res.status(500).json({ error: "Download failed" });
          }
        } else {
          console.log("✅ Download completed successfully");
        }
      });
    }
    
  } catch (err) {
    console.error("💥 Error downloading file:", err);
    console.error("📋 Error stack:", err.stack);
    if (!res.headersSent) {
      res.status(500).json({ error: "Download failed: " + err.message });
    }
  }
});

// ================== Download Folder as Zip ==================
// Add this route after your existing download route
router.get("/download/folder/:id", async (req, res) => {
  const { id } = req.params;
  
  console.log("\n📁 ===== DOWNLOAD FOLDER =====");
  console.log("📁 Folder ID:", id);
  
  try {
    const archiver = require('archiver');
    const path = require('path');
    
    // Get folder details
    const [folderResult] = await inhouseDb.query("SELECT * FROM folders WHERE id = ?", [id]);
    
    if (folderResult.length === 0) {
      console.log("❌ Folder not found:", id);
      return res.status(404).json({ error: "Folder not found" });
    }

    const folder = folderResult[0];
    console.log("📋 Folder details:", folder.name);
    
    // Get all files in this folder (recursively)
    const files = await getAllFilesInFolder(id);
    
    if (files.length === 0) {
      return res.status(404).json({ error: "No files found in folder" });
    }

    // Set response headers for ZIP download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${folder.name}.zip"`);
    
    // Create archive
    const archive = archiver('zip', {
      zlib: { level: 9 } // compression level
    });

    // Handle archive errors
    archive.on('error', (err) => {
      console.error("💥 Archive error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Archive creation failed" });
      }
    });

    // Pipe archive to response
    archive.pipe(res);

    // Add files to archive
    for (const file of files) {
      if (fs.existsSync(file.file_path)) {
        archive.file(file.file_path, { name: file.file_name });
      }
    }

    // Finalize the archive
    await archive.finalize();
    
    console.log("✅ Folder ZIP created successfully");
    
  } catch (err) {
    console.error("💥 Error creating folder ZIP:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Folder download failed: " + err.message });
    }
  }
});

// ================== For Bulk Download ==================
router.post("/download/bulk", async (req, res) => {
  const { itemIds } = req.body;
  
  console.log("\n📦 ===== BULK DOWNLOAD =====");
  console.log("📦 Items:", itemIds);
  
  try {
    const archiver = require('archiver');
    
    if (!itemIds || itemIds.length === 0) {
      return res.status(400).json({ error: "No items selected" });
    }

    // Set response headers for ZIP download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="selected_files.zip"`);
    
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.on('error', (err) => {
      console.error("💥 Archive error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Archive creation failed" });
      }
    });

    archive.pipe(res);

    // Process each item
    for (const itemId of itemIds) {
      // Check if it's a file
      const [fileResult] = await inhouseDb.query("SELECT * FROM files WHERE id = ?", [itemId]);
      if (fileResult.length > 0) {
        const file = fileResult[0];
        if (fs.existsSync(file.file_path)) {
          archive.file(file.file_path, { name: file.file_name });
        }
      } else {
        // Check if it's a folder
        const [folderResult] = await inhouseDb.query("SELECT * FROM folders WHERE id = ?", [itemId]);
        if (folderResult.length > 0) {
          const folderFiles = await getAllFilesInFolder(itemId);
          const folder = folderResult[0];
          
          for (const file of folderFiles) {
            if (fs.existsSync(file.file_path)) {
              archive.file(file.file_path, { name: `${folder.name}/${file.file_name}` });
            }
          }
        }
      }
    }

    await archive.finalize();
    console.log("✅ Bulk download ZIP created successfully");
    
  } catch (err) {
    console.error("💥 Error creating bulk ZIP:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Bulk download failed: " + err.message });
    }
  }
});

// Helper function to get all files in a folder recursively
async function getAllFilesInFolder(folderId) {
  const files = [];
  
  // Get direct files in folder
  const [directFiles] = await inhouseDb.query(
    "SELECT * FROM files WHERE folder_id = ?", 
    [folderId]
  );
  files.push(...directFiles);
  
  // Get subfolders
  const [subFolders] = await inhouseDb.query(
    "SELECT * FROM folders WHERE parent_id = ?", 
    [folderId]
  );
  
  // Recursively get files from subfolders
  for (const subFolder of subFolders) {
    const subFiles = await getAllFilesInFolder(subFolder.id);
    files.push(...subFiles);
  }
  
  return files;
}

// ================= For FIle Preview ==================
// ================= Fixed File Preview Route ==================
router.get('/preview/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('📖 Preview request for file ID:', id);
    
    // Validate file ID
    if (!id || !validator.isNumeric(id.toString())) {
      console.log('❌ Invalid file ID:', id);
      return res.status(400).json({ error: 'Invalid file ID' });
    }
    
    // Get file from database
    const [files] = await inhouseDb.query('SELECT * FROM files WHERE id = ?', [id]);
    
    if (!files || files.length === 0) {
      console.log('❌ File not found in database:', id);
      return res.status(404).json({ error: 'File not found in database' });
    }
    
    const fileRecord = files[0];
    console.log('📋 File record:', {
      id: fileRecord.id,
      name: fileRecord.file_name,
      stored_path: fileRecord.file_path,
      size: fileRecord.file_size,
      type: fileRecord.file_type
    });
    
    // Construct file path - simplified approach
    let filePath;
    
    // Check if the stored path is absolute or relative
    if (path.isAbsolute(fileRecord.file_path)) {
      filePath = fileRecord.file_path;
    } else {
      // If relative, construct from project root
      filePath = path.resolve(fileRecord.file_path);
    }
    
    console.log('🔍 Checking file at path:', filePath);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log('❌ File not found on disk at:', filePath);
      
      // Try alternative path constructions
      const alternativePaths = [
        path.join(process.cwd(), fileRecord.file_path),
        path.join(process.cwd(), 'uploads', path.basename(fileRecord.file_path)),
        path.join(__dirname, '..', fileRecord.file_path),
        path.join(__dirname, '../uploads', path.basename(fileRecord.file_path))
      ];
      
      let foundPath = null;
      for (const altPath of alternativePaths) {
        console.log('🔍 Trying alternative path:', altPath);
        if (fs.existsSync(altPath)) {
          foundPath = altPath;
          break;
        }
      }
      
      if (!foundPath) {
        console.log('❌ File not found in any expected location');
        return res.status(404).json({ 
          error: 'File not found on disk',
          debug: {
            storedPath: fileRecord.file_path,
            searchedPaths: [filePath, ...alternativePaths],
            fileName: fileRecord.file_name
          }
        });
      }
      
      filePath = foundPath;
      console.log('✅ Found file at alternative path:', filePath);
    }
    
    // Basic path traversal security check
    const resolvedPath = path.resolve(filePath);
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    
    if (!resolvedPath.startsWith(uploadsDir) && !resolvedPath.includes('uploads')) {
      console.log('❌ Security check failed - file outside uploads directory');
      return res.status(403).json({ error: 'Access denied - invalid file location' });
    }
    
    // Get file stats
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    
    console.log('📊 File stats:', {
      size: fileSize,
      modified: stats.mtime,
      isFile: stats.isFile()
    });
    
    // Determine content type
    const ext = path.extname(fileRecord.file_name || '').toLowerCase();
    let contentType = 'application/octet-stream';
    
    const mimeTypes = {
      // Images
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      
      // Documents
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      
      // Text files
      '.txt': 'text/plain; charset=utf-8',
      '.csv': 'text/csv; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.xml': 'application/xml; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.md': 'text/markdown; charset=utf-8',
      
      // Video
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.wmv': 'video/x-ms-wmv',
      '.flv': 'video/x-flv',
      '.webm': 'video/webm',
      
      // Audio
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.flac': 'audio/flac',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg'
    };
    
    contentType = mimeTypes[ext] || contentType;
    
    console.log('📄 Content type determined:', contentType, 'for extension:', ext);
    
    // Set response headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Accept-Ranges', 'bytes');
    
    // Add filename header for better browser handling
    const encodedFilename = encodeURIComponent(fileRecord.file_name);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedFilename}`);
    
    // Handle range requests for video/audio files
    const range = req.headers.range;
    if (range && (contentType.startsWith('video/') || contentType.startsWith('audio/'))) {
      console.log('📹 Handling range request:', range);
      
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunksize);
      
      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
      return;
    }
    
    // Create and pipe file stream
    const fileStream = fs.createReadStream(filePath);
    
    fileStream.on('error', (error) => {
      console.error('💥 File stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error reading file: ' + error.message });
      }
    });
    
    fileStream.on('open', () => {
      console.log('✅ File stream opened successfully');
    });
    
    fileStream.on('end', () => {
      console.log('✅ File preview completed');
    });
    
    // Pipe the file to response
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('💥 Preview error:', error);
    console.error('📋 Error stack:', error.stack);
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to preview file: ' + error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
});

// ================== Rename/Move File or Folder ==================
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { new_name, new_folder_id, updated_by } = req.body;
  
  console.log("\n✏️ ===== RENAME/MOVE REQUEST =====");
  console.log("🆔 Item ID:", id);
  console.log("📝 New name:", new_name);
  console.log("📁 New folder ID:", new_folder_id);
  console.log("👤 Updated by:", updated_by);
  
  try {
    // Validate updated_by user
    if (!updated_by) {
      return res.status(400).json({ error: "updated_by user ID is required" });
    }
    
    const userExists = await validateUser(updated_by);
    if (!userExists) {
      return res.status(400).json({ error: "Invalid updated_by user" });
    }
    
    // Check if it's a file
    const [fileResult] = await inhouseDb.query("SELECT * FROM files WHERE id = ?", [id]);
    
    if (fileResult.length > 0) {
      const file = fileResult[0];
      const sanitizedName = new_name ? sanitizeInput(new_name) : file.file_name;
      const targetFolderId = new_folder_id !== undefined ? new_folder_id : file.folder_id;
      
      // Validate new folder if provided
      if (targetFolderId) {
        const [folderCheck] = await inhouseDb.query("SELECT id FROM folders WHERE id = ?", [targetFolderId]);
        if (folderCheck.length === 0) {
          return res.status(400).json({ error: "Target folder not found" });
        }
      }
      
      // Check for duplicates in target location
      const duplicateCheck = targetFolderId 
        ? await inhouseDb.query("SELECT id FROM files WHERE file_name = ? AND folder_id = ? AND id != ?", [sanitizedName, targetFolderId, id])
        : await inhouseDb.query("SELECT id FROM files WHERE file_name = ? AND folder_id IS NULL AND id != ?", [sanitizedName, id]);
      
      if (duplicateCheck[0].length > 0) {
        return res.status(400).json({ error: "A file with this name already exists in the target location" });
      }
      
      // Update file
      await inhouseDb.query(
        "UPDATE files SET file_name = ?, folder_id = ?, updated_by = ?, updated_at = NOW() WHERE id = ?",
        [sanitizedName, targetFolderId, updated_by, id]
      );
      
      const action = new_name && new_folder_id !== undefined ? "move_rename" : (new_name ? "rename" : "move");
      await addActivityLog(updated_by, action, "file", id, sanitizedName);
      
      return res.json({
        message: "File updated successfully",
        updatedItem: {
          type: "file",
          id: file.id,
          oldName: file.file_name,
          newName: sanitizedName,
          oldFolderId: file.folder_id,
          newFolderId: targetFolderId
        }
      });
    }
    
    // Check if it's a folder
    const [folderResult] = await inhouseDb.query("SELECT * FROM folders WHERE id = ?", [id]);
    
    if (folderResult.length > 0) {
      const folder = folderResult[0];
      const sanitizedName = new_name ? sanitizeInput(new_name) : folder.name;
      const targetParentId = new_folder_id !== undefined ? new_folder_id : folder.parent_id;
      
      // Validate new parent folder if provided
      if (targetParentId) {
        const [parentCheck] = await inhouseDb.query("SELECT id FROM folders WHERE id = ?", [targetParentId]);
        if (parentCheck.length === 0) {
          return res.status(400).json({ error: "Target parent folder not found" });
        }
        
        // Check for circular reference (moving folder into itself or its descendant)
        const isCircular = await checkCircularReference(id, targetParentId);
        if (isCircular) {
          return res.status(400).json({ error: "Cannot move folder into itself or its descendant" });
        }
      }
      
      // Check for duplicates in target location
      const duplicateCheck = targetParentId 
        ? await inhouseDb.query("SELECT id FROM folders WHERE name = ? AND parent_id = ? AND id != ?", [sanitizedName, targetParentId, id])
        : await inhouseDb.query("SELECT id FROM folders WHERE name = ? AND parent_id IS NULL AND id != ?", [sanitizedName, id]);
      
      if (duplicateCheck[0].length > 0) {
        return res.status(400).json({ error: "A folder with this name already exists in the target location" });
      }
      
      // Update folder
      await inhouseDb.query(
        "UPDATE folders SET name = ?, parent_id = ?, updated_by = ?, updated_at = NOW() WHERE id = ?",
        [sanitizedName, targetParentId, updated_by, id]
      );
      
      const action = new_name && new_folder_id !== undefined ? "move_rename" : (new_name ? "rename" : "move");
      await addActivityLog(updated_by, action, "folder", id, sanitizedName);
      
      return res.json({
        message: "Folder updated successfully",
        updatedItem: {
          type: "folder",
          id: folder.id,
          oldName: folder.name,
          newName: sanitizedName,
          oldParentId: folder.parent_id,
          newParentId: targetParentId
        }
      });
    }
    
    return res.status(404).json({ error: "Item not found" });
    
  } catch (err) {
    console.error("💥 Error updating item:", err);
    res.status(500).json({ error: "Update failed: " + err.message });
  }
});

// ================== Helper: Check Circular Reference ==================
async function checkCircularReference(folderId, targetParentId) {
  let currentId = targetParentId;
  
  while (currentId) {
    if (currentId == folderId) {
      return true; // Circular reference found
    }
    
    const [result] = await inhouseDb.query("SELECT parent_id FROM folders WHERE id = ?", [currentId]);
    if (result.length === 0) break;
    
    currentId = result[0].parent_id;
  }
  
  return false;
}

// ================== Delete File/Folder (UPDATED) ==================
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const { updated_by, force } = req.body;
  
  console.log("\n🗑️ ===== DELETE REQUEST =====");
  console.log("🆔 Item ID:", id);
  console.log("👤 Updated by:", updated_by);
  console.log("💪 Force delete:", force);
  
  try {
    // Validate updated_by user
    if (!updated_by) {
      console.log("❌ Missing updated_by user ID");
      return res.status(400).json({ error: "updated_by user ID is required" });
    }
    
    console.log("🔍 Validating user...");
    const userExists = await validateUser(updated_by);
    if (!userExists) {
      console.log("❌ User validation failed for ID:", updated_by);
      return res.status(400).json({ error: "Invalid updated_by user" });
    }

    // --- Check if it's a file ---
    console.log("🔍 Checking if item is a file...");
    const [fileResult] = await inhouseDb.query("SELECT * FROM files WHERE id = ?", [id]);
    
    if (fileResult.length > 0) {
      console.log("📎 Found file to delete:", fileResult[0].file_name);
      const file = fileResult[0];
      
      // Delete physical file
      if (file.file_path && fs.existsSync(file.file_path)) {
        console.log("🗑️ Deleting physical file:", file.file_path);
        await unlinkAsync(file.file_path);
        console.log("✅ Physical file deleted");
      } else {
        console.log("⚠️ Physical file not found on disk:", file.file_path);
      }
      
      // Delete database record
      console.log("🗑️ Deleting file from database...");
      await inhouseDb.query("DELETE FROM files WHERE id = ?", [id]);
      console.log("✅ File deleted from database");
      
      await addActivityLog(updated_by, "delete", "file", file.id, file.file_name);
      
      return res.json({ 
        message: "File deleted successfully",
        deletedItem: {
          type: "file",
          id: file.id,
          name: file.file_name
        }
      });
    }

    // --- Check if it's a folder ---
    console.log("🔍 Checking if item is a folder...");
    const [folderResult] = await inhouseDb.query("SELECT * FROM folders WHERE id = ?", [id]);
    
    if (folderResult.length > 0) {
      console.log("📁 Found folder to delete:", folderResult[0].name);
      const folder = folderResult[0];
      
      if (force) {
        // Force delete: recursively delete all contents
        console.log("💪 Force deleting folder with all contents...");
        const deletedItems = await recursivelyDeleteFolder(id, updated_by);
        
        return res.json({
          message: "Folder and all contents deleted successfully",
          deletedItem: {
            type: "folder",
            id: folder.id,
            name: folder.name
          },
          deletedContents: deletedItems
        });
      } else {
        // Regular delete: check if folder is empty
        const [containedFiles] = await inhouseDb.query("SELECT id, file_name FROM files WHERE folder_id = ?", [id]);
        const [containedFolders] = await inhouseDb.query("SELECT id, name FROM folders WHERE parent_id = ?", [id]);

        console.log("📊 Folder contents:");
        console.log("  - Files:", containedFiles.length);
        console.log("  - Subfolders:", containedFolders.length);

        if (containedFiles.length > 0 || containedFolders.length > 0) {
          console.log("❌ Cannot delete non-empty folder");
          return res.status(400).json({ 
            error: "Cannot delete non-empty folder. Use force=true to delete with contents, or delete contents first.",
            containedFiles: containedFiles.map(f => f.file_name),
            containedFolders: containedFolders.map(f => f.name)
          });
        }

        console.log("🗑️ Deleting empty folder from database...");
        await inhouseDb.query("DELETE FROM folders WHERE id = ?", [id]);
        console.log("✅ Folder deleted from database");
        
        // Log the folder deletion AFTER getting the folder info but BEFORE deletion
        await addActivityLog(updated_by, "delete", "folder", folder.id, folder.name);
        
        return res.json({ 
          message: "Folder deleted successfully",
          deletedItem: {
            type: "folder",
            id: folder.id,
            name: folder.name
          }
        });
      }
    }

    console.log("❌ Item not found (neither file nor folder)");
    return res.status(404).json({ error: "Item not found" });
    
  } catch (err) {
    console.error("💥 Error during deletion:", err);
    console.error("📋 Error stack:", err.stack);
    res.status(500).json({ error: "Delete failed: " + err.message });
  }
});

// ================== Helper: Recursively Delete Folder (FIXED) ==================
async function recursivelyDeleteFolder(folderId, deletedBy) {
  const deletedItems = { files: [], folders: [] };
  
  try {
    // FIRST: Get the folder info BEFORE deleting it
    const [folderInfo] = await inhouseDb.query("SELECT name FROM folders WHERE id = ?", [folderId]);
    const folderName = folderInfo.length > 0 ? folderInfo[0].name : `Folder ${folderId}`;
    
    // Get all files in this folder
    const [files] = await inhouseDb.query("SELECT * FROM files WHERE folder_id = ?", [folderId]);
    
    // Delete all files
    for (const file of files) {
      // Delete physical file
      if (file.file_path && fs.existsSync(file.file_path)) {
        await unlinkAsync(file.file_path);
      }
      
      // Delete from database
      await inhouseDb.query("DELETE FROM files WHERE id = ?", [file.id]);
      
      deletedItems.files.push({ id: file.id, name: file.file_name });
      await addActivityLog(deletedBy, "delete", "file", file.id, file.file_name, "force_delete_folder");
    }
    
    // Get all subfolders
    const [subfolders] = await inhouseDb.query("SELECT * FROM folders WHERE parent_id = ?", [folderId]);
    
    // Recursively delete subfolders
    for (const subfolder of subfolders) {
      const subfolderDeleted = await recursivelyDeleteFolder(subfolder.id, deletedBy);
      deletedItems.files.push(...subfolderDeleted.files);
      deletedItems.folders.push(...subfolderDeleted.folders);
      deletedItems.folders.push({ id: subfolder.id, name: subfolder.name });
    }
    
    // Delete the folder itself from database
    await inhouseDb.query("DELETE FROM folders WHERE id = ?", [folderId]);
    
    // Log the folder deletion with the correct folder name
    await addActivityLog(deletedBy, "delete", "folder", folderId, folderName, "force_delete");
    
  } catch (error) {
    console.error("💥 Error in recursive delete:", error);
    throw error;
  }
  
  return deletedItems;
}

// ================== Bulk Delete ==================
router.delete("/bulk/delete", async (req, res) => {
  const { ids, updated_by, force } = req.body;
  
  console.log("\n🗑️ ===== BULK DELETE REQUEST =====");
  console.log("🆔 Item IDs:", ids);
  console.log("👤 Updated by:", updated_by);
  console.log("💪 Force delete:", force);
  
  try {
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "IDs array is required" });
    }
    
    if (!updated_by) {
      return res.status(400).json({ error: "updated_by user ID is required" });
    }
    
    const userExists = await validateUser(updated_by);
    if (!userExists) {
      return res.status(400).json({ error: "Invalid updated_by user" });
    }
    
    const results = { deleted: [], errors: [] };
    
    for (const id of ids) {
      try {
        // Try to delete as file first
        const [fileResult] = await inhouseDb.query("SELECT * FROM files WHERE id = ?", [id]);
        
        if (fileResult.length > 0) {
          const file = fileResult[0];
          
          // Delete physical file
          if (file.file_path && fs.existsSync(file.file_path)) {
            await unlinkAsync(file.file_path);
          }
          
          await inhouseDb.query("DELETE FROM files WHERE id = ?", [id]);
          await addActivityLog(updated_by, "delete", "file", file.id, file.file_name, "bulk_delete");
          
          results.deleted.push({ type: "file", id: file.id, name: file.file_name });
          continue;
        }
        
        // Try to delete as folder
        const [folderResult] = await inhouseDb.query("SELECT * FROM folders WHERE id = ?", [id]);
        
        if (folderResult.length > 0) {
          const folder = folderResult[0];
          
          if (force) {
            // Force delete folder with contents
            await recursivelyDeleteFolder(id, updated_by);
            results.deleted.push({ type: "folder", id: folder.id, name: folder.name, forceDeleted: true });
          } else {
            // Check if folder is empty
            const [containedFiles] = await inhouseDb.query("SELECT COUNT(*) as count FROM files WHERE folder_id = ?", [id]);
            const [containedFolders] = await inhouseDb.query("SELECT COUNT(*) as count FROM folders WHERE parent_id = ?", [id]);
            
            if (containedFiles[0].count > 0 || containedFolders[0].count > 0) {
              results.errors.push({ 
                id, 
                name: folder.name, 
                error: "Folder not empty. Use force=true to delete with contents." 
              });
              continue;
            }
            
            await inhouseDb.query("DELETE FROM folders WHERE id = ?", [id]);
            await addActivityLog(updated_by, "delete", "folder", folder.id, folder.name, "bulk_delete");
            
            results.deleted.push({ type: "folder", id: folder.id, name: folder.name });
          }
          continue;
        }
        
        results.errors.push({ id, error: "Item not found" });
        
      } catch (itemError) {
        console.error(`💥 Error deleting item ${id}:`, itemError);
        results.errors.push({ id, error: itemError.message });
      }
    }
    
    res.json({
      message: `Bulk delete completed. ${results.deleted.length} items deleted, ${results.errors.length} errors.`,
      results
    });
    
  } catch (err) {
    console.error("💥 Error in bulk delete:", err);
    res.status(500).json({ error: "Bulk delete failed: " + err.message });
  }
});

// ================== Search Files/Folders ==================
router.get("/search", async (req, res) => {
  const { q: query, type, created_after, created_before, min_size, max_size, created_by } = req.query;
  
  console.log("\n🔍 ===== SEARCH REQUEST =====");
  console.log("🔎 Query:", query);
  console.log("📂 Type filter:", type);
  console.log("📅 Date filters:", { created_after, created_before });
  console.log("📏 Size filters:", { min_size, max_size });
  console.log("👤 Creator filter:", created_by);
  
  try {
    if (!query || query.trim() === '') {
      return res.status(400).json({ error: "Search query is required" });
    }
    
    const searchTerm = `%${query.trim()}%`;
    let results = { files: [], folders: [] };
    
    // Search files
    if (!type || type === 'file') {
      console.log("🔍 Searching files...");
      
      let sql = `SELECT f.*, u.name AS created_by_name, u2.name AS updated_by_name,
                        fo.name AS folder_name
                 FROM files f
                 LEFT JOIN users u ON f.created_by = u.id
                 LEFT JOIN users u2 ON f.updated_by = u2.id
                 LEFT JOIN folders fo ON f.folder_id = fo.id
                 WHERE f.file_name LIKE ?`;
      
      const params = [searchTerm];
      
      if (created_after) {
        sql += " AND f.created_at >= ?";
        params.push(created_after);
      }
      
      if (created_before) {
        sql += " AND f.created_at <= ?";
        params.push(created_before);
      }
      
      if (min_size) {
        sql += " AND f.file_size >= ?";
        params.push(parseInt(min_size));
      }
      
      if (max_size) {
        sql += " AND f.file_size <= ?";
        params.push(parseInt(max_size));
      }
      
      if (created_by) {
        sql += " AND f.created_by = ?";
        params.push(created_by);
      }
      
      sql += " ORDER BY f.file_name ASC LIMIT 100";
      
      const [files] = await inhouseDb.query(sql, params);
      results.files = files;
      console.log("📎 Files found:", files.length);
    }
    
    // Search folders
    if (!type || type === 'folder') {
      console.log("🔍 Searching folders...");
      
      let sql = `SELECT f.*, u.name AS created_by_name, u2.name AS updated_by_name,
                        pf.name AS parent_folder_name
                 FROM folders f
                 LEFT JOIN users u ON f.created_by = u.id
                 LEFT JOIN users u2 ON f.updated_by = u2.id
                 LEFT JOIN folders pf ON f.parent_id = pf.id
                 WHERE f.name LIKE ?`;
      
      const params = [searchTerm];
      
      if (created_after) {
        sql += " AND f.created_at >= ?";
        params.push(created_after);
      }
      
      if (created_before) {
        sql += " AND f.created_at <= ?";
        params.push(created_before);
      }
      
      if (created_by) {
        sql += " AND f.created_by = ?";
        params.push(created_by);
      }
      
      sql += " ORDER BY f.name ASC LIMIT 100";
      
      const [folders] = await inhouseDb.query(sql, params);
      results.folders = folders;
      console.log("📁 Folders found:", folders.length);
    }
    
    console.log("✅ Search completed");
    res.json({
      query: query.trim(),
      filters: { type, created_after, created_before, min_size, max_size, created_by },
      results: results,
      totalResults: results.files.length + results.folders.length
    });
    
  } catch (err) {
    console.error("💥 Error during search:", err);
    res.status(500).json({ error: "Search failed: " + err.message });
  }
});


// ================== Get Statistics ==================
router.get("/stats", async (req, res) => {
  console.log("\n📊 ===== GET STATISTICS =====");
  
  try {
    // Get total counts
    const [fileCount] = await inhouseDb.query("SELECT COUNT(*) as count FROM files");
    const [folderCount] = await inhouseDb.query("SELECT COUNT(*) as count FROM folders");
    
    // Get total file size
    const [sizeResult] = await inhouseDb.query("SELECT SUM(file_size) as total_size FROM files");
    const totalSize = sizeResult[0].total_size || 0;
    
    // Get file type distribution
    const [fileTypes] = await inhouseDb.query(`
      SELECT file_type, COUNT(*) as count, SUM(file_size) as total_size
      FROM files 
      WHERE file_type IS NOT NULL AND file_type != ''
      GROUP BY file_type 
      ORDER BY count DESC
      LIMIT 10
    `);
    
    // Get recent activity
    const [recentActivity] = await inhouseDb.query(`
      SELECT COUNT(*) as count, action
      FROM activity_logs 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY action
      ORDER BY count DESC
    `);
    
    // Get top users by file count
    const [topUsers] = await inhouseDb.query(`
      SELECT u.name, COUNT(*) as file_count, SUM(f.file_size) as total_size
      FROM files f
      JOIN users u ON f.created_by = u.id
      GROUP BY f.created_by, u.name
      ORDER BY file_count DESC
      LIMIT 5
    `);
    
    const stats = {
      totalFiles: fileCount[0].count,
      totalFolders: folderCount[0].count,
      totalSize: totalSize,
      totalSizeFormatted: formatFileSize(totalSize),
      fileTypes: fileTypes,
      recentActivity: recentActivity,
      topUsers: topUsers,
      averageFileSize: fileCount[0].count > 0 ? Math.round(totalSize / fileCount[0].count) : 0,
      averageFileSizeFormatted: fileCount[0].count > 0 ? formatFileSize(Math.round(totalSize / fileCount[0].count)) : '0 Bytes'
    };
    
    console.log("📊 Statistics:", stats);
    res.json(stats);
    
  } catch (err) {
    console.error("💥 Error getting statistics:", err);
    res.status(500).json({ error: "Failed to get statistics: " + err.message });
  }
});

// ================== Get Activity Logs ==================
router.get("/activity-logs", async (req, res) => {
  const { user_id, action, target_type, limit = 100, offset = 0 } = req.query;

  let sql = `SELECT al.*, u.name AS user_name
             FROM activity_logs al
             JOIN users u ON al.user_id = u.id
             WHERE 1=1`;
  const params = [];

  if (user_id) {
    sql += " AND al.user_id = ?";
    params.push(user_id);
  }
  if (action) {
    sql += " AND al.action = ?";
    params.push(action);
  }
  if (target_type) {
    sql += " AND al.target_type = ?";
    params.push(target_type);
  }

  sql += " ORDER BY al.created_at DESC LIMIT ? OFFSET ?";
  params.push(parseInt(limit), parseInt(offset));

  try {
    const [rows] = await inhouseDb.query(sql, params);
    
    // Get total count for pagination
    let countSql = `SELECT COUNT(*) as total FROM activity_logs al WHERE 1=1`;
    const countParams = [];
    
    if (user_id) {
      countSql += " AND al.user_id = ?";
      countParams.push(user_id);
    }
    if (action) {
      countSql += " AND al.action = ?";
      countParams.push(action);
    }
    if (target_type) {
      countSql += " AND al.target_type = ?";
      countParams.push(target_type);
    }
    
    const [countResult] = await inhouseDb.query(countSql, countParams);
    
    res.json({
      logs: rows,
      pagination: {
        total: countResult[0].total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: countResult[0].total > (parseInt(offset) + parseInt(limit))
      }
    });
  } catch (err) {
    console.error("Error fetching activity logs:", err);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

// ================== Copy Files/Folders ==================
router.post("/copy", async (req, res) => {
  const { source_ids, target_folder_id, created_by } = req.body;
  
  console.log("\n📋 ===== COPY REQUEST =====");
  console.log("🆔 Source IDs:", source_ids);
  console.log("📁 Target folder ID:", target_folder_id);
  console.log("👤 Created by:", created_by);
  
  try {
    if (!Array.isArray(source_ids) || source_ids.length === 0) {
      return res.status(400).json({ error: "source_ids array is required" });
    }
    
    if (!created_by) {
      return res.status(400).json({ error: "created_by user ID is required" });
    }
    
    const userExists = await validateUser(created_by);
    if (!userExists) {
      return res.status(400).json({ error: "Invalid created_by user" });
    }
    
    // Validate target folder if provided
    if (target_folder_id) {
      const [folderCheck] = await inhouseDb.query("SELECT id FROM folders WHERE id = ?", [target_folder_id]);
      if (folderCheck.length === 0) {
        return res.status(400).json({ error: "Target folder not found" });
      }
    }
    
    const results = { copied: [], errors: [] };
    
    for (const sourceId of source_ids) {
      try {
        // Try to copy file
        const [fileResult] = await inhouseDb.query("SELECT * FROM files WHERE id = ?", [sourceId]);
        
        if (fileResult.length > 0) {
          const originalFile = fileResult[0];
          let copyName = originalFile.file_name;
          let counter = 1;
          
          // Find unique name
          while (true) {
            const duplicateCheck = target_folder_id 
              ? await inhouseDb.query("SELECT id FROM files WHERE file_name = ? AND folder_id = ?", [copyName, target_folder_id])
              : await inhouseDb.query("SELECT id FROM files WHERE file_name = ? AND folder_id IS NULL", [copyName]);
            
            if (duplicateCheck[0].length === 0) break;
            
            const nameWithoutExt = path.parse(originalFile.file_name).name;
            const ext = path.parse(originalFile.file_name).ext;
            copyName = `${nameWithoutExt} (Copy ${counter})${ext}`;
            counter++;
          }
          
          // Copy physical file
          const newFilePath = path.join(path.dirname(originalFile.file_path), Date.now() + "-" + copyName.replace(/[^a-zA-Z0-9.-]/g, '_'));
          await fs.promises.copyFile(originalFile.file_path, newFilePath);
          
          // Insert copy into database
          const [result] = await inhouseDb.query(
            `INSERT INTO files (folder_id, file_name, file_path, file_type, file_size, created_by, updated_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
              target_folder_id || null,
              copyName,
              newFilePath,
              originalFile.file_type,
              originalFile.file_size,
              created_by,
              created_by,
            ]
          );
          
          await addActivityLog(created_by, "copy", "file", result.insertId, copyName, JSON.stringify({ source_id: sourceId }));
          
          results.copied.push({
            type: "file",
            originalId: sourceId,
            newId: result.insertId,
            originalName: originalFile.file_name,
            newName: copyName
          });
          
          continue;
        }
        
        // Try to copy folder (simplified - doesn't copy contents)
        const [folderResult] = await inhouseDb.query("SELECT * FROM folders WHERE id = ?", [sourceId]);
        
        if (folderResult.length > 0) {
          const originalFolder = folderResult[0];
          let copyName = originalFolder.name;
          let counter = 1;
          
          // Find unique name
          while (true) {
            const duplicateCheck = target_folder_id 
              ? await inhouseDb.query("SELECT id FROM folders WHERE name = ? AND parent_id = ?", [copyName, target_folder_id])
              : await inhouseDb.query("SELECT id FROM folders WHERE name = ? AND parent_id IS NULL", [copyName]);
            
            if (duplicateCheck[0].length === 0) break;
            
            copyName = `${originalFolder.name} (Copy ${counter})`;
            counter++;
          }
          
          const [result] = await inhouseDb.query(
            `INSERT INTO folders (name, parent_id, created_by, updated_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, NOW(), NOW())`,
            [copyName, target_folder_id || null, created_by, created_by]
          );
          
          await addActivityLog(created_by, "copy", "folder", result.insertId, copyName, JSON.stringify({ source_id: sourceId }));
          
          results.copied.push({
            type: "folder",
            originalId: sourceId,
            newId: result.insertId,
            originalName: originalFolder.name,
            newName: copyName
          });
          
          continue;
        }
        
        results.errors.push({ id: sourceId, error: "Item not found" });
        
      } catch (itemError) {
        console.error(`💥 Error copying item ${sourceId}:`, itemError);
        results.errors.push({ id: sourceId, error: itemError.message });
      }
    }
    
    res.json({
      message: `Copy completed. ${results.copied.length} items copied, ${results.errors.length} errors.`,
      results
    });
    
  } catch (err) {
    console.error("💥 Error in copy operation:", err);
    res.status(500).json({ error: "Copy failed: " + err.message });
  }
});

/*
// ================== Error Handler ==================
router.use((error, req, res, next) => {
  console.error("💥 Unhandled error in files router:", error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `File too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.` });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: "Unexpected file field." });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: `Too many files. Maximum is ${MAX_FILES_PER_REQUEST} files per request.` });
    }
  }
  
  res.status(500).json({ error: "Internal server error: " + error.message });
});
*/

// ================== Get File/Folder Info ==================
router.get("/info/:id", async (req, res) => {
  const { id } = req.params;
  
  console.log("\n📋 ===== GET ITEM INFO =====");
  console.log("🆔 Item ID:", id);
  
  try {
    // Check if it's a file
    const [fileResult] = await inhouseDb.query(
      `SELECT f.*, u.name AS created_by_name, u2.name AS updated_by_name,
              fo.name AS folder_name, fo.id AS folder_id
       FROM files f
       LEFT JOIN users u ON f.created_by = u.id
       LEFT JOIN users u2 ON f.updated_by = u2.id
       LEFT JOIN folders fo ON f.folder_id = fo.id
       WHERE f.id = ?`,
      [id]
    );
    
    if (fileResult.length > 0) {
      const file = fileResult[0];
      
      // Get file stats if file exists on disk
      let fileStats = null;
      if (fs.existsSync(file.file_path)) {
        const stats = await fs.promises.stat(file.file_path);
        fileStats = {
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          accessed: stats.atime
        };
      }
      
      return res.json({
        type: "file",
        id: file.id,
        name: file.file_name,
        path: file.file_path,
        size: file.file_size,
        sizeFormatted: formatFileSize(file.file_size),
        fileType: file.file_type,
        folder: file.folder_id ? {
          id: file.folder_id,
          name: file.folder_name
        } : null,
        createdBy: {
          id: file.created_by,
          name: file.created_by_name
        },
        updatedBy: {
          id: file.updated_by,
          name: file.updated_by_name
        },
        createdAt: file.created_at,
        updatedAt: file.updated_at,
        fileStats: fileStats,
        exists: fs.existsSync(file.file_path)
      });
    }
    
    // Check if it's a folder
    const [folderResult] = await inhouseDb.query(
      `SELECT f.*, u.name AS created_by_name, u2.name AS updated_by_name,
              pf.name AS parent_folder_name, pf.id AS parent_folder_id
       FROM folders f
       LEFT JOIN users u ON f.created_by = u.id
       LEFT JOIN users u2 ON f.updated_by = u2.id
       LEFT JOIN folders pf ON f.parent_id = pf.id
       WHERE f.id = ?`,
      [id]
    );
    
    if (folderResult.length > 0) {
      const folder = folderResult[0];
      
      // Get folder statistics
      const [fileCount] = await inhouseDb.query("SELECT COUNT(*) as count FROM files WHERE folder_id = ?", [id]);
      const [subfolderCount] = await inhouseDb.query("SELECT COUNT(*) as count FROM folders WHERE parent_id = ?", [id]);
      const [totalSize] = await inhouseDb.query("SELECT SUM(file_size) as total FROM files WHERE folder_id = ?", [id]);
      
      return res.json({
        type: "folder",
        id: folder.id,
        name: folder.name,
        parentFolder: folder.parent_folder_id ? {
          id: folder.parent_folder_id,
          name: folder.parent_folder_name
        } : null,
        createdBy: {
          id: folder.created_by,
          name: folder.created_by_name
        },
        updatedBy: {
          id: folder.updated_by,
          name: folder.updated_by_name
        },
        createdAt: folder.created_at,
        updatedAt: folder.updated_at,
        statistics: {
          fileCount: fileCount[0].count,
          subfolderCount: subfolderCount[0].count,
          totalSize: totalSize[0].total || 0,
          totalSizeFormatted: formatFileSize(totalSize[0].total || 0)
        }
      });
    }
    
    return res.status(404).json({ error: "Item not found" });
    
  } catch (err) {
    console.error("💥 Error getting item info:", err);
    res.status(500).json({ error: "Failed to get item info: " + err.message });
  }
});

// ================== Create Multiple Folders ==================
router.post("/folders/bulk", async (req, res) => {
  const { folders, created_by } = req.body;
  
  console.log("\n📁 ===== BULK CREATE FOLDERS =====");
  console.log("📥 Folders to create:", folders);
  console.log("👤 Created by:", created_by);
  
  try {
    if (!Array.isArray(folders) || folders.length === 0) {
      return res.status(400).json({ error: "folders array is required" });
    }
    
    if (!created_by) {
      return res.status(400).json({ error: "created_by user ID is required" });
    }
    
    const userExists = await validateUser(created_by);
    if (!userExists) {
      return res.status(400).json({ error: "Invalid created_by user" });
    }
    
    const results = { created: [], errors: [] };
    
    for (const folderData of folders) {
      try {
        const { name, parent_id } = folderData;
        
        if (!name || name.trim() === '') {
          results.errors.push({ folderData, error: "Folder name is required" });
          continue;
        }
        
        const sanitizedName = sanitizeInput(name);
        
        // Validate parent folder if provided
        if (parent_id) {
          const [parentCheck] = await inhouseDb.query("SELECT id FROM folders WHERE id = ?", [parent_id]);
          if (parentCheck.length === 0) {
            results.errors.push({ folderData, error: "Parent folder not found" });
            continue;
          }
        }
        
        // Check for duplicates
        const duplicateCheck = parent_id 
          ? await inhouseDb.query("SELECT id FROM folders WHERE name = ? AND parent_id = ?", [sanitizedName, parent_id])
          : await inhouseDb.query("SELECT id FROM folders WHERE name = ? AND parent_id IS NULL", [sanitizedName]);
        
        if (duplicateCheck[0].length > 0) {
          results.errors.push({ folderData, error: "A folder with this name already exists in the same location" });
          continue;
        }
        
        // Create folder
        const [result] = await inhouseDb.query(
          `INSERT INTO folders (name, parent_id, created_by, updated_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, NOW(), NOW())`,
          [sanitizedName, parent_id || null, created_by, created_by]
        );
        
        await addActivityLog(created_by, "create", "folder", result.insertId, sanitizedName, "bulk_create");
        
        results.created.push({
          id: result.insertId,
          name: sanitizedName,
          parent_id: parent_id || null
        });
        
      } catch (folderError) {
        console.error("💥 Error creating folder:", folderError);
        results.errors.push({ folderData, error: folderError.message });
      }
    }
    
    res.json({
      message: `Bulk folder creation completed. ${results.created.length} folders created, ${results.errors.length} errors.`,
      results
    });
    
  } catch (err) {
    console.error("💥 Error in bulk folder creation:", err);
    res.status(500).json({ error: "Bulk folder creation failed: " + err.message });
  }
});

// ================== Get Recent Files ==================
router.get("/recent", async (req, res) => {
  const { limit = 20, user_id } = req.query;
  
  console.log("\n🕒 ===== GET RECENT FILES =====");
  console.log("📊 Limit:", limit);
  console.log("👤 User filter:", user_id);
  
  try {
    let sql = `SELECT f.*, u.name AS created_by_name, fo.name AS folder_name
               FROM files f
               LEFT JOIN users u ON f.created_by = u.id
               LEFT JOIN folders fo ON f.folder_id = fo.id
               WHERE 1=1`;
    
    const params = [];
    
    if (user_id) {
      sql += " AND f.created_by = ?";
      params.push(user_id);
    }
    
    sql += " ORDER BY f.created_at DESC LIMIT ?";
    params.push(parseInt(limit));
    
    const [files] = await inhouseDb.query(sql, params);
    
    res.json({
      files: files,
      count: files.length,
      limit: parseInt(limit)
    });
    
  } catch (err) {
    console.error("💥 Error getting recent files:", err);
    res.status(500).json({ error: "Failed to get recent files: " + err.message });
  }
});

// ================== Check Disk Space ==================
router.get("/disk-usage", async (req, res) => {
  console.log("\n💾 ===== CHECK DISK USAGE =====");
  
  try {
    // Get total size from database
    const [dbSize] = await inhouseDb.query("SELECT SUM(file_size) as total FROM files");
    const totalDbSize = dbSize[0].total || 0;
    
    // Calculate actual disk usage by checking upload directory
    let actualDiskUsage = 0;
    const uploadDir = path.join(__dirname, '../uploads');
    
    if (fs.existsSync(uploadDir)) {
      const calculateDirSize = async (dirPath) => {
        let size = 0;
        const files = await fs.promises.readdir(dirPath);
        
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const stats = await fs.promises.stat(filePath);
          
          if (stats.isDirectory()) {
            size += await calculateDirSize(filePath);
          } else {
            size += stats.size;
          }
        }
        
        return size;
      };
      
      actualDiskUsage = await calculateDirSize(uploadDir);
    }
    
    // Get file count by type
    const [fileTypes] = await inhouseDb.query(`
      SELECT file_type, COUNT(*) as count, SUM(file_size) as size
      FROM files 
      WHERE file_type IS NOT NULL AND file_type != ''
      GROUP BY file_type
      ORDER BY size DESC
    `);
    
    res.json({
      databaseSize: totalDbSize,
      databaseSizeFormatted: formatFileSize(totalDbSize),
      actualDiskUsage: actualDiskUsage,
      actualDiskUsageFormatted: formatFileSize(actualDiskUsage),
      difference: Math.abs(actualDiskUsage - totalDbSize),
      differenceFormatted: formatFileSize(Math.abs(actualDiskUsage - totalDbSize)),
      isConsistent: Math.abs(actualDiskUsage - totalDbSize) < (1024 * 1024), // Within 1MB difference
      fileTypeBreakdown: fileTypes
    });
    
  } catch (err) {
    console.error("💥 Error checking disk usage:", err);
    res.status(500).json({ error: "Failed to check disk usage: " + err.message });
  }
});

// ================== Cleanup Orphaned Files ==================
router.post("/cleanup", async (req, res) => {
  const { dry_run = true, updated_by } = req.body;
  
  console.log("\n🧹 ===== CLEANUP ORPHANED FILES =====");
  console.log("🔍 Dry run:", dry_run);
  console.log("👤 Updated by:", updated_by);
  
  try {
    if (!updated_by) {
      return res.status(400).json({ error: "updated_by user ID is required" });
    }
    
    const userExists = await validateUser(updated_by);
    if (!userExists) {
      return res.status(400).json({ error: "Invalid updated_by user" });
    }
    
    // Find database records without physical files
    const [dbFiles] = await inhouseDb.query("SELECT id, file_name, file_path FROM files");
    const missingFiles = [];
    
    for (const file of dbFiles) {
      if (!fs.existsSync(file.file_path)) {
        missingFiles.push(file);
      }
    }
    
    // Find physical files without database records
    const uploadDir = path.join(__dirname, '../uploads');
    const orphanedFiles = [];
    
    if (fs.existsSync(uploadDir)) {
      const scanDirectory = async (dirPath) => {
        const files = await fs.promises.readdir(dirPath);
        
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const stats = await fs.promises.stat(filePath);
          
          if (stats.isFile()) {
            const [dbCheck] = await inhouseDb.query("SELECT id FROM files WHERE file_path = ?", [filePath]);
            if (dbCheck.length === 0) {
              orphanedFiles.push({
                path: filePath,
                name: file,
                size: stats.size,
                modified: stats.mtime
              });
            }
          } else if (stats.isDirectory()) {
            await scanDirectory(filePath);
          }
        }
      };
      
      await scanDirectory(uploadDir);
    }
    
    if (!dry_run) {
      // Clean up database records for missing files
      for (const missingFile of missingFiles) {
        await inhouseDb.query("DELETE FROM files WHERE id = ?", [missingFile.id]);
        await addActivityLog(updated_by, "cleanup_delete", "file", missingFile.id, missingFile.file_name, "missing_physical_file");
      }
      
      // Clean up orphaned physical files
      for (const orphanedFile of orphanedFiles) {
        await fs.promises.unlink(orphanedFile.path);
        await addActivityLog(updated_by, "cleanup_delete", "file", null, orphanedFile.name, "orphaned_physical_file");
      }
    }
    
    res.json({
      message: dry_run ? "Cleanup analysis completed" : "Cleanup completed",
      dryRun: dry_run,
      missingFiles: {
        count: missingFiles.length,
        files: missingFiles.map(f => ({ id: f.id, name: f.file_name, path: f.file_path }))
      },
      orphanedFiles: {
        count: orphanedFiles.length,
        totalSize: orphanedFiles.reduce((sum, f) => sum + f.size, 0),
        totalSizeFormatted: formatFileSize(orphanedFiles.reduce((sum, f) => sum + f.size, 0)),
        files: orphanedFiles
      },
      summary: {
        totalIssues: missingFiles.length + orphanedFiles.length,
        cleaned: !dry_run
      }
    });
    
  } catch (err) {
    console.error("💥 Error during cleanup:", err);
    res.status(500).json({ error: "Cleanup failed: " + err.message });
  }
});

// =================== Helper: Fetch User ==================
// GET /api/users - Get all users for sharing
router.get('/users', async (req, res) => {
  try {
    const [rows] = await inhouseDb.query(
      "SELECT id, name, user_name, email, department, role FROM users ORDER BY name"
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ================== Star a File (Toggle) ==================
router.post("/star/:fileId", async (req, res) => {
  const { fileId } = req.params;
  const { user_id } = req.body;

  console.log("\n⭐ ===== TOGGLE STAR FILE =====");
  console.log("📎 File ID:", fileId);
  console.log("👤 User ID:", user_id);

  try {
    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const userExists = await validateUser(user_id);
    if (!userExists) {
      return res.status(400).json({ error: "Invalid user" });
    }

    // Check if file exists
    const [fileCheck] = await inhouseDb.query("SELECT id, file_name FROM files WHERE id = ?", [fileId]);
    if (fileCheck.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    // Check if already starred
    const [existing] = await inhouseDb.query(
      "SELECT id FROM starred_files WHERE user_id = ? AND file_id = ?",
      [user_id, fileId]
    );

    if (existing.length > 0) {
      // Already starred → unstar
      await inhouseDb.query(
        "DELETE FROM starred_files WHERE user_id = ? AND file_id = ?",
        [user_id, fileId]
      );
      console.log("✅ File unstarred");
      return res.json({ message: "File unstarred successfully", starred: false, fileId, fileName: fileCheck[0].file_name });
    } else {
      // Not starred → star it
      await inhouseDb.query(
        "INSERT INTO starred_files (user_id, file_id, created_at) VALUES (?, ?, NOW())",
        [user_id, fileId]
      );
      console.log("✅ File starred");
      return res.json({ message: "File starred successfully", starred: true, fileId, fileName: fileCheck[0].file_name });
    }

  } catch (err) {
    console.error("💥 Error toggling star:", err);
    res.status(500).json({ error: "Failed to toggle star: " + err.message });
  }
});

// ================== Get All Starred Files for a User ==================
router.get("/starred", async (req, res) => {
  const { user_id } = req.query;

  console.log("\n⭐ ===== GET STARRED FILES =====");
  console.log("👤 User ID:", user_id);

  try {
    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const userExists = await validateUser(user_id);
    if (!userExists) {
      return res.status(400).json({ error: "Invalid user" });
    }

    const [starredFiles] = await inhouseDb.query(
      `SELECT f.*, 
              sf.created_at AS starred_at,
              u.name AS created_by_name,
              fo.name AS folder_name
       FROM starred_files sf
       JOIN files f ON sf.file_id = f.id
       LEFT JOIN users u ON f.created_by = u.id
       LEFT JOIN folders fo ON f.folder_id = fo.id
       WHERE sf.user_id = ?
       ORDER BY sf.created_at DESC`,
      [user_id]
    );

    console.log("⭐ Starred files found:", starredFiles.length);

    res.json({
      starredFiles,
      count: starredFiles.length
    });

  } catch (err) {
    console.error("💥 Error getting starred files:", err);
    res.status(500).json({ error: "Failed to get starred files: " + err.message });
  }
});

// ================== Unstar a File ==================
router.delete("/star/:fileId", async (req, res) => {
  const { fileId } = req.params;
  const { user_id } = req.body;

  console.log("\n⭐ ===== UNSTAR FILE =====");
  console.log("📎 File ID:", fileId);
  console.log("👤 User ID:", user_id);

  try {
    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const userExists = await validateUser(user_id);
    if (!userExists) {
      return res.status(400).json({ error: "Invalid user" });
    }

    const [result] = await inhouseDb.query(
      "DELETE FROM starred_files WHERE user_id = ? AND file_id = ?",
      [user_id, fileId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Star not found — file was not starred by this user" });
    }

    console.log("✅ File unstarred");
    res.json({ message: "File unstarred successfully", starred: false, fileId });

  } catch (err) {
    console.error("💥 Error unstarring file:", err);
    res.status(500).json({ error: "Failed to unstar file: " + err.message });
  }
});

// ================== Check if File is Starred ==================
router.get("/star/status/:fileId", async (req, res) => {
  const { fileId } = req.params;
  const { user_id } = req.query;

  try {
    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const [result] = await inhouseDb.query(
      "SELECT id, created_at FROM starred_files WHERE user_id = ? AND file_id = ?",
      [user_id, fileId]
    );

    res.json({
      fileId,
      starred: result.length > 0,
      starredAt: result.length > 0 ? result[0].created_at : null
    });

  } catch (err) {
    console.error("💥 Error checking star status:", err);
    res.status(500).json({ error: "Failed to check star status: " + err.message });
  }
});

// Add error handler at the end
router.use(handleMulterError);

console.log("📁 Enhanced Files router loaded with comprehensive features");

module.exports = router;
