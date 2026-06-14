const express = require('express');
const router = express.Router();
const db = require("../config/db");
const validator = require('validator');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// ================== Constants ==================
const MAX_FOLDER_DEPTH = 3;
const UNDO_EXPIRY_HOURS = 24;
const MOVE_HISTORY_LIMIT = 10;

// ================== Helper: Validate User ==================
async function validateUser(userId) {
  try {
    const [rows] = await db.query('SELECT id FROM users WHERE id = $1', [userId]);
    return rows.length > 0;
  } catch (error) {
    console.error('Error validating user:', error);
    return false;
  }
}

// ================== Helper: Sanitize Input ==================
function sanitizeInput(input) {
  if (!input) return input;
  return validator.escape(input.toString().trim());
}

// ================== Helper: Add Activity Log ==================
async function addActivityLog(userId, action, targetType, targetId, targetName, additionalInfo = null) {
  try {
    await db.query(
      `INSERT INTO activity_logs 
       (user_id, action, target_type, target_id, target_name, additional_info, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [userId, action, targetType, targetId, targetName, additionalInfo]
    );
  } catch (error) {
    console.error('Error adding activity log:', error);
  }
}

// ================== Helper: Check File Conflict ==================
// Checks categories_files table for name conflict in target folder
async function checkFileConflict(fileName, targetFolderId, targetCategoryId) {
  let query, params;

  if (targetFolderId) {
    query = `SELECT id, name, file_path, file_size, file_type, folder_id, category_id 
             FROM categories_files 
             WHERE name = ? AND folder_id = ? AND is_active = 1`;
    params = [fileName, targetFolderId];
  } else if (targetCategoryId) {
    query = `SELECT id, name, file_path, file_size, file_type, folder_id, category_id 
             FROM categories_files 
             WHERE name = ? AND folder_id IS NULL AND category_id = ? AND is_active = 1`;
    params = [fileName, targetCategoryId];
  } else {
    return null;
  }

  const [rows] = await db.query(query, params);
  return rows.length > 0 ? rows[0] : null;
}

// ================== Helper: Check Folder Conflict ==================
// Checks categories_folders table for name conflict in target parent
async function checkFolderConflict(folderName, targetParentFolderId, targetCategoryId) {
  let query, params;

  if (targetParentFolderId) {
    query = `SELECT id, name FROM categories_folders 
             WHERE name = ? AND parent_folder_id = ?`;
    params = [folderName, targetParentFolderId];
  } else if (targetCategoryId) {
    query = `SELECT id, name FROM categories_folders 
             WHERE name = ? AND parent_folder_id IS NULL AND category_id = ?`;
    params = [folderName, targetCategoryId];
  } else {
    return null;
  }

  const [rows] = await db.query(query, params);
  return rows.length > 0 ? rows[0] : null;
}

// ================== Helper: Get Next Version Number ==================
async function getNextVersionNumber(categoryFileId) {
  const [rows] = await db.query(
    'SELECT MAX(version_number) as max_version FROM file_versions WHERE category_file_id = $1',
    [categoryFileId]
  );
  const maxVersion = rows[0].max_version;
  return maxVersion ? maxVersion + 1 : 1;
}

// ================== Helper: Snapshot File As Version ==================
async function snapshotFileAsVersion(file, movedBy, notes = null) {
  try {
    const versionNumber = await getNextVersionNumber(file.id);
    await db.query(
      `INSERT INTO file_versions 
       (category_file_id, version_number, file_name, file_path, file_size, file_type, moved_from_folder_id, created_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        file.id,
        versionNumber,
        file.name,
        file.file_path,
        file.file_size,
        file.file_type,
        file.folder_id || null,
        movedBy,
        notes || `Version ${versionNumber} â€” snapshotted before overwrite`
      ]
    );
    console.log(`ðŸ“¸ Snapshot saved: ${file.name} as version ${versionNumber}`);
    return versionNumber;
  } catch (err) {
    console.error('Error snapshotting file as version:', err);
    throw err;
  }
}

// ================== Helper: Handle Overwrite ==================
async function handleOverwrite(incomingFile, existingFile, targetFolderId, targetCategoryId, movedBy) {
  // Snapshot the existing file before overwriting
  const versionNumber = await snapshotFileAsVersion(
    existingFile, movedBy,
    `Overwritten by "${incomingFile.name}" moved from folder ${incomingFile.folder_id || 'root'}`
  );

  // Update existing file row with incoming file's path/size/type
  await db.query(
    `UPDATE categories_files 
     SET file_path = $1, file_size = $2, file_type = $3, mime_type = $4, updated_by = $5, updated_at = NOW() 
     WHERE id = $6`,
    [incomingFile.file_path, incomingFile.file_size, incomingFile.file_type, incomingFile.mime_type || null, movedBy, existingFile.id]
  );

  // Delete the incoming file row (it's been merged into existing)
  await db.query('DELETE FROM categories_files WHERE id = $1', [incomingFile.id]);

  await addActivityLog(movedBy, 'OVERWRITE', 'FILE', existingFile.id, existingFile.name,
    JSON.stringify({
      action: 'overwrite',
      incoming_file_id: incomingFile.id,
      previous_version_saved: versionNumber,
      source: 'categories_files'
    })
  );

  return {
    strategy: 'overwrite',
    file_id: existingFile.id,
    file_name: existingFile.name,
    previous_version_saved: versionNumber,
    message: `File overwritten. Previous version saved as version ${versionNumber}.`
  };
}

// ================== Helper: Handle Version ==================
async function handleVersion(incomingFile, existingFile, targetFolderId, targetCategoryId, movedBy) {
  try {
    const versionNumber = await getNextVersionNumber(existingFile.id);

    // Generate versioned file name: "MyDoc.pdf" â†’ "MyDoc (Version 2).pdf"
    const ext = path.extname(incomingFile.name);
    const baseName = path.basename(incomingFile.name, ext);
    const versionedFileName = `${baseName} (Version ${versionNumber})${ext}`;

    // Rename physical file on disk
    const oldPhysicalPath = fs.existsSync(incomingFile.file_path)
      ? incomingFile.file_path
      : path.join(process.cwd(), incomingFile.file_path);

    const versionedPhysicalName = `${Date.now()}-${versionedFileName.replace(/[^a-zA-Z0-9.\-()]/g, '_')}`;
    const versionedFilePath = path.join('uploads', versionedPhysicalName);
    const resolvedVersionedPath = path.join(process.cwd(), versionedFilePath);

    if (fs.existsSync(oldPhysicalPath)) {
      await fs.promises.rename(oldPhysicalPath, resolvedVersionedPath);
      console.log(`âœ… Renamed physical file to: ${resolvedVersionedPath}`);
    } else {
      console.warn(`âš ï¸ Physical file not found: ${oldPhysicalPath}`);
    }

    const finalFilePath = fs.existsSync(resolvedVersionedPath) ? versionedFilePath : incomingFile.file_path;

    // Update incoming file row with new versioned name, path, and target location
    await db.query(
      `UPDATE categories_files 
       SET name = $1, original_name = $2, file_path = $3, folder_id = $4, category_id = $5, updated_by = $6, updated_at = NOW()
       WHERE id = $7`,
      [
        versionedFileName,
        versionedFileName,
        finalFilePath,
        targetFolderId || null,
        targetCategoryId || incomingFile.category_id,
        movedBy,
        incomingFile.id
      ]
    );

    // Save version record linked to the EXISTING file
    await db.query(
      `INSERT INTO file_versions 
       (category_file_id, version_number, file_name, file_path, file_size, file_type, moved_from_folder_id, created_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        existingFile.id,
        versionNumber,
        versionedFileName,
        finalFilePath,
        incomingFile.file_size,
        incomingFile.file_type,
        incomingFile.folder_id || null,
        movedBy,
        `Version ${versionNumber} â€” moved from folder ${incomingFile.folder_id || 'root'}`
      ]
    );

    await addActivityLog(
      movedBy, 'VERSION', 'FILE', incomingFile.id, versionedFileName,
      JSON.stringify({
        action: 'new_version',
        original_file_id: existingFile.id,
        version_number: versionNumber,
        original_name: incomingFile.name,
        new_name: versionedFileName,
        source: 'categories_files'
      })
    );

    console.log(`âœ… Version created: "${versionedFileName}" (version ${versionNumber})`);

    return {
      strategy: 'version',
      file_id: incomingFile.id,
      file_name: versionedFileName,
      new_version_number: versionNumber,
      message: `File saved as "${versionedFileName}" (version ${versionNumber}).`
    };
  } catch (err) {
    console.error('ðŸ’¥ Error in handleVersion:', err);
    throw err;
  }
}

// ================== Helper: Get Folder Content Depth ==================
async function getFolderContentDepth(folderId, currentDepth = 1) {
  if (currentDepth > MAX_FOLDER_DEPTH) return currentDepth;
  const [subFolders] = await db.query(
    'SELECT id FROM categories_folders WHERE parent_folder_id = $1',
    [folderId]
  );
  if (subFolders.length === 0) return currentDepth;
  let maxDepth = currentDepth;
  for (const sub of subFolders) {
    const childDepth = await getFolderContentDepth(sub.id, currentDepth + 1);
    if (childDepth > maxDepth) maxDepth = childDepth;
  }
  return maxDepth;
}

// ================== Helper: Check Circular Reference ==================
async function checkCircularReference(folderId, targetParentId) {
  if (!targetParentId) return false;
  if (String(folderId) === String(targetParentId)) return true;
  let currentId = targetParentId;
  while (currentId) {
    const [rows] = await db.query(
      'SELECT parent_folder_id FROM categories_folders WHERE id = $1',
      [currentId]
    );
    if (rows.length === 0) break;
    currentId = rows[0].parent_folder_id;
    if (String(currentId) === String(folderId)) return true;
  }
  return false;
}

// ================== Helper: Record Move History ==================
async function recordMoveHistory(batchId, userId, itemType, itemId, itemName, fromFolderId, toFolderId) {
  try {
    await db.query(
      `INSERT INTO move_history 
       (batch_id, user_id, item_type, item_id, item_name, from_folder_id, to_folder_id, item_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'categories_files')`,
      [batchId, userId, itemType, itemId, itemName, fromFolderId || null, toFolderId || null]
    );
  } catch (err) {
    console.error('Error recording move history:', err);
  }
}

// ================== Helper: Format Size Diff ==================
function formatSizeDiff(bytes) {
  if (bytes === 0) return 'No size change';
  const abs = Math.abs(bytes);
  const sign = bytes > 0 ? '+' : '-';
  if (abs < 1024) return `${sign}${abs} B`;
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(1)} KB`;
  return `${sign}${(abs / (1024 * 1024)).toFixed(2)} MB`;
}

// =============================================================
// ROUTE 1: Move Single File
// POST /category-move/single
// Body: { file_id, target_folder_id, target_category_id, moved_by, conflict_strategy }
// =============================================================
router.post('/single', async (req, res) => {
  console.log('\nðŸ“¦ ===== CATEGORY MOVE SINGLE FILE =====');
  console.log('Body:', req.body);

  const { file_id, target_folder_id, target_category_id, moved_by, conflict_strategy = 'ask' } = req.body;
  const batchId = uuidv4();

  try {
    if (!file_id) return res.status(400).json({ error: 'file_id is required' });
    if (!moved_by) return res.status(400).json({ error: 'moved_by is required' });
    if (!target_category_id && !target_folder_id) {
      return res.status(400).json({ error: 'target_category_id or target_folder_id is required' });
    }

    const userValid = await validateUser(moved_by);
    if (!userValid) return res.status(400).json({ error: 'Invalid moved_by user' });

    const [files] = await db.query(
      'SELECT * FROM categories_files WHERE id = $1 AND is_active = 1',
      [file_id]
    );
    if (files.length === 0) return res.status(404).json({ error: 'File not found' });

    const file = files[0];
    const currentFolderId = file.folder_id ? String(file.folder_id) : null;
    const targetFolderIdStr = target_folder_id ? String(target_folder_id) : null;

    if (currentFolderId === targetFolderIdStr && String(file.category_id) === String(target_category_id)) {
      return res.status(400).json({ error: 'File is already in the target location' });
    }

    // Validate target folder belongs to target category if both provided
    if (target_folder_id && target_category_id) {
      const [folderCheck] = await db.query(
        'SELECT id FROM categories_folders WHERE id = $1 AND category_id = $2',
        [target_folder_id, target_category_id]
      );
      if (folderCheck.length === 0) {
        return res.status(400).json({ error: 'Target folder does not belong to the target category' });
      }
    }

    // Resolve effective category for target
    let effectiveCategoryId = target_category_id;
    if (target_folder_id && !target_category_id) {
      const [folderRows] = await db.query(
        'SELECT category_id FROM categories_folders WHERE id = $1',
        [target_folder_id]
      );
      if (folderRows.length === 0) return res.status(404).json({ error: 'Target folder not found' });
      effectiveCategoryId = folderRows[0].category_id;
    }

    const conflict = await checkFileConflict(file.name, target_folder_id, effectiveCategoryId);

    if (conflict) {
      console.log('âš ï¸ Conflict detected:', file.name);

      if (conflict_strategy === 'ask') {
        return res.status(409).json({
          conflict: true,
          message: `A file named "${file.name}" already exists at the destination.`,
          file: { id: file.id, name: file.name },
          conflicting_file: { id: conflict.id, name: conflict.name },
          available_strategies: ['overwrite', 'version', 'skip'],
          hint: 'Resubmit with conflict_strategy set to one of the available strategies'
        });
      }

      if (conflict_strategy === 'skip') {
        return res.json({
          message: 'File skipped due to conflict',
          skipped: true,
          file: { id: file.id, name: file.name }
        });
      }

      if (conflict_strategy === 'overwrite') {
        const result = await handleOverwrite(file, conflict, target_folder_id, effectiveCategoryId, moved_by);
        await recordMoveHistory(batchId, moved_by, 'file', result.file_id, result.file_name, file.folder_id, target_folder_id);
        return res.json({
          message: result.message, moved: true, strategy_used: 'overwrite', batch_id: batchId,
          file: { id: result.file_id, name: result.file_name, previous_version_saved: result.previous_version_saved, new_folder_id: target_folder_id || null }
        });
      }

      if (conflict_strategy === 'version') {
        const result = await handleVersion(file, conflict, target_folder_id, effectiveCategoryId, moved_by);
        await recordMoveHistory(batchId, moved_by, 'file', result.file_id, result.file_name, file.folder_id, target_folder_id);
        return res.json({
          message: result.message, moved: true, strategy_used: 'version', batch_id: batchId,
          file: { id: result.file_id, name: result.file_name, new_version_number: result.new_version_number, folder_id: target_folder_id || null }
        });
      }
    }

    // No conflict â€” normal move
    const previousFolderId = file.folder_id;
    const previousCategoryId = file.category_id;

    await db.query(
      `UPDATE categories_files 
       SET folder_id = $1, category_id = $2, updated_by = $3, updated_at = NOW() 
       WHERE id = $4`,
      [target_folder_id || null, effectiveCategoryId, moved_by, file_id]
    );

    await addActivityLog(moved_by, 'MOVE', 'FILE', file.id, file.name,
      `Moved from folder ${previousFolderId || 'root'} (category ${previousCategoryId}) to folder ${target_folder_id || 'root'} (category ${effectiveCategoryId})`
    );

    await recordMoveHistory(batchId, moved_by, 'file', file.id, file.name, previousFolderId, target_folder_id);

    console.log(`âœ… File "${file.name}" moved successfully`);

    return res.json({
      message: 'File moved successfully', moved: true, batch_id: batchId,
      file: {
        id: file.id, name: file.name,
        previous_folder_id: previousFolderId || null,
        new_folder_id: target_folder_id || null,
        previous_category_id: previousCategoryId,
        new_category_id: effectiveCategoryId
      }
    });

  } catch (err) {
    console.error('ðŸ’¥ Error moving single category file:', err);
    return res.status(500).json({ error: 'Move failed: ' + err.message });
  }
});

// =============================================================
// ROUTE 2: Move Bulk
// POST /category-move/bulk
// Body: { file_ids, folder_ids, target_folder_id, target_category_id, moved_by, conflict_strategy }
// =============================================================
router.post('/bulk', async (req, res) => {
  console.log('\nðŸ“¦ ===== CATEGORY MOVE BULK =====');
  console.log('Body:', req.body);

  const {
    file_ids = [], folder_ids = [],
    target_folder_id, target_category_id,
    moved_by, conflict_strategy = 'ask'
  } = req.body;
  const batchId = uuidv4();

  try {
    if (!moved_by) return res.status(400).json({ error: 'moved_by is required' });
    if (file_ids.length === 0 && folder_ids.length === 0) {
      return res.status(400).json({ error: 'At least one file_id or folder_id is required' });
    }

    const userValid = await validateUser(moved_by);
    if (!userValid) return res.status(400).json({ error: 'Invalid moved_by user' });

    // Resolve effective category
    let effectiveCategoryId = target_category_id;
    let targetFolderName = 'root';

    if (target_folder_id) {
      const [folderRows] = await db.query(
        'SELECT id, name, category_id FROM categories_folders WHERE id = $1',
        [target_folder_id]
      );
      if (folderRows.length === 0) return res.status(404).json({ error: 'Target folder not found' });
      targetFolderName = folderRows[0].name;
      if (!effectiveCategoryId) effectiveCategoryId = folderRows[0].category_id;
    } else if (target_category_id) {
      const [catRows] = await db.query('SELECT id, name FROM categories WHERE id = $1', [target_category_id]);
      if (catRows.length === 0) return res.status(404).json({ error: 'Target category not found' });
      targetFolderName = catRows[0].name;
    }

    if (!effectiveCategoryId) {
      return res.status(400).json({ error: 'target_category_id or target_folder_id is required' });
    }

    // Pre-scan conflicts if strategy is 'ask'
    if (conflict_strategy === 'ask') {
      const conflicts = [];
      for (const fileId of file_ids) {
        const [files] = await db.query(
          'SELECT * FROM categories_files WHERE id = $1 AND is_active = 1', [fileId]
        );
        if (files.length === 0) continue;
        const conflict = await checkFileConflict(files[0].name, target_folder_id, effectiveCategoryId);
        if (conflict) {
          conflicts.push({
            id: files[0].id, name: files[0].name, type: 'file',
            conflicting_id: conflict.id, conflicting_name: conflict.name
          });
        }
      }
      if (conflicts.length > 0) {
        return res.status(409).json({
          conflict: true,
          message: `${conflicts.length} conflict(s) found at the destination.`,
          conflicts,
          available_strategies: ['overwrite', 'version', 'skip'],
          hint: 'Resubmit with conflict_strategy set to overwrite, version, or skip'
        });
      }
    }

    const results = { moved_files: [], moved_folders: [], skipped: [], conflicts: [], errors: [] };

    // â”€â”€ Move Files â”€â”€
    for (const fileId of file_ids) {
      try {
        const [files] = await db.query(
          'SELECT * FROM categories_files WHERE id = $1 AND is_active = 1', [fileId]
        );
        if (files.length === 0) { results.errors.push({ id: fileId, reason: 'File not found' }); continue; }

        const file = files[0];
        const currentFolderIdStr = file.folder_id ? String(file.folder_id) : null;
        const targetFolderIdStr = target_folder_id ? String(target_folder_id) : null;

        if (currentFolderIdStr === targetFolderIdStr && String(file.category_id) === String(effectiveCategoryId)) {
          results.skipped.push({ id: file.id, name: file.name, reason: 'Already in target location' });
          continue;
        }

        const conflict = await checkFileConflict(file.name, target_folder_id, effectiveCategoryId);

        if (conflict) {
          if (conflict_strategy === 'skip') {
            results.skipped.push({ id: file.id, name: file.name, reason: 'Conflict â€” skipped' });
            continue;
          }
          if (conflict_strategy === 'overwrite') {
            const r = await handleOverwrite(file, conflict, target_folder_id, effectiveCategoryId, moved_by);
            await recordMoveHistory(batchId, moved_by, 'file', r.file_id, r.file_name, file.folder_id, target_folder_id);
            results.moved_files.push({ id: r.file_id, name: r.file_name, strategy_used: 'overwrite', previous_version_saved: r.previous_version_saved });
            continue;
          }
          if (conflict_strategy === 'version') {
            const r = await handleVersion(file, conflict, target_folder_id, effectiveCategoryId, moved_by);
            await recordMoveHistory(batchId, moved_by, 'file', r.file_id, r.file_name, file.folder_id, target_folder_id);
            results.moved_files.push({ id: r.file_id, name: r.file_name, strategy_used: 'version', new_version_number: r.new_version_number });
            continue;
          }
          results.conflicts.push({ id: file.id, name: file.name, conflicting_file_id: conflict.id });
          continue;
        }

        const previousFolderId = file.folder_id;
        await db.query(
          `UPDATE categories_files SET folder_id = $1, category_id = $2, updated_by = $3, updated_at = NOW() WHERE id = $4`,
          [target_folder_id || null, effectiveCategoryId, moved_by, fileId]
        );
        await addActivityLog(moved_by, 'MOVE', 'FILE', file.id, file.name,
          `Bulk move to folder ${targetFolderName}`
        );
        await recordMoveHistory(batchId, moved_by, 'file', file.id, file.name, previousFolderId, target_folder_id);
        results.moved_files.push({
          id: file.id, name: file.name,
          previous_folder_id: previousFolderId || null,
          new_folder_id: target_folder_id || null
        });

      } catch (fileErr) {
        console.error(`ðŸ’¥ Error moving file ${fileId}:`, fileErr);
        results.errors.push({ id: fileId, reason: fileErr.message });
      }
    }

    // â”€â”€ Move Folders â”€â”€
    for (const folderId of folder_ids) {
      try {
        const [folders] = await db.query(
          'SELECT * FROM categories_folders WHERE id = $1', [folderId]
        );
        if (folders.length === 0) { results.errors.push({ id: folderId, reason: 'Folder not found' }); continue; }

        const folder = folders[0];

        if (String(folderId) === String(target_folder_id)) {
          results.errors.push({ id: folderId, name: folder.name, reason: 'Cannot move a folder into itself' });
          continue;
        }

        const isCircular = await checkCircularReference(folderId, target_folder_id);
        if (isCircular) {
          results.errors.push({ id: folderId, name: folder.name, reason: 'Cannot move a folder into its own descendant' });
          continue;
        }

        const contentDepth = await getFolderContentDepth(folderId);
        if (contentDepth > MAX_FOLDER_DEPTH) {
          results.errors.push({ id: folderId, name: folder.name, reason: `Folder exceeds max depth of ${MAX_FOLDER_DEPTH}` });
          continue;
        }

        const conflict = await checkFolderConflict(folder.name, target_folder_id, effectiveCategoryId);
        if (conflict) {
          results.conflicts.push({ id: folderId, name: folder.name, type: 'folder', conflicting_folder_id: conflict.id });
          continue;
        }

        const previousParentId = folder.parent_folder_id;
        await db.query(
          `UPDATE categories_folders SET parent_folder_id = $1, category_id = $2, updated_by = $3, updated_at = NOW() WHERE id = $4`,
          [target_folder_id || null, effectiveCategoryId, moved_by, folderId]
        );
        await addActivityLog(moved_by, 'MOVE', 'FOLDER', folder.id, folder.name,
          `Bulk move to ${targetFolderName}`
        );
        await recordMoveHistory(batchId, moved_by, 'folder', folder.id, folder.name, previousParentId, target_folder_id);
        results.moved_folders.push({
          id: folder.id, name: folder.name,
          previous_parent_id: previousParentId || null,
          new_parent_id: target_folder_id || null
        });

      } catch (folderErr) {
        console.error(`ðŸ’¥ Error moving folder ${folderId}:`, folderErr);
        results.errors.push({ id: folderId, reason: folderErr.message });
      }
    }

    const summary = {
      total_requested: file_ids.length + folder_ids.length,
      total_moved: results.moved_files.length + results.moved_folders.length,
      total_conflicts: results.conflicts.length,
      total_skipped: results.skipped.length,
      total_errors: results.errors.length
    };

    console.log('âœ… Category bulk move completed:', summary);

    return res.json({
      message: `Bulk move completed: ${summary.total_moved} moved, ${summary.total_conflicts} conflicts, ${summary.total_errors} errors`,
      batch_id: batchId, results, summary
    });

  } catch (err) {
    console.error('ðŸ’¥ Error in category bulk move:', err);
    return res.status(500).json({ error: 'Bulk move failed: ' + err.message });
  }
});

// =============================================================
// ROUTE 3: Move Preview
// GET /category-move/preview
// Query: { file_ids, folder_ids, target_folder_id, target_category_id }
// =============================================================
router.get('/preview', async (req, res) => {
  console.log('\nðŸ” ===== CATEGORY MOVE PREVIEW =====');
  const { file_ids, folder_ids, target_folder_id, target_category_id } = req.query;

  try {
    const fileIdList = file_ids ? (Array.isArray(file_ids) ? file_ids : [file_ids]) : [];
    const folderIdList = folder_ids ? (Array.isArray(folder_ids) ? folder_ids : [folder_ids]) : [];

    if (fileIdList.length === 0 && folderIdList.length === 0) {
      return res.status(400).json({ error: 'At least one file_id or folder_id is required' });
    }

    // Resolve effective category
    let effectiveCategoryId = target_category_id;
    if (target_folder_id && !effectiveCategoryId) {
      const [folderRows] = await db.query(
        'SELECT category_id FROM categories_folders WHERE id = $1', [target_folder_id]
      );
      if (folderRows.length > 0) effectiveCategoryId = folderRows[0].category_id;
    }

    const preview = { can_move: [], conflicts: [], errors: [], warnings: [] };

    for (const fileId of fileIdList) {
      const [files] = await db.query(
        'SELECT * FROM categories_files WHERE id = $1 AND is_active = 1', [fileId]
      );
      if (files.length === 0) { preview.errors.push({ id: fileId, type: 'file', reason: 'File not found' }); continue; }
      const file = files[0];
      const conflict = await checkFileConflict(file.name, target_folder_id, effectiveCategoryId);
      if (conflict) {
        preview.conflicts.push({
          id: file.id, name: file.name, type: 'file',
          conflicting_id: conflict.id,
          message: `A file named "${file.name}" already exists at the destination`,
          available_strategies: ['overwrite', 'version', 'skip']
        });
      } else {
        preview.can_move.push({ id: file.id, name: file.name, type: 'file' });
      }
    }

    for (const folderId of folderIdList) {
      const [folders] = await db.query(
        'SELECT * FROM categories_folders WHERE id = $1', [folderId]
      );
      if (folders.length === 0) { preview.errors.push({ id: folderId, type: 'folder', reason: 'Folder not found' }); continue; }
      const folder = folders[0];

      if (String(folderId) === String(target_folder_id)) {
        preview.errors.push({ id: folderId, name: folder.name, type: 'folder', reason: 'Cannot move a folder into itself' });
        continue;
      }

      const isCircular = await checkCircularReference(folderId, target_folder_id);
      if (isCircular) {
        preview.errors.push({ id: folderId, name: folder.name, type: 'folder', reason: 'Circular reference detected' });
        continue;
      }

      const contentDepth = await getFolderContentDepth(folderId);
      if (contentDepth > MAX_FOLDER_DEPTH) {
        preview.warnings.push({ id: folderId, name: folder.name, type: 'folder', reason: `Folder is ${contentDepth} levels deep (max: ${MAX_FOLDER_DEPTH})` });
        continue;
      }

      const conflict = await checkFolderConflict(folder.name, target_folder_id, effectiveCategoryId);
      if (conflict) {
        preview.conflicts.push({
          id: folder.id, name: folder.name, type: 'folder',
          conflicting_id: conflict.id,
          message: `A folder named "${folder.name}" already exists at the destination`,
          available_strategies: ['skip']
        });
      } else {
        preview.can_move.push({ id: folder.id, name: folder.name, type: 'folder' });
      }
    }

    const summary = {
      total_items: fileIdList.length + folderIdList.length,
      can_move: preview.can_move.length,
      has_conflicts: preview.conflicts.length,
      has_errors: preview.errors.length,
      has_warnings: preview.warnings.length,
      ready_to_move: preview.errors.length === 0 && preview.warnings.length === 0
    };

    return res.json({ message: 'Move preview generated', target_folder_id: target_folder_id || null, preview, summary });

  } catch (err) {
    console.error('ðŸ’¥ Error generating category move preview:', err);
    return res.status(500).json({ error: 'Preview failed: ' + err.message });
  }
});

// =============================================================
// ROUTE 4: Get Move History
// GET /category-move/history?user_id=1
// =============================================================
router.get('/history', async (req, res) => {
  console.log('\nðŸ“œ ===== GET CATEGORY MOVE HISTORY =====');
  const { user_id } = req.query;

  try {
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    const userValid = await validateUser(user_id);
    if (!userValid) return res.status(400).json({ error: 'Invalid user' });

    const [batches] = await db.query(
      `SELECT batch_id, MIN(moved_at) as moved_at, COUNT(*) as item_count,
              MAX(undone) as undone, MAX(undone_at) as undone_at
       FROM move_history
       WHERE user_id = $1 AND item_source = 'categories_files'
       GROUP BY batch_id
       ORDER BY moved_at DESC
       LIMIT $2`,
      [user_id, MOVE_HISTORY_LIMIT]
    );

    if (batches.length === 0) {
      return res.json({ message: 'No move history found', history: [], total: 0 });
    }

    const now = new Date();
    const history = [];

    for (const batch of batches) {
      const [items] = await db.query(
        `SELECT * FROM move_history 
         WHERE batch_id = $1 AND item_source = 'categories_files' 
         ORDER BY id ASC`,
        [batch.batch_id]
      );

      const movedAt = new Date(batch.moved_at);
      const hoursElapsed = (now - movedAt) / (1000 * 60 * 60);
      const isExpired = hoursElapsed > UNDO_EXPIRY_HOURS;
      const isUndone = batch.undone === 1;
      const canUndo = !isExpired && !isUndone;

      const formattedItems = [];
      for (const item of items) {
        let fromFolderName = 'root';
        let toFolderName = 'root';
        if (item.from_folder_id) {
          const [f] = await db.query('SELECT name FROM categories_folders WHERE id = $1', [item.from_folder_id]);
          if (f.length > 0) fromFolderName = f[0].name;
        }
        if (item.to_folder_id) {
          const [f] = await db.query('SELECT name FROM categories_folders WHERE id = $1', [item.to_folder_id]);
          if (f.length > 0) toFolderName = f[0].name;
        }
        formattedItems.push({
          id: item.id, item_type: item.item_type, item_id: item.item_id,
          item_name: item.item_name, from_folder: fromFolderName,
          to_folder: toFolderName, from_folder_id: item.from_folder_id,
          to_folder_id: item.to_folder_id
        });
      }

      history.push({
        batch_id: batch.batch_id, moved_at: batch.moved_at,
        item_count: batch.item_count, items: formattedItems,
        can_undo: canUndo, undone: isUndone, undone_at: batch.undone_at || null,
        expires_in: canUndo
          ? `${Math.max(0, (UNDO_EXPIRY_HOURS - hoursElapsed)).toFixed(1)} hours`
          : isExpired ? 'Expired' : 'Already undone'
      });
    }

    return res.json({
      message: 'Move history retrieved', history, total: history.length,
      undo_window: `${UNDO_EXPIRY_HOURS} hours`
    });

  } catch (err) {
    console.error('ðŸ’¥ Error getting category move history:', err);
    return res.status(500).json({ error: 'Failed to get move history: ' + err.message });
  }
});

// =============================================================
// ROUTE 5: Undo a Move Batch
// POST /category-move/undo/:batchId
// Body: { user_id }
// =============================================================
router.post('/undo/:batchId', async (req, res) => {
  console.log('\nâ†©ï¸ ===== UNDO CATEGORY MOVE BATCH =====');
  const { batchId } = req.params;
  const { user_id } = req.body;

  try {
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    const userValid = await validateUser(user_id);
    if (!userValid) return res.status(400).json({ error: 'Invalid user' });

    const [items] = await db.query(
      `SELECT * FROM move_history 
       WHERE batch_id = $1 AND user_id = $2 AND item_source = 'categories_files' 
       ORDER BY id ASC`,
      [batchId, user_id]
    );

    if (items.length === 0) {
      return res.status(404).json({ error: 'Batch not found or does not belong to this user' });
    }

    if (items[0].undone === 1) {
      return res.status(400).json({ error: 'This move has already been undone', undone_at: items[0].undone_at });
    }

    const now = new Date();
    const movedAt = new Date(items[0].moved_at);
    const hoursElapsed = (now - movedAt) / (1000 * 60 * 60);

    if (hoursElapsed > UNDO_EXPIRY_HOURS) {
      return res.status(400).json({
        error: `Undo window has expired. Moves can only be undone within ${UNDO_EXPIRY_HOURS} hours.`,
        moved_at: items[0].moved_at,
        hours_elapsed: hoursElapsed.toFixed(1)
      });
    }

    const results = { undone: [], failed: [], not_found: [] };
    const reversedItems = [...items].reverse();

    for (const item of reversedItems) {
      try {
        if (item.item_type === 'file') {
          const [fileCheck] = await db.query(
            'SELECT id, category_id FROM categories_files WHERE id = $1 AND is_active = 1',
            [item.item_id]
          );
          if (fileCheck.length === 0) {
            results.not_found.push({ item_type: 'file', item_id: item.item_id, item_name: item.item_name, reason: 'File no longer exists' });
            continue;
          }

          // Restore folder_id and resolve category from original folder
          let restoreCategoryId = fileCheck[0].category_id;
          if (item.from_folder_id) {
            const [origFolder] = await db.query(
              'SELECT category_id FROM categories_folders WHERE id = $1',
              [item.from_folder_id]
            );
            if (origFolder.length > 0) restoreCategoryId = origFolder[0].category_id;
          }

          await db.query(
            `UPDATE categories_files SET folder_id = $1, category_id = $2, updated_by = $3, updated_at = NOW() WHERE id = $4`,
            [item.from_folder_id || null, restoreCategoryId, user_id, item.item_id]
          );

          await addActivityLog(user_id, 'MOVE', 'FILE', item.item_id, item.item_name,
            JSON.stringify({ action: 'undo_move', batch_id: batchId, restored_to_folder: item.from_folder_id || 'root' })
          );
          results.undone.push({ item_type: 'file', item_id: item.item_id, item_name: item.item_name, restored_to_folder_id: item.from_folder_id || null });

        } else if (item.item_type === 'folder') {
          const [folderCheck] = await db.query(
            'SELECT id FROM categories_folders WHERE id = $1', [item.item_id]
          );
          if (folderCheck.length === 0) {
            results.not_found.push({ item_type: 'folder', item_id: item.item_id, item_name: item.item_name, reason: 'Folder no longer exists' });
            continue;
          }

          await db.query(
            `UPDATE categories_folders SET parent_folder_id = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`,
            [item.from_folder_id || null, user_id, item.item_id]
          );

          await addActivityLog(user_id, 'MOVE', 'FOLDER', item.item_id, item.item_name,
            JSON.stringify({ action: 'undo_move', batch_id: batchId, restored_to_parent: item.from_folder_id || 'root' })
          );
          results.undone.push({ item_type: 'folder', item_id: item.item_id, item_name: item.item_name, restored_to_folder_id: item.from_folder_id || null });
        }

      } catch (itemErr) {
        console.error(`ðŸ’¥ Error undoing item ${item.item_id}:`, itemErr);
        results.failed.push({ item_type: item.item_type, item_id: item.item_id, item_name: item.item_name, reason: itemErr.message });
      }
    }

    // Mark batch as undone
    await db.query(
      `UPDATE move_history SET undone = 1, undone_at = NOW() 
       WHERE batch_id = $1 AND item_source = 'categories_files'`,
      [batchId]
    );

    const summary = {
      total_items: items.length,
      total_undone: results.undone.length,
      total_not_found: results.not_found.length,
      total_failed: results.failed.length
    };

    console.log('âœ… Category undo completed:', summary);

    return res.json({
      message: `Undo completed: ${summary.total_undone} restored, ${summary.total_not_found} not found, ${summary.total_failed} failed`,
      batch_id: batchId, results, summary
    });

  } catch (err) {
    console.error('ðŸ’¥ Error undoing category batch:', err);
    return res.status(500).json({ error: 'Undo failed: ' + err.message });
  }
});

// =============================================================
// ROUTE 6: Get Folder Tree for Move Modal
// GET /category-move/folders?category_id=1&parent_folder_id=null
// Returns folders for a given category and parent
// =============================================================
router.get('/folders', async (req, res) => {
  const { category_id, parent_folder_id } = req.query;

  try {
    if (!category_id) return res.status(400).json({ error: 'category_id is required' });

    let query = `
      SELECT id, name, parent_folder_id, category_id 
      FROM categories_folders 
      WHERE category_id = ?
    `;
    const params = [category_id];

    if (parent_folder_id === 'null' || parent_folder_id === '' || parent_folder_id === undefined) {
      query += ' AND parent_folder_id IS NULL';
    } else {
      query += ' AND parent_folder_id = ?';
      params.push(parent_folder_id);
    }

    query += ' ORDER BY name ASC';

    const [folders] = await db.query(query, params);

    return res.json({ folders });
  } catch (err) {
    console.error('ðŸ’¥ Error getting category folders for tree:', err);
    return res.status(500).json({ error: 'Failed to get folders: ' + err.message });
  }
});

// =============================================================
// ROUTE 7: Get All Categories (for move modal category selector)
// GET /category-move/categories
// =============================================================
router.get('/categories', async (req, res) => {
  try {
    const [categories] = await db.query(
      'SELECT id, name, color, icon FROM categories WHERE is_active = 1 ORDER BY name ASC'
    );
    return res.json({ categories });
  } catch (err) {
    console.error('ðŸ’¥ Error getting categories for move:', err);
    return res.status(500).json({ error: 'Failed to get categories: ' + err.message });
  }
});

module.exports = router;
