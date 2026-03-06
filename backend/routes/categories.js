const express = require('express');
const path = require('path');
//const db = require('../db.js');
const inhouseDb = require("../dbInhouse");
const fs = require('fs');
const util = require('util');
const validator = require('validator');
const unlinkAsync = util.promisify(fs.unlink);
const mysql = require('mysql2/promise');
const { PDFDocument } = require('pdf-lib');
const qpdf = require('node-qpdf2');
const passwordManager = require('../utils/passwordManager.js');
const wordPasswordManager = require('../utils/wordPasswordManager');
const excelPasswordManager = require('../utils/excelPasswordManager');

// Import centralized multer config
const { 
  uploadMultiple, 
  uploadSingle,  // Added this import
  handleMulterError, 
  formatFileSize, 
  validateFileType, 
  validateFilePath, 
  cleanupFiles,
  MAX_FILES_PER_REQUEST 
} = require('../config/multerConfig.js');

const router = express.Router();

// ========= Helper Validate User =============
async function validateUser(userId) {
    console.log("Validating user ID:", userId, "Type", typeof userId);

    try {
        const [rows] = await inhouseDb.query("select id, name, email from users where id = ?", [userId])
        console.log("User validation query result:", rows);

        if (rows.length > 0) {
            console.log("User found:", rows[0]);
            return true;
        } else {
            console.log("No user found with ID:", userId);
            return false;
        }
    } catch (error) {
        console.error("Error validating user:", error);
        return false;
    }
}

// ========== Helper: Get User Details ============
async function getUserDetails(userId) {
    try{
        const [rows] = await inhouseDb.query("select id, name, user_name, email from users where id = ?", [userId]);
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error("Error getting user details:", error);
        return null;
    }
}

// ========== Helper: Sanitize Input ============
function sanitizeInput(input) {
    if (!input) return input;
    return validator.escape(input.toString().trim());
}

// ========== Helper: Check File Access (Owner or Shared) ============
async function checkFileAccess(fileId, userId, fileType = 'category') {
    try {
        let fileTable, shareColumn;
        
        if (fileType === 'category') {
            fileTable = 'categories_files';
            shareColumn = 'category_file_id';
        } else {
            fileTable = 'files';
            shareColumn = 'file_id';
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

// ================== Fixed activity log SQL ==================
async function addActivityLog(userId, action, targetType, targetId, targetName, additionalInfo = null) {
    try {
        const actionMap = {
            'create': 'CREATE',
            'upload': 'CREATE',
            'update': 'UPDATE',
            'rename': 'UPDATE',
            'move': 'UPDATE',
            'move_rename': 'UPDATE',
            'delete': 'DELETE',
            'download': 'DOWNLOAD',
            'copy': 'CREATE',
            'star': 'UPDATE',
            'unstar': 'UPDATE'
        };

        const entityTypeMap = {
            'file': 'FILE',
            'folder': 'FOLDER'
        };

        const mappedAction = actionMap[action] || 'CREATE';
        const mappedEntityType = entityTypeMap[targetType] || 'FILE';

        let description = targetName;
        if (additionalInfo) {
            description += ` - ${additionalInfo}`;
        }

        await inhouseDb.query(
            `INSERT INTO activity_logs (user_id, action, target_type, target_id, target_name, additional_info, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [userId, mappedAction, mappedEntityType, targetId, targetName, additionalInfo]
        );

        console.log(`Log: ${mappedAction} ${mappedEntityType} (${targetName}) by user ${userId}`);
    } catch (error) {
        console.error("Error adding activity log:", error);
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
// ================== Get All Categories ==================
router.get('/categories', async (req, res) => {
  try {
    const { is_active, created_by } = req.query;
    
    let query = `
      SELECT c.*, u.name as created_by_name, uu.name as updated_by_name
      FROM categories c
      LEFT JOIN users u ON c.created_by = u.id
      LEFT JOIN users uu ON c.updated_by = uu.id
      WHERE 1=1
    `;
    const params = [];

    if (is_active !== undefined) {
      query += " AND c.is_active = ?";
      params.push(is_active === 'true' ? 1 : 0);
    }

    if (created_by) {
      query += " AND c.created_by = ?";
      params.push(created_by);
    }

    query += " ORDER BY c.created_at DESC";

    const [categories] = await inhouseDb.query(query, params);

    res.json({
      message: "Categories retrieved successfully",
      categories: categories
    });

  } catch (error) {
    console.error("Error getting categories:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
*/
// ================== Get All Categories (FIXED - With User Names) ==================
router.get('/categories', async (req, res) => {
  try {
    const { is_active, created_by } = req.query;
    
    console.log('🔍 Fetching categories...', { is_active, created_by });
    
    // ✅ FIXED: Added JOINs to get user names
    let query = `
      SELECT 
        c.*,
        u.name as created_by_name,
        u.user_name as created_by_username,
        u2.name as updated_by_name,
        u2.user_name as updated_by_username
      FROM categories c
      LEFT JOIN users u ON c.created_by = u.id
      LEFT JOIN users u2 ON c.updated_by = u2.id
      WHERE 1=1
    `;
    const params = [];
    
    if (is_active !== undefined) {
      query += " AND c.is_active = ?";
      params.push(is_active === 'true' ? 1 : 0);
    }
    if (created_by) {
      query += " AND c.created_by = ?";
      params.push(created_by);
    }
    query += " ORDER BY c.created_at DESC";
    
    console.log('📝 Query:', query);
    console.log('📊 Params:', params);
    
    // ✅ Use db.query() directly (already using mysql2/promise)
    const [categories] = await inhouseDb.query(query, params);
    console.log('✅ Success! Found', categories.length, 'categories');
    console.log('📋 Sample category:', categories[0]); // Log first result to verify user names
    
    res.json({
      message: "Categories retrieved successfully",
      categories: categories || [],
      count: categories.length
    });
  } catch (error) {
    console.error("❌ Error getting categories:", error);
    res.status(500).json({ 
      error: "Internal server error",
      details: error.message
    });
  }
});
/*
// ================== Create Category ==================
router.post('/categories', async (req, res) => {
  try {
    const { name, description, color, icon, is_active, created_by } = req.body;

    if (!name || !created_by) {
      return res.status(400).json({ error: "Name and created_by are required" });
    }

    const sanitizedName = sanitizeInput(name);
    const sanitizedDesc = sanitizeInput(description || "");
    const sanitizedColor = sanitizeInput(color || "#007bff");
    const sanitizedIcon = sanitizeInput(icon || "folder");
    const sanitizedActive = is_active !== undefined ? (is_active ? 1 : 0) : 1;

    const userValid = await validateUser(created_by);
    if (!userValid) {
      return res.status(400).json({ error: "Invalid created_by user" });
    }

    const [result] = await inhouseDb.query(
      `INSERT INTO categories 
      (name, description, color, icon, is_active, created_by, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [sanitizedName, sanitizedDesc, sanitizedColor, sanitizedIcon, sanitizedActive, created_by]
    );

    await addActivityLog(created_by, 'create', 'folder', result.insertId, sanitizedName);

    res.status(201).json({
      message: "Category created successfully",
      category_id: result.insertId
    });

  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
*/

// ================== Create Category ==================
router.post('/categories', async (req, res) => {
  try {
    const { name, description, color, icon, is_active, created_by } = req.body;

    if (!name || !created_by) {
      return res.status(400).json({ error: "Name and created_by are required" });
    }

    const sanitizedName = sanitizeInput(name);
    const sanitizedDesc = sanitizeInput(description || "");
    const sanitizedColor = sanitizeInput(color || "#007bff");
    const sanitizedIcon = sanitizeInput(icon || "folder");
    const sanitizedActive = is_active !== undefined ? (is_active ? 1 : 0) : 1;

    const userValid = await validateUser(created_by);
    if (!userValid) {
      return res.status(400).json({ error: "Invalid created_by user" });
    }

    const [result] = await inhouseDb.query(
      `INSERT INTO categories 
      (name, description, color, icon, is_active, created_by, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [sanitizedName, sanitizedDesc, sanitizedColor, sanitizedIcon, sanitizedActive, created_by]
    );

    await addActivityLog(created_by, 'create', 'folder', result.insertId, sanitizedName);

    res.status(201).json({
      message: "Category created successfully",
      category_id: result.insertId
    });

  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/*
// ================== Get Single Category ==================
router.get('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "Valid category ID is required" });
    }

    const [categories] = await inhouseDb.query(
      `SELECT c.*, u.name as created_by_name, uu.name as updated_by_name
       FROM categories c
       LEFT JOIN users u ON c.created_by = u.id
       LEFT JOIN users uu ON c.updated_by = uu.id
       WHERE c.id = ?`,
      [id]
    );

    if (categories.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    res.json({
      message: "Category retrieved successfully",
      category: categories[0]
    });

  } catch (error) {
    console.error("Error getting category:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
*/
// ================== Get Single Category (FIXED) ==================
router.get('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "Valid category ID is required" });
    }

    const [categories] = await inhouseDb.query(
      `SELECT * FROM categories WHERE id = ?`,
      [id]
    );

    if (categories.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    res.json({
      message: "Category retrieved successfully",
      category: categories[0]
    });

  } catch (error) {
    console.error("Error getting category:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/*
// ================== Delete Category ==================
router.delete('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { deleted_by } = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "Valid category ID is required" });
    }

    if (!deleted_by) {
      return res.status(400).json({ error: "deleted_by is required" });
    }

    const userValid = await validateUser(deleted_by);
    if (!userValid) {
      return res.status(400).json({ error: "Invalid deleted_by user" });
    }

    const [existingCategories] = await inhouseDb.query("SELECT * FROM categories WHERE id = ?", [id]);
    if (existingCategories.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    const category = existingCategories[0];

    const [folders] = await inhouseDb.query("SELECT COUNT(*) as count FROM categories_folders WHERE category_id = ?", [id]);
    if (folders[0].count > 0) {
      return res.status(400).json({ error: "Cannot delete category with folders" });
    }

    const [files] = await inhouseDb.query("SELECT COUNT(*) as count FROM categories_files WHERE category_id = ?", [id]);
    if (files[0].count > 0) {
      return res.status(400).json({ error: "Cannot delete category with files" });
    }

    await inhouseDb.query("DELETE FROM categories WHERE id = ?", [id]);

    await addActivityLog(deleted_by, 'delete', 'folder', id, category.name);

    res.json({
      message: "Category deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
*/
// ================== Delete Category ==================
router.delete('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { deleted_by } = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "Valid category ID is required" });
    }

    if (!deleted_by) {
      return res.status(400).json({ error: "deleted_by is required" });
    }

    const userValid = await validateUser(deleted_by);
    if (!userValid) {
      return res.status(400).json({ error: "Invalid deleted_by user" });
    }

    const [existingCategories] = await inhouseDb.query(
      "SELECT * FROM categories WHERE id = ?", 
      [id]
    );
    
    if (existingCategories.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    const category = existingCategories[0];

    const [folders] = await inhouseDb.query(
      "SELECT COUNT(*) as count FROM categories_folders WHERE category_id = ?", 
      [id]
    );
    
    if (folders[0].count > 0) {
      return res.status(400).json({ error: "Cannot delete category with folders" });
    }

    const [files] = await inhouseDb.query(
      "SELECT COUNT(*) as count FROM categories_files WHERE category_id = ?", 
      [id]
    );
    
    if (files[0].count > 0) {
      return res.status(400).json({ error: "Cannot delete category with files" });
    }

    await inhouseDb.query("DELETE FROM categories WHERE id = ?", [id]);

    await addActivityLog(deleted_by, 'delete', 'folder', id, category.name);

    res.json({
      message: "Category deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
/*
// ================== Update Category ==================
router.put('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color, icon, is_active, updated_by } = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "Valid category ID is required" });
    }

    if (!updated_by) {
      return res.status(400).json({ error: "updated_by is required" });
    }

    const [existingCategories] = await inhouseDb.query("SELECT * FROM categories WHERE id = ?", [id]);
    if (existingCategories.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    const currentCategory = existingCategories[0];

    const userValid = await validateUser(updated_by);
    if (!userValid) {
      return res.status(400).json({ error: "Invalid updated_by user" });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push("name = ?");
      params.push(sanitizeInput(name));
    }
    if (description !== undefined) {
      updates.push("description = ?");
      params.push(sanitizeInput(description));
    }
    if (color !== undefined) {
      updates.push("color = ?");
      params.push(sanitizeInput(color));
    }
    if (icon !== undefined) {
      updates.push("icon = ?");
      params.push(sanitizeInput(icon));
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      params.push(is_active ? 1 : 0);
    }

    updates.push("updated_by = ?, updated_at = NOW()");
    params.push(updated_by, id);

    await inhouseDb.query(
      `UPDATE categories SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    const actionType = (name && name !== currentCategory.name) ? 'rename' : 'update';
    await addActivityLog(updated_by, actionType, 'folder', id, name || currentCategory.name);

    res.json({
      message: "Category updated successfully"
    });

  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
*/
// ================== Update Category ==================
router.put('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color, icon, is_active, updated_by } = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "Valid category ID is required" });
    }

    if (!updated_by) {
      return res.status(400).json({ error: "updated_by is required" });
    }

    const [existingCategories] = await inhouseDb.query(
      "SELECT * FROM categories WHERE id = ?", 
      [id]
    );
    
    if (existingCategories.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    const currentCategory = existingCategories[0];

    const userValid = await validateUser(updated_by);
    if (!userValid) {
      return res.status(400).json({ error: "Invalid updated_by user" });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push("name = ?");
      params.push(sanitizeInput(name));
    }
    if (description !== undefined) {
      updates.push("description = ?");
      params.push(sanitizeInput(description));
    }
    if (color !== undefined) {
      updates.push("color = ?");
      params.push(sanitizeInput(color));
    }
    if (icon !== undefined) {
      updates.push("icon = ?");
      params.push(sanitizeInput(icon));
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      params.push(is_active ? 1 : 0);
    }

    updates.push("updated_by = ?, updated_at = NOW()");
    params.push(updated_by, id);

    await inhouseDb.query(
      `UPDATE categories SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    const actionType = (name && name !== currentCategory.name) ? 'rename' : 'update';
    await addActivityLog(updated_by, actionType, 'folder', id, name || currentCategory.name);

    res.json({
      message: "Category updated successfully"
    });

  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});



// ================== Create Folder ==================
router.post('/folders', async (req, res) => {
  try {
    const { name, description, category_id, parent_folder_id, path, created_by } = req.body;

    if (!name || !category_id || !created_by) {
      return res.status(400).json({ error: "Name, category_id, and created_by are required" });
    }

    const sanitizedName = sanitizeInput(name);
    const sanitizedDesc = sanitizeInput(description || "");
    const sanitizedPath = sanitizeInput(path || sanitizedName);

    const userValid = await validateUser(created_by);
    if (!userValid) {
      return res.status(400).json({ error: "Invalid created_by user" });
    }

    const [categoryRows] = await inhouseDb.query("SELECT id FROM categories WHERE id = ?", [category_id]);
    if (categoryRows.length === 0) {
      return res.status(400).json({ error: "Invalid category_id" });
    }

    if (parent_folder_id) {
      const [parentRows] = await inhouseDb.query("SELECT id FROM categories_folders WHERE id = ?", [parent_folder_id]);
      if (parentRows.length === 0) {
        return res.status(400).json({ error: "Invalid parent_folder_id" });
      }
    }

    const [result] = await inhouseDb.query(
      `INSERT INTO categories_folders 
      (name, description, category_id, parent_folder_id, path, is_active, created_by, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, 1, ?, NOW(), NOW())`,
      [sanitizedName, sanitizedDesc, category_id, parent_folder_id || null, sanitizedPath, created_by]
    );

    await addActivityLog(created_by, 'create', 'folder', result.insertId, sanitizedName);

    res.status(201).json({
      message: "Folder created successfully",
      folder_id: result.insertId
    });

  } catch (error) {
    console.error("Error creating folder:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


// ================== Get All Folders ==================
router.get('/folders', async (req, res) => {
  try {
    const { category_id, parent_folder_id, is_active } = req.query;
    
    let query = `
      SELECT f.*, c.name as category_name, u.name as created_by_name
      FROM categories_folders f
      LEFT JOIN categories c ON f.category_id = c.id
      LEFT JOIN users u ON f.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (category_id) {
      query += " AND f.category_id = ?";
      params.push(category_id);
    }

    // ✅ FIXED: Handle parent_folder_id properly
    if (parent_folder_id !== undefined) {
      if (parent_folder_id === 'null' || parent_folder_id === '' || parent_folder_id === null) {
        query += " AND f.parent_folder_id IS NULL";
      } else {
        query += " AND f.parent_folder_id = ?";
        params.push(parent_folder_id);
      }
    } else {
      // ✅ NEW: If parent_folder_id is not provided at all, default to root folders only
      // This fixes the issue when navigating back to category level
      query += " AND f.parent_folder_id IS NULL";
    }

    if (is_active !== undefined) {
      query += " AND f.is_active = ?";
      params.push(is_active === 'true' ? 1 : 0);
    }

    query += " ORDER BY f.created_at DESC";

    const [folders] = await inhouseDb.query(query, params);

    res.json({
      message: "Folders retrieved successfully",
      folders: folders
    });

  } catch (error) {
    console.error("Error getting folders:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ================== Get Single Folder ==================
router.get('/folders/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "Valid folder ID is required" });
    }

    const [folders] = await inhouseDb.query(
      `SELECT f.*, c.name as category_name, u.name as created_by_name,
              uu.name as updated_by_name
       FROM categories_folders f
       LEFT JOIN categories c ON f.category_id = c.id
       LEFT JOIN users u ON f.created_by = u.id
       LEFT JOIN users uu ON f.updated_by = uu.id
       WHERE f.id = ?`,
      [id]
    );

    if (folders.length === 0) {
      return res.status(404).json({ error: "Folder not found" });
    }

    res.json({
      message: "Folder retrieved successfully",
      folder: folders[0]
    });

  } catch (error) {
    console.error("Error getting folder:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ================== Delete Folder ==================
router.delete('/categories/folders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { deleted_by } = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "Valid folder ID is required" });
    }

    if (!deleted_by) {
      return res.status(400).json({ error: "deleted_by is required" });
    }

    const userValid = await validateUser(deleted_by);
    if (!userValid) {
      return res.status(400).json({ error: "Invalid deleted_by user" });
    }

    const [existingFolders] = await inhouseDb.query("SELECT * FROM categories_folders WHERE id = ?", [id]);
    if (existingFolders.length === 0) {
      return res.status(404).json({ error: "Folder not found" });
    }

    const folder = existingFolders[0];

    const [childFolders] = await inhouseDb.query("SELECT COUNT(*) as count FROM categories_folders WHERE parent_folder_id = ?", [id]);
    if (childFolders[0].count > 0) {
      return res.status(400).json({ error: "Cannot delete folder with child folders" });
    }

    const [files] = await inhouseDb.query("SELECT COUNT(*) as count FROM categories_files WHERE folder_id = ?", [id]);
    if (files[0].count > 0) {
      return res.status(400).json({ error: "Cannot delete folder containing files" });
    }

    await inhouseDb.query("DELETE FROM categories_folders WHERE id = ?", [id]);

    await addActivityLog(deleted_by, 'delete', 'folder', id, folder.name);

    res.json({
      message: "Folder deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting folder:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ================== Update Folder ==================
router.put('/folders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, category_id, parent_folder_id, path, is_active, updated_by } = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "Valid folder ID is required" });
    }

    if (!updated_by) {
      return res.status(400).json({ error: "updated_by is required" });
    }

    const [existingFolders] = await inhouseDb.query("SELECT * FROM categories_folders WHERE id = ?", [id]);
    if (existingFolders.length === 0) {
      return res.status(404).json({ error: "Folder not found" });
    }

    const currentFolder = existingFolders[0];

    const userValid = await validateUser(updated_by);
    if (!userValid) {
      return res.status(400).json({ error: "Invalid updated_by user" });
    }

    if (category_id && category_id !== currentFolder.category_id) {
      const [categoryRows] = await inhouseDb.query("SELECT id FROM categories WHERE id = ?", [category_id]);
      if (categoryRows.length === 0) {
        return res.status(400).json({ error: "Invalid category_id" });
      }
    }

    if (parent_folder_id && parent_folder_id !== currentFolder.parent_folder_id) {
      const [parentRows] = await inhouseDb.query("SELECT id FROM categories_folders WHERE id = ?", [parent_folder_id]);
      if (parentRows.length === 0) {
        return res.status(400).json({ error: "Invalid parent_folder_id" });
      }
      
      if (parent_folder_id == id) {
        return res.status(400).json({ error: "Folder cannot be its own parent" });
      }
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push("name = ?");
      params.push(sanitizeInput(name));
    }
    if (description !== undefined) {
      updates.push("description = ?");
      params.push(sanitizeInput(description));
    }
    if (category_id !== undefined) {
      updates.push("category_id = ?");
      params.push(category_id);
    }
    if (parent_folder_id !== undefined) {
      updates.push("parent_folder_id = ?");
      params.push(parent_folder_id || null);
    }
    if (path !== undefined) {
      updates.push("path = ?");
      params.push(sanitizeInput(path));
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      params.push(is_active ? 1 : 0);
    }

    updates.push("updated_by = ?, updated_at = NOW()");
    params.push(updated_by, id);

    await inhouseDb.query(
      `UPDATE categories_folders SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    const actionType = (name && name !== currentFolder.name) ? 'rename' : 'update';
    await addActivityLog(updated_by, actionType, 'folder', id, name || currentFolder.name);

    res.json({
      message: "Folder updated successfully"
    });

  } catch (error) {
    console.error("Error updating folder:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});



// ================== Get Folder Tree ==================
router.get('/folders/tree/:category_id', async (req, res) => {
  try {
    const { category_id } = req.params;

    if (!category_id || isNaN(category_id)) {
      return res.status(400).json({ error: "Valid category ID is required" });
    }

    const [folders] = await inhouseDb.query(
      "SELECT id, name, parent_folder_id, path FROM categories_folders WHERE category_id = ? AND is_active = 1 ORDER BY name",
      [category_id]
    );

    const buildTree = (parentId = null) => {
      return folders
        .filter(folder => folder.parent_folder_id === parentId)
        .map(folder => ({
          ...folder,
          children: buildTree(folder.id)
        }));
    };

    const tree = buildTree();

    res.json({
      message: "Folder tree retrieved successfully",
      tree: tree
    });

  } catch (error) {
    console.error("Error getting folder tree:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ================== Upload Single File ==================
router.post('/files/upload-single', uploadSingle('file'), async (req, res) => {
  console.log("=== SINGLE FILE UPLOAD DEBUG ===");
  console.log("Body:", req.body);
  console.log("File:", req.file);
  
  try {
    const { category_id, folder_id, created_by, description = '' } = req.body;
    const uploadedFile = req.file;

    if (!category_id || !created_by) {
      if (uploadedFile) {
        await cleanupFiles([uploadedFile]);
      }
      return res.status(400).json({ error: "category_id and created_by are required" });
    }

    if (!uploadedFile) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const userValid = await validateUser(created_by);
    if (!userValid) {
      await cleanupFiles([uploadedFile]);
      return res.status(400).json({ error: "Invalid created_by user" });
    }

    const [categoryRows] = await inhouseDb.query("SELECT id FROM categories WHERE id = ?", [category_id]);
    if (categoryRows.length === 0) {
      await cleanupFiles([uploadedFile]);
      return res.status(400).json({ error: "Invalid category_id" });
    }

    if (folder_id) {
      const [folderRows] = await inhouseDb.query("SELECT id FROM categories_folders WHERE id = ? AND category_id = ?", [folder_id, category_id]);
      if (folderRows.length === 0) {
        await cleanupFiles([uploadedFile]);
        return res.status(400).json({ error: "Invalid folder_id for this category" });
      }
    }

    try {
      const sanitizedOriginalName = sanitizeInput(uploadedFile.originalname);
      
      const [result] = await inhouseDb.query(
        `INSERT INTO categories_files 
        (name, original_name, description, file_type, file_size, mime_type, file_path, category_id, folder_id, 
         is_starred, is_active, download_count, last_accessed, created_by, created_at, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0, NOW(), ?, NOW(), NOW())`,
        [
          sanitizedOriginalName,
          sanitizedOriginalName,
          description,
          path.extname(uploadedFile.originalname).substring(1).toLowerCase(),
          uploadedFile.size,
          uploadedFile.mimetype,
          uploadedFile.path,
          category_id,
          folder_id || null,
          created_by
        ]
      );

      await addActivityLog(created_by, 'upload', 'file', result.insertId, sanitizedOriginalName, 
        `Size: ${formatFileSize(uploadedFile.size)}, Type: ${uploadedFile.mimetype}`);

      res.status(201).json({
        message: "File uploaded successfully",
        file: {
          file_id: result.insertId,
          original_name: sanitizedOriginalName,
          file_size: formatFileSize(uploadedFile.size),
          file_type: path.extname(uploadedFile.originalname).substring(1).toLowerCase(),
          mime_type: uploadedFile.mimetype,
          description: description
        }
      });

    } catch (dbError) {
      console.error(`Error processing file ${uploadedFile.originalname}:`, dbError);
      await cleanupFiles([uploadedFile]);
      res.status(500).json({ error: "Failed to save file information" });
    }

  } catch (error) {
    console.error("Error uploading file:", error);
    if (req.file) {
      await cleanupFiles([req.file]);
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// ================== Upload Multiple Files ==================
router.post('/files/upload-multiple', uploadMultiple('files'), async (req, res) => {
  console.log("=== MULTIPLE FILES UPLOAD DEBUG ===");
  console.log("Body:", req.body);
  console.log("Files count:", req.files?.length || 0);
  
  try {
    const { category_id, folder_id, created_by } = req.body;
    const uploadedFiles = req.files;

    if (!category_id || !created_by) {
      if (uploadedFiles) {
        await cleanupFiles(uploadedFiles);
      }
      return res.status(400).json({ error: "category_id and created_by are required" });
    }

    if (!uploadedFiles || uploadedFiles.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const userValid = await validateUser(created_by);
    if (!userValid) {
      await cleanupFiles(uploadedFiles);
      return res.status(400).json({ error: "Invalid created_by user" });
    }

    const [categoryRows] = await inhouseDb.query("SELECT id FROM categories WHERE id = ?", [category_id]);
    if (categoryRows.length === 0) {
      await cleanupFiles(uploadedFiles);
      return res.status(400).json({ error: "Invalid category_id" });
    }

    if (folder_id) {
      const [folderRows] = await inhouseDb.query("SELECT id FROM categories_folders WHERE id = ? AND category_id = ?", [folder_id, category_id]);
      if (folderRows.length === 0) {
        await cleanupFiles(uploadedFiles);
        return res.status(400).json({ error: "Invalid folder_id for this category" });
      }
    }

    const uploadResults = [];
    const errors = [];

    for (const file of uploadedFiles) {
      try {
        const sanitizedOriginalName = sanitizeInput(file.originalname);
        
        const [result] = await inhouseDb.query(
          `INSERT INTO categories_files 
          (name, original_name, description, file_type, file_size, mime_type, file_path, category_id, folder_id, 
           is_starred, is_active, download_count, last_accessed, created_by, created_at, updated_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0, NOW(), ?, NOW(), NOW())`,
          [
            sanitizedOriginalName,
            sanitizedOriginalName,
            '',
            path.extname(file.originalname).substring(1).toLowerCase(),
            file.size,
            file.mimetype,
            file.path,
            category_id,
            folder_id || null,
            created_by
          ]
        );

        await addActivityLog(created_by, 'upload', 'file', result.insertId, sanitizedOriginalName, 
          `Size: ${formatFileSize(file.size)}, Type: ${file.mimetype}`);

        uploadResults.push({
          file_id: result.insertId,
          original_name: sanitizedOriginalName,
          file_size: formatFileSize(file.size),
          file_type: path.extname(file.originalname).substring(1).toLowerCase(),
          mime_type: file.mimetype
        });

      } catch (fileError) {
        console.error(`Error processing file ${file.originalname}:`, fileError);
        errors.push({
          filename: file.originalname,
          error: "Failed to process file"
        });
        
        try {
          await unlinkAsync(file.path);
        } catch (unlinkError) {
          console.error("Failed to cleanup file:", unlinkError);
        }
      }
    }

    res.status(201).json({
      message: `${uploadResults.length} file(s) uploaded successfully`,
      files: uploadResults,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        total: uploadedFiles.length,
        successful: uploadResults.length,
        failed: errors.length
      }
    });

  } catch (error) {
    console.error("Error uploading files:", error);
    
    if (req.files) {
      await cleanupFiles(req.files);
    }
    
    res.status(500).json({ error: "Internal server error" });
  }
});

// ================== Bulk Upload with Progress Tracking ==================
router.post('/files/bulk-upload', uploadMultiple('files'), async (req, res) => {
  console.log("=== BULK UPLOAD DEBUG ===");
  console.log("Body:", req.body);
  console.log("Files count:", req.files?.length || 0);
  
  try {
    const { category_id, folder_id, created_by, overwrite = false } = req.body;
    const uploadedFiles = req.files;

    if (!category_id || !created_by) {
      if (uploadedFiles) {
        await cleanupFiles(uploadedFiles);
      }
      return res.status(400).json({ error: "category_id and created_by are required" });
    }

    if (!uploadedFiles || uploadedFiles.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const userValid = await validateUser(created_by);
    if (!userValid) {
      await cleanupFiles(uploadedFiles);
      return res.status(400).json({ error: "Invalid created_by user" });
    }

    const [categoryRows] = await inhouseDb.query("SELECT id FROM categories WHERE id = ?", [category_id]);
    if (categoryRows.length === 0) {
      await cleanupFiles(uploadedFiles);
      return res.status(400).json({ error: "Invalid category_id" });
    }

    if (folder_id) {
      const [folderRows] = await inhouseDb.query("SELECT id FROM categories_folders WHERE id = ? AND category_id = ?", [folder_id, category_id]);
      if (folderRows.length === 0) {
        await cleanupFiles(uploadedFiles);
        return res.status(400).json({ error: "Invalid folder_id for this category" });
      }
    }

    const results = {
      uploaded: [],
      skipped: [],
      errors: [],
      total: uploadedFiles.length
    };

    for (const file of uploadedFiles) {
      try {
        const sanitizedOriginalName = sanitizeInput(file.originalname);
        
        if (!overwrite) {
          const [existing] = await inhouseDb.query(
            "SELECT id FROM categories_files WHERE original_name = ? AND category_id = ? AND folder_id = ?",
            [sanitizedOriginalName, category_id, folder_id || null]
          );
          
          if (existing.length > 0) {
            results.skipped.push({
              filename: sanitizedOriginalName,
              reason: "File already exists"
            });
            await unlinkAsync(file.path);
            continue;
          }
        } else {
          const [existing] = await inhouseDb.query(
            "SELECT id FROM categories_files WHERE original_name = ? AND category_id = ? AND folder_id = ?",
            [sanitizedOriginalName, category_id, folder_id || null]
          );
          
          if (existing.length > 0) {
            await inhouseDb.query(
              `UPDATE categories_files 
               SET file_size = ?, mime_type = ?, file_path = ?, updated_at = NOW()
               WHERE id = ?`,
              [file.size, file.mimetype, file.path, existing[0].id]
            );
            
            await addActivityLog(created_by, 'update', 'file', existing[0].id, sanitizedOriginalName);
            
            results.uploaded.push({
              file_id: existing[0].id,
              original_name: sanitizedOriginalName,
              file_size: formatFileSize(file.size),
              action: 'updated'
            });
            continue;
          }
        }

        const [result] = await inhouseDb.query(
          `INSERT INTO categories_files 
          (name, original_name, file_type, file_size, mime_type, file_path, category_id, folder_id, 
           is_starred, is_active, download_count, last_accessed, created_by, created_at, updated_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0, NOW(), ?, NOW(), NOW())`,
          [
            sanitizedOriginalName,
            sanitizedOriginalName,
            path.extname(file.originalname).substring(1).toLowerCase(),
            file.size,
            file.mimetype,
            file.path,
            category_id,
            folder_id || null,
            created_by
          ]
        );

        await addActivityLog(created_by, 'upload', 'file', result.insertId, sanitizedOriginalName);

        results.uploaded.push({
          file_id: result.insertId,
          original_name: sanitizedOriginalName,
          file_size: formatFileSize(file.size),
          action: 'created'
        });

      } catch (fileError) {
        console.error(`Error processing file ${file.originalname}:`, fileError);
        results.errors.push({
          filename: file.originalname,
          error: "Failed to process file"
        });
        
        try {
          await unlinkAsync(file.path);
        } catch (unlinkError) {
          console.error("Failed to cleanup file:", unlinkError);
        }
      }
    }

    res.json({
      message: `Bulk upload completed: ${results.uploaded.length} uploaded, ${results.skipped.length} skipped, ${results.errors.length} errors`,
      results: results
    });

  } catch (error) {
    console.error("Error in bulk upload:", error);
    
    if (req.files) {
      await cleanupFiles(req.files);
    }
    
    res.status(500).json({ error: "Internal server error" });
  }
});

// ================== Get All Files ==================
router.get('/files', async (req, res) => {
  try {
    const { category_id, folder_id, file_type, is_starred, is_active, search, limit, offset } = req.query;
    
    let query = `
      SELECT f.*, c.name as category_name, cf.name as folder_name, 
             u.name as created_by_name, uu.name as updated_by_name
      FROM categories_files f
      LEFT JOIN categories c ON f.category_id = c.id
      LEFT JOIN categories_folders cf ON f.folder_id = cf.id
      LEFT JOIN users u ON f.created_by = u.id
      LEFT JOIN users uu ON f.updated_by = uu.id
      WHERE 1=1
    `;
    const params = [];

    if (category_id) {
      query += " AND f.category_id = ?";
      params.push(category_id);
    }

    if (folder_id !== undefined) {
      if (folder_id === 'null' || folder_id === '') {
        query += " AND f.folder_id IS NULL";
      } else {
        query += " AND f.folder_id = ?";
        params.push(folder_id);
      }
    }

    if (file_type) {
      query += " AND f.file_type = ?";
      params.push(file_type);
    }

    if (is_starred !== undefined) {
      query += " AND f.is_starred = ?";
      params.push(is_starred === 'true' ? 1 : 0);
    }

    if (is_active !== undefined) {
      query += " AND f.is_active = ?";
      params.push(is_active === 'true' ? 1 : 0);
    }

    if (search) {
      query += " AND (f.name LIKE ? OR f.original_name LIKE ?)";
      const searchTerm = `%${sanitizeInput(search)}%`;
      params.push(searchTerm, searchTerm);
    }

    query += " ORDER BY f.created_at DESC";

    if (limit) {
      query += " LIMIT ?";
      params.push(parseInt(limit));
      
      if (offset) {
        query += " OFFSET ?";
        params.push(parseInt(offset));
      }
    }

    const [files] = await inhouseDb.query(query, params);

    const formattedFiles = files.map(file => ({
      ...file,
      formatted_size: formatFileSize(file.file_size)
    }));

    res.json({
      message: "Files retrieved successfully",
      files: formattedFiles,
      total_count: files.length
    });

  } catch (error) {
    console.error("Error getting files:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ================== Star a Category File (Toggle) ==================
router.post("/starred-files/star/:fileId", async (req, res) => {
  const { fileId } = req.params;
  const { user_id } = req.body;

  console.log("\n⭐ ===== TOGGLE STAR CATEGORY FILE =====");
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

    // Check if file exists in categories_files
    const [fileCheck] = await inhouseDb.query(
      "SELECT id, name FROM categories_files WHERE id = ? AND is_active = 1",
      [fileId]
    );
    if (fileCheck.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    // Check if already starred
    const [existing] = await inhouseDb.query(
      "SELECT id FROM starred_files WHERE user_id = ? AND category_file_id = ?",
      [user_id, fileId]
    );

    if (existing.length > 0) {
      // Already starred → unstar
      await inhouseDb.query(
        "DELETE FROM starred_files WHERE user_id = ? AND category_file_id = ?",
        [user_id, fileId]
      );
      console.log("✅ Category file unstarred");
      return res.json({
        message: "File unstarred successfully",
        starred: false,
        fileId,
        fileName: fileCheck[0].name
      });
    } else {
      // Not starred → star it
      await inhouseDb.query(
        "INSERT INTO starred_files (user_id, category_file_id, created_at) VALUES (?, ?, NOW())",
        [user_id, fileId]
      );
      console.log("✅ Category file starred");
      return res.json({
        message: "File starred successfully",
        starred: true,
        fileId,
        fileName: fileCheck[0].name
      });
    }

  } catch (err) {
    console.error("💥 Error toggling star:", err);
    res.status(500).json({ error: "Failed to toggle star: " + err.message });
  }
});

// ================== Get All Starred Category Files for a User ==================
router.get("/starred-files", async (req, res) => {
  const { user_id } = req.query;

  console.log("\n⭐ ===== GET STARRED CATEGORY FILES =====");
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
              c.name AS category_name,
              cf.name AS folder_name,
              u.name AS created_by_name
       FROM starred_files sf
       JOIN categories_files f ON sf.category_file_id = f.id
       LEFT JOIN categories c ON f.category_id = c.id
       LEFT JOIN categories_folders cf ON f.folder_id = cf.id
       LEFT JOIN users u ON f.created_by = u.id
       WHERE sf.user_id = ? AND sf.category_file_id IS NOT NULL
       ORDER BY sf.created_at DESC`,
      [user_id]
    );

    console.log("⭐ Starred category files found:", starredFiles.length);

    res.json({
      starredFiles,
      count: starredFiles.length
    });

  } catch (err) {
    console.error("💥 Error getting starred category files:", err);
    res.status(500).json({ error: "Failed to get starred files: " + err.message });
  }
});

// ================== Unstar a Category File ==================
router.delete("/starred-files/star/:fileId", async (req, res) => {
  const { fileId } = req.params;
  const { user_id } = req.body;

  console.log("\n⭐ ===== UNSTAR CATEGORY FILE =====");
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
      "DELETE FROM starred_files WHERE user_id = ? AND category_file_id = ?",
      [user_id, fileId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Star not found — file was not starred by this user" });
    }

    console.log("✅ Category file unstarred");
    res.json({ message: "File unstarred successfully", starred: false, fileId });

  } catch (err) {
    console.error("💥 Error unstarring file:", err);
    res.status(500).json({ error: "Failed to unstar file: " + err.message });
  }
});

// ================== Check if Category File is Starred ==================
router.get("/starred-files/star/status/:fileId", async (req, res) => {
  const { fileId } = req.params;
  const { user_id } = req.query;

  try {
    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const [result] = await inhouseDb.query(
      "SELECT id, created_at FROM starred_files WHERE user_id = ? AND category_file_id = ?",
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

// ================== Get Single File ==================
router.get('/files/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "Valid file ID is required" });
    }

    const [files] = await inhouseDb.query(
      `SELECT f.*, c.name as category_name, cf.name as folder_name,
              u.name as created_by_name, uu.name as updated_by_name
       FROM categories_files f
       LEFT JOIN categories c ON f.category_id = c.id
       LEFT JOIN categories_folders cf ON f.folder_id = cf.id
       LEFT JOIN users u ON f.created_by = u.id
       LEFT JOIN users uu ON f.updated_by = uu.id
       WHERE f.id = ?`,
      [id]
    );

    if (files.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    const file = files[0];
    file.formatted_size = formatFileSize(file.file_size);

    res.json({
      message: "File retrieved successfully",
      file: file
    });

  } catch (error) {
    console.error("Error getting file:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete('/categories/files/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { deleted_by, updated_by } = req.body;
    const userId = deleted_by || updated_by;

    console.log('🗑️ ===== DELETE REQUEST =====');
    console.log('🆔 Item ID:', id);
    console.log('👤 Updated by:', userId);

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "Valid file ID is required" });
    }

    if (!userId) {
      return res.status(400).json({ error: "deleted_by or updated_by is required" });
    }

    console.log('🔍 Validating user...');
    const userValid = await validateUser(userId);
    if (!userValid) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    console.log('🔍 Checking if item exists in files table...');
    const [existingFiles] = await inhouseDb.query(
      "SELECT * FROM categories_files WHERE id = ?", 
      [parseInt(id)]
    );
    
    console.log('📊 Query result:', existingFiles.length, 'rows found');
    
    if (existingFiles.length === 0) {
      console.log('❌ File not found in categories_files table');
      return res.status(404).json({ error: "File not found" });
    }
    
    console.log('✅ File found:', existingFiles[0].name);

    const file = existingFiles[0];

    // Delete physical file
    try {
      if (validateFilePath(file.file_path) && fs.existsSync(file.file_path)) {
        await unlinkAsync(file.file_path);
        console.log('✅ Physical file deleted');
      }
    } catch (fileError) {
      console.error("⚠️ Error deleting physical file:", fileError);
    }

    // Delete password file if PDF
    if (file.file_type.toLowerCase() === 'pdf') {
      passwordManager.deletePassword(id);
      console.log(`🗑️ Deleted password for PDF file ${id}`);
    }

    // Delete from database
    const [deleteResult] = await inhouseDb.query(
      "DELETE FROM categories_files WHERE id = ?", 
      [parseInt(id)]
    );
    console.log('🗑️ Database delete result:', deleteResult.affectedRows, 'rows deleted');

    // Log activity
    await addActivityLog(userId, 'delete', 'file', id, file.name, 
      `Size: ${formatFileSize(file.file_size)}`);

    console.log('✅ File deleted successfully');

    res.json({
      message: "File deleted successfully",
      deleted_file: {
        id: file.id,
        name: file.name
      }
    });

  } catch (error) {
    console.error("❌ Error deleting file:", error);
    res.status(500).json({ 
      error: "Internal server error",
      details: error.message 
    });
  }
});

// Add this test endpoint to your routes
router.get('/test-db-connection', async (req, res) => {
  try {
    console.log('🧪 Testing database connection...');
    
    // Test 1: Simple query
    const [result1] = await inhouseDb.query("SELECT 1 + 1 as result");
    console.log('✅ Basic query works:', result1);
    
    // Test 2: Count all files
    const [result2] = await inhouseDb.query("SELECT COUNT(*) as total FROM categories_files");
    console.log('✅ Count query works:', result2);
    
    // Test 3: Get specific file
    const testId = 20; // Your file ID
    const [result3] = await inhouseDb.query("SELECT * FROM categories_files WHERE id = ?", [testId]);
    console.log(`✅ Query for ID ${testId}:`, result3);
    
    res.json({
      success: true,
      tests: {
        basic: result1,
        count: result2,
        specific: result3
      }
    });
    
  } catch (error) {
    console.error('❌ Database test failed:', error);
    res.status(500).json({ error: error.message });
  }
});



// ================== Update File ==================
router.put('/files/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category_id, folder_id, is_starred, is_active, updated_by } = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "Valid file ID is required" });
    }

    if (!updated_by) {
      return res.status(400).json({ error: "updated_by is required" });
    }

    const [existingFiles] = await inhouseDb.query("SELECT * FROM categories_files WHERE id = ?", [id]);
    if (existingFiles.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    const currentFile = existingFiles[0];

    const userValid = await validateUser(updated_by);
    if (!userValid) {
      return res.status(400).json({ error: "Invalid updated_by user" });
    }

    if (category_id && category_id !== currentFile.category_id) {
      const [categoryRows] = await inhouseDb.query("SELECT id FROM categories WHERE id = ?", [category_id]);
      if (categoryRows.length === 0) {
        return res.status(400).json({ error: "Invalid category_id" });
      }
    }

    if (folder_id && folder_id !== currentFile.folder_id) {
      const finalCategoryId = category_id || currentFile.category_id;
      const [folderRows] = await inhouseDb.query("SELECT id FROM categories_folders WHERE id = ? AND category_id = ?", [folder_id, finalCategoryId]);
      if (folderRows.length === 0) {
        return res.status(400).json({ error: "Invalid folder_id for this category" });
      }
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push("name = ?");
      params.push(sanitizeInput(name));
    }
    if (category_id !== undefined) {
      updates.push("category_id = ?");
      params.push(category_id);
    }
    if (folder_id !== undefined) {
      updates.push("folder_id = ?");
      params.push(folder_id || null);
    }
    if (is_starred !== undefined) {
      updates.push("is_starred = ?");
      params.push(is_starred ? 1 : 0);
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      params.push(is_active ? 1 : 0);
    }

    updates.push("updated_by = ?, updated_at = NOW()");
    params.push(updated_by, id);

    await inhouseDb.query(
      `UPDATE categories_files SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    const actionType = (name && name !== currentFile.name) ? 'rename' : 'update';
    const actionInfo = folder_id !== currentFile.folder_id ? 'Moved to different folder' : null;
    await addActivityLog(updated_by, actionType, 'file', id, name || currentFile.name, actionInfo);

    res.json({
      message: "File updated successfully"
    });

  } catch (error) {
    console.error("Error updating file:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});



// ================== NEW: Get Password (Admin Only) ==================
router.get('/files/:id/password', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;

    // Validate user (you might want to add role checking here)
    const userValid = await validateUser(user_id);
    if (!userValid) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // TODO: Add admin role check here
    // const user = await getUserDetails(user_id);
    // if (user.role !== 'admin') {
    //   return res.status(403).json({ error: "Admin access required" });
    // }

    const passwordData = passwordManager.getPassword(id);

    if (!passwordData) {
      return res.status(404).json({ error: "Password not found for this file" });
    }

    res.json({
      file_id: passwordData.file_id,
      file_name: passwordData.file_name,
      owner_password: passwordData.owner_password,
      created_at: passwordData.created_at,
      restrictions: passwordData.restrictions_applied
    });

  } catch (error) {
    console.error("Error retrieving password:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ================== NEW: List All Passwords (Admin Only) ==================
router.get('/admin/passwords', async (req, res) => {
  try {
    const { user_id } = req.query;

    const userValid = await validateUser(user_id);
    if (!userValid) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // TODO: Add admin role check

    const passwords = passwordManager.listAllPasswords();
    const stats = passwordManager.getStatistics();

    res.json({
      message: "Passwords retrieved successfully",
      statistics: stats,
      passwords: passwords
    });

  } catch (error) {
    console.error("Error listing passwords:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ================== NEW: Cleanup Old Passwords (Admin/Cron Job) ==================
router.post('/admin/passwords/cleanup', async (req, res) => {
  try {
    const { user_id, days_old = 30 } = req.body;

    const userValid = await validateUser(user_id);
    if (!userValid) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // TODO: Add admin role check

    const deletedCount = passwordManager.cleanupOldPasswords(days_old);

    res.json({
      message: `Cleaned up ${deletedCount} old password files`,
      deleted_count: deletedCount,
      days_threshold: days_old
    });

  } catch (error) {
    console.error("Error cleaning up passwords:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ================== NEW: Export Passwords Backup (Admin Only) ==================
router.post('/admin/passwords/backup', async (req, res) => {
  try {
    const { user_id } = req.body;

    const userValid = await validateUser(user_id);
    if (!userValid) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // TODO: Add admin role check

    const backupFile = passwordManager.exportPasswordsBackup();

    if (!backupFile) {
      throw new Error("Failed to create backup");
    }

    res.json({
      message: "Backup created successfully",
      backup_file: backupFile
    });

  } catch (error) {
    console.error("Error creating backup:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ================== Move Multiple Files ==================
router.post('/files/move-multiple', async (req, res) => {
  try {
    const { file_ids, target_category_id, target_folder_id, moved_by } = req.body;

    if (!file_ids || !Array.isArray(file_ids) || file_ids.length === 0) {
      return res.status(400).json({ error: "file_ids array is required" });
    }

    if (!target_category_id || !moved_by) {
      return res.status(400).json({ error: "target_category_id and moved_by are required" });
    }

    const userValid = await validateUser(moved_by);
    if (!userValid) {
      return res.status(400).json({ error: "Invalid moved_by user" });
    }

    const [categoryRows] = await inhouseDb.query("SELECT id FROM categories WHERE id = ?", [target_category_id]);
    if (categoryRows.length === 0) {
      return res.status(400).json({ error: "Invalid target_category_id" });
    }

    if (target_folder_id) {
      const [folderRows] = await inhouseDb.query("SELECT id FROM categories_folders WHERE id = ? AND category_id = ?", [target_folder_id, target_category_id]);
      if (folderRows.length === 0) {
        return res.status(400).json({ error: "Invalid target_folder_id for this category" });
      }
    }

    const results = { moved: [], errors: [] };

    for (const file_id of file_ids) {
      try {
        const [files] = await inhouseDb.query("SELECT * FROM categories_files WHERE id = ?", [file_id]);
        if (files.length === 0) {
          results.errors.push({ file_id, error: "File not found" });
          continue;
        }

        await inhouseDb.query(
          "UPDATE categories_files SET category_id = ?, folder_id = ?, updated_by = ?, updated_at = NOW() WHERE id = ?",
          [target_category_id, target_folder_id || null, moved_by, file_id]
        );

        await addActivityLog(moved_by, 'move', 'file', file_id, files[0].name);
        results.moved.push({ file_id, name: files[0].name });

      } catch (error) {
        console.error(`Error moving file ${file_id}:`, error);
        results.errors.push({ file_id, error: "Failed to move file" });
      }
    }

    res.json({
      message: `Move completed: ${results.moved.length} moved, ${results.errors.length} errors`,
      results: results
    });

  } catch (error) {
    console.error("Error moving multiple files:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ================== Copy Multiple Files ==================
router.post('/files/copy-multiple', async (req, res) => {
  try {
    const { file_ids, target_category_id, target_folder_id, copied_by } = req.body;

    if (!file_ids || !Array.isArray(file_ids) || file_ids.length === 0) {
      return res.status(400).json({ error: "file_ids array is required" });
    }

    if (!target_category_id || !copied_by) {
      return res.status(400).json({ error: "target_category_id and copied_by are required" });
    }

    const userValid = await validateUser(copied_by);
    if (!userValid) {
      return res.status(400).json({ error: "Invalid copied_by user" });
    }

    const results = { copied: [], errors: [] };

    for (const file_id of file_ids) {
      try {
        const [files] = await inhouseDb.query("SELECT * FROM categories_files WHERE id = ?", [file_id]);
        if (files.length === 0) {
          results.errors.push({ file_id, error: "File not found" });
          continue;
        }

        const originalFile = files[0];
        const newFileName = `Copy of ${originalFile.name}`;

        const originalPath = originalFile.file_path;
        const newPath = originalPath.replace(path.basename(originalPath), `${Date.now()}-${path.basename(originalPath)}`);
        
        await fs.promises.copyFile(originalPath, newPath);

        const [result] = await inhouseDb.query(
          `INSERT INTO categories_files 
          (name, original_name, file_type, file_size, mime_type, file_path, category_id, folder_id, 
           is_starred, is_active, download_count, last_accessed, created_by, created_at, updated_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0, NOW(), ?, NOW(), NOW())`,
          [
            newFileName,
            newFileName,
            originalFile.file_type,
            originalFile.file_size,
            originalFile.mime_type,
            newPath,
            target_category_id,
            target_folder_id || null,
            copied_by
          ]
        );

        await addActivityLog(copied_by, 'copy', 'file', result.insertId, newFileName);
        results.copied.push({ file_id: result.insertId, name: newFileName });

      } catch (error) {
        console.error(`Error copying file ${file_id}:`, error);
        results.errors.push({ file_id, error: "Failed to copy file" });
      }
    }

    res.json({
      message: `Copy completed: ${results.copied.length} copied, ${results.errors.length} errors`,
      results: results
    });

  } catch (error) {
    console.error("Error copying multiple files:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get('/files/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, preview } = req.query;

    console.log("\n⬇️ ===== CATEGORY FILE DOWNLOAD =====");
    console.log("📎 File ID:", id);
    console.log("👤 User ID:", user_id);
    console.log("👁️ Preview mode:", preview);

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "Valid file ID is required" });
    }

    const [files] = await inhouseDb.query(
      "SELECT * FROM categories_files WHERE id = ? AND is_active = 1", 
      [id]
    );
    
    if (files.length === 0) {
      console.log("❌ File not found");
      return res.status(404).json({ error: "File not found" });
    }

    const file = files[0];
    console.log("📋 File details:", {
      id: file.id,
      name: file.original_name,
      type: file.file_type,
      size: file.file_size
    });

    if (!validateFilePath(file.file_path)) {
      console.log("❌ Invalid file path");
      return res.status(400).json({ error: "Invalid file path" });
    }

    if (!fs.existsSync(file.file_path)) {
      console.log("❌ Physical file not found");
      return res.status(404).json({ error: "Physical file not found" });
    }

    // Update download count and last accessed
    if (preview !== 'true') {
      await inhouseDb.query(
        "UPDATE categories_files SET download_count = download_count + 1, last_accessed = NOW() WHERE id = ?",
        [id]
      );

      if (user_id) {
        await addActivityLog(user_id, 'download', 'file', id, file.name, 
          `Downloaded - Size: ${formatFileSize(file.file_size)}`);
      }
    } else {
      await inhouseDb.query(
        "UPDATE categories_files SET last_accessed = NOW() WHERE id = ?",
        [id]
      );
    }

    // ============================================================
    // PROTECTION LOGIC: PDF, DOCX, XLSX
    // ============================================================
    const fileType = file.file_type ? file.file_type.toLowerCase() : '';
    const needsProtection = ['pdf', 'docx', 'doc', 'xlsx', 'xls'].includes(fileType);

    if (needsProtection) {
      console.log(`🔒 ===== ${fileType.toUpperCase()} PROTECTION PROCESS =====`);
      console.log('📋 Original file:', file.file_path);
      
      try {
        // Create temp directory if not exists
        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
          console.log('📁 Created temp directory');
        }

        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(7);
        const fileExt = path.extname(file.original_name);
        const securedFilePath = path.join(tempDir, `secured_${timestamp}_${randomStr}${fileExt}`);

        let protectionSuccess = false;
        let encryptionMethod = 'none';
        let passwordManagerInstance;
        let ownerPassword;

        // ==================== PDF PROTECTION ====================
        if (fileType === 'pdf') {
          console.log('🔒 Applying PDF Protection...');
          
          ownerPassword = 'nscsl';
          passwordManagerInstance = passwordManager;

          // Save password to storage
          passwordManagerInstance.savePassword(
            file.id,
            file.original_name,
            ownerPassword,
            user_id || file.created_by
          );
          console.log('💾 PDF Password saved to JSON storage');

          // Try native qpdf command first
          const { execSync } = require('child_process');
          const inputFile = file.file_path.replace(/\\/g, '/');
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
              await qpdf.encrypt({
                input: file.file_path,
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
          
          passwordManagerInstance = wordPasswordManager;
          ownerPassword = passwordManagerInstance.generateFixedPassword(file.id);

          try {
            await passwordManagerInstance.protectWordDocument(
              file.file_path,
              securedFilePath,
              ownerPassword
            );

            if (fs.existsSync(securedFilePath)) {
              // Save password to storage
              passwordManagerInstance.savePassword(
                file.id,
                file.original_name,
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
          
          passwordManagerInstance = excelPasswordManager;
          ownerPassword = passwordManagerInstance.generateFixedPassword(file.id);

          try {
            await passwordManagerInstance.protectExcelDocument(
              file.file_path,
              securedFilePath,
              ownerPassword
            );

            if (fs.existsSync(securedFilePath)) {
              // Save password to storage
              passwordManagerInstance.savePassword(
                file.id,
                file.original_name,
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
        res.setHeader('Content-Type', contentTypes[fileType] || file.mime_type);
        
        if (preview === 'true') {
          res.setHeader('Content-Disposition', 
            `inline; filename="${encodeURIComponent(file.original_name)}"`);
        } else {
          res.setHeader('Content-Disposition', 
            `attachment; filename="${encodeURIComponent(file.original_name)}"`);
        }

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
      
      res.setHeader('Content-Type', file.mime_type);
      res.setHeader('Content-Disposition', 
        `${preview === 'true' ? 'inline' : 'attachment'}; filename="${encodeURIComponent(file.original_name)}"`);
      res.setHeader('Content-Length', file.file_size);

      const fileStream = fs.createReadStream(file.file_path);
      fileStream.pipe(res);
    }

  } catch (error) {
    console.error("❌ Error in download endpoint:", error);
    console.error("📋 Error stack:", error.stack);
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Internal server error",
        details: error.message 
      });
    }
  }
});

// ================== BONUS: Password Storage Helper ==================
// If you want to store passwords in temp folder for tracking/debugging

const savePasswordToTemp = (fileId, ownerPassword) => {
  try {
    const tempDir = path.join(__dirname, '../temp');
    const passwordFile = path.join(tempDir, `passwords_${fileId}.txt`);
    
    const timestamp = new Date().toISOString();
    const entry = `${timestamp} - File ID: ${fileId} - Owner Password: ${ownerPassword}\n`;
    
    fs.appendFileSync(passwordFile, entry);
    console.log('💾 Password saved to:', passwordFile);
  } catch (err) {
    console.error('Failed to save password:', err);
  }
};

// ================== Get File Statistics ==================
router.get('/files/stats/:category_id', async (req, res) => {
  try {
    const { category_id } = req.params;

    if (!category_id || isNaN(category_id)) {
      return res.status(400).json({ error: "Valid category ID is required" });
    }

    const [stats] = await inhouseDb.query(`
      SELECT 
        COUNT(*) as total_files,
        SUM(file_size) as total_size,
        COUNT(CASE WHEN is_starred = 1 THEN 1 END) as starred_files,
        COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_files,
        SUM(download_count) as total_downloads,
        file_type,
        COUNT(*) as type_count
      FROM categories_files 
      WHERE category_id = ?
      GROUP BY category_id, file_type
      WITH ROLLUP
    `, [category_id]);

    res.json({
      message: "File statistics retrieved successfully",
      stats: {
        total_files: stats[stats.length - 1]?.total_files || 0,
        total_size: formatFileSize(stats[stats.length - 1]?.total_size || 0),
        starred_files: stats[stats.length - 1]?.starred_files || 0,
        active_files: stats[stats.length - 1]?.active_files || 0,
        total_downloads: stats[stats.length - 1]?.total_downloads || 0,
        file_types: stats.slice(0, -1).filter(s => s.file_type).map(s => ({
          type: s.file_type,
          count: s.type_count,
          size: formatFileSize(s.total_size)
        }))
      }
    });

  } catch (error) {
    console.error("Error getting file statistics:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ================== QPDF Diagnostic Endpoint ==================
router.get('/test-qpdf', async (req, res) => {
  const { execSync } = require('child_process');
  
  const diagnostics = {
    timestamp: new Date().toISOString(),
    system: {
      platform: process.platform,
      node_version: process.version,
      arch: process.arch
    },
    packages: {
      node_qpdf2_installed: false,
      node_qpdf2_version: null,
      pdflib_installed: false,
      pdflib_version: null
    },
    qpdf_binary: {
      installed: false,
      version: null,
      path: null,
      error: null
    },
    test_result: null
  };

  try {
    // Check if node-qpdf2 package is installed
    try {
      const qpdfPackage = require('node-qpdf2');
      diagnostics.packages.node_qpdf2_installed = true;
      diagnostics.packages.node_qpdf2_version = 'installed';
    } catch (e) {
      diagnostics.packages.node_qpdf2_installed = false;
    }

    // Check if pdf-lib package is installed
    try {
      const pdfLib = require('pdf-lib');
      diagnostics.packages.pdflib_installed = true;
      diagnostics.packages.pdflib_version = 'installed';
    } catch (e) {
      diagnostics.packages.pdflib_installed = false;
    }

    // Check if QPDF binary is installed on the system
    try {
      const qpdfVersion = execSync('qpdf --version', { 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      diagnostics.qpdf_binary.installed = true;
      diagnostics.qpdf_binary.version = qpdfVersion.trim();
      
      // Try to get QPDF path
      try {
        const qpdfPath = execSync(process.platform === 'win32' ? 'where qpdf' : 'which qpdf', {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe']
        });
        diagnostics.qpdf_binary.path = qpdfPath.trim();
      } catch (e) {
        diagnostics.qpdf_binary.path = 'Could not determine path';
      }

      diagnostics.test_result = {
        status: 'SUCCESS',
        message: 'QPDF is properly installed! PDF protection will work correctly.',
        action: 'Your system is ready to create SECURED PDFs'
      };

    } catch (error) {
      diagnostics.qpdf_binary.installed = false;
      diagnostics.qpdf_binary.error = error.message;
      
      diagnostics.test_result = {
        status: 'ERROR',
        message: 'QPDF binary is NOT installed on your system',
        action: 'Install QPDF to enable PDF protection',
        instructions: {
          windows: 'Download and install from: https://github.com/qpdf/qpdf/releases (get the Windows installer)',
          mac: 'Run: brew install qpdf',
          linux: 'Run: sudo apt-get install qpdf'
        }
      };
    }

  } catch (error) {
    diagnostics.test_result = {
      status: 'ERROR',
      message: 'Diagnostic test failed',
      error: error.message
    };
  }

  res.json(diagnostics);
});

// ================== Test PDF Protection Endpoint ==================
router.post('/test-pdf-protection', async (req, res) => {
  try {
    const testPdfPath = path.join(__dirname, '../temp/test-original.pdf');
    const securedPdfPath = path.join(__dirname, '../temp/test-secured.pdf');
    
    // Create temp directory
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Create a simple test PDF using pdf-lib
    const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    page.drawText('This is a TEST PDF for protection verification', {
      x: 50,
      y: 350,
      size: 20,
      font: font,
      color: rgb(0, 0, 0)
    });
    
    page.drawText('If QPDF is working, this PDF will show (SECURED)', {
      x: 50,
      y: 300,
      size: 14,
      font: font,
      color: rgb(0.5, 0.5, 0.5)
    });

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(testPdfPath, pdfBytes);

    console.log('✅ Test PDF created');

    // Try to encrypt with QPDF
    const timestamp = Date.now();
    // In test-pdf-protection endpoint
    const encryptOptions = {
      input: testPdfPath,
      output: securedPdfPath,
      ownerPassword: `test_owner_${timestamp}`,
      userPassword: '',
      keyLength: 256,
      restrictions: {
        print: 'full',
        extract: 'n',
        annotate: 'n',
        form: 'n',
        assembly: 'n',
        printHq: 'y'
        // ✅ REMOVED: modify: 'none'
      }
    };

    await qpdf.encrypt(encryptOptions);

    console.log('✅ Test PDF encrypted successfully!');

    // Send the secured PDF for download
    const securedBuffer = fs.readFileSync(securedPdfPath);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="test-secured.pdf"');
    res.setHeader('Content-Length', securedBuffer.length);
    
    res.send(securedBuffer);

    // Cleanup
    setTimeout(() => {
      try {
        if (fs.existsSync(testPdfPath)) fs.unlinkSync(testPdfPath);
        if (fs.existsSync(securedPdfPath)) fs.unlinkSync(securedPdfPath);
        console.log('✅ Test files cleaned up');
      } catch (e) {
        console.error('Failed to cleanup test files:', e);
      }
    }, 5000);

  } catch (error) {
    console.error('❌ PDF protection test failed:', error);
    res.status(500).json({
      error: 'PDF protection test failed',
      message: error.message,
      suggestion: 'Make sure QPDF is installed on your system'
    });
  }
});

// ================== Universal Search Endpoint (ADD THIS) ==================
router.get('/search', async (req, res) => {
  try {
    const { q: query, limit = 50 } = req.query;
    
    console.log('🔍 ===== UNIVERSAL SEARCH =====');
    console.log('Query:', query);
    
    if (!query || query.trim() === '') {
      return res.status(400).json({ error: "Search query 'q' is required" });
    }
    
    const searchTerm = `%${sanitizeInput(query)}%`;
    const searchLimit = parseInt(limit);
    
    console.log('🔍 Searching with term:', searchTerm);
    
    // Search categories
    console.log('🔍 Searching categories...');
    const [categories] = await inhouseDb.query(
      `SELECT c.*, u.name as created_by_name
       FROM categories c
       LEFT JOIN users u ON c.created_by = u.id
       WHERE c.name LIKE ? OR c.description LIKE ?
       ORDER BY c.name ASC
       LIMIT ?`,
      [searchTerm, searchTerm, searchLimit]
    );
    console.log('✅ Found categories:', categories.length);
    
    // Search folders
    console.log('🔍 Searching folders...');
    const [folders] = await inhouseDb.query(
      `SELECT f.*, c.name as category_name, u.name as created_by_name
       FROM categories_folders f
       LEFT JOIN categories c ON f.category_id = c.id
       LEFT JOIN users u ON f.created_by = u.id
       WHERE f.name LIKE ? OR f.description LIKE ?
       ORDER BY f.name ASC
       LIMIT ?`,
      [searchTerm, searchTerm, searchLimit]
    );
    console.log('✅ Found folders:', folders.length);
    
    // Search files
    console.log('🔍 Searching files...');
    const [files] = await inhouseDb.query(
      `SELECT f.*, c.name as category_name, cf.name as folder_name, u.name as created_by_name
       FROM categories_files f
       LEFT JOIN categories c ON f.category_id = c.id
       LEFT JOIN categories_folders cf ON f.folder_id = cf.id
       LEFT JOIN users u ON f.created_by = u.id
       WHERE f.name LIKE ? OR f.original_name LIKE ? OR f.description LIKE ?
       ORDER BY f.name ASC
       LIMIT ?`,
      [searchTerm, searchTerm, searchTerm, searchLimit]
    );
    console.log('✅ Found files:', files.length);
    
    const totalResults = categories.length + folders.length + files.length;
    
    console.log(`✅ Search completed: ${totalResults} total results`);
    
    res.json({
      message: "Search completed successfully",
      query: query.trim(),
      results: {
        categories: categories || [],
        folders: folders || [],
        files: files || []
      },
      totalResults: totalResults
    });
    
  } catch (error) {
    console.error("💥 Error in universal search:", error);
    res.status(500).json({ error: "Search failed: " + error.message });
  }
});

// ================== Preview Category File ==================
router.get('/files/:id/preview', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.user_id;

    // Check access
    const [files] = await inhouseDb.query(
      'SELECT * FROM categories_files WHERE id = ? AND is_active = 1',
      [id]
    );

    if (files.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = files[0];

    // Check if user owns or has shared access
    const [shares] = await inhouseDb.query(
      `SELECT id FROM file_shares 
       WHERE category_file_id = ? AND shared_with = ?`,
      [id, userId]
    );

    if (String(file.created_by) !== String(userId) && shares.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Serve the file for preview
    if (!fs.existsSync(file.file_path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    const fileStream = fs.createReadStream(file.file_path);
    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Disposition', 'inline');
    fileStream.pipe(res);

  } catch (error) {
    console.error('Error previewing file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ================== Download Category File ==================
router.get('/files/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.user_id;

    // Check access
    const [files] = await inhouseDb.query(
      'SELECT * FROM categories_files WHERE id = ? AND is_active = 1',
      [id]
    );

    if (files.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = files[0];

    // Check if user owns or has shared access
    const [shares] = await inhouseDb.query(
      `SELECT id FROM file_shares 
       WHERE category_file_id = ? AND shared_with = ?`,
      [id, userId]
    );

    if (String(file.created_by) !== String(userId) && shares.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update download count
    await inhouseDb.query(
      'UPDATE categories_files SET download_count = download_count + 1 WHERE id = ?',
      [id]
    );

    // Serve the file for download
    if (!fs.existsSync(file.file_path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
    
    const fileStream = fs.createReadStream(file.file_path);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ================== Error Handler Middleware ==================
router.use(handleMulterError);

module.exports = router;