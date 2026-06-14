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

// ================== Helper: Get Folder Content Depth ==================
async function getFolderContentDepth(folderId, currentDepth = 1) {
  if (currentDepth > MAX_FOLDER_DEPTH) return currentDepth;
  const [subFolders] = await db.query('SELECT id FROM folders WHERE parent_id = $1', [folderId]);
  if (subFolders.length === 0) return currentDepth;
  let maxDepth = currentDepth;
  for (const subFolder of subFolders) {
    const childDepth = await getFolderContentDepth(subFolder.id, currentDepth + 1);
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
    const [rows] = await db.query('SELECT parent_id FROM folders WHERE id = $1', [currentId]);
    if (rows.length === 0) break;
    currentId = rows[0].parent_id;
    if (String(currentId) === String(folderId)) return true;
  }
  return false;
}

// ================== Helper: Check File Conflict ==================
async function checkFileConflict(fileName, targetFolderId) {
  const query = targetFolderId
    ? 'SELECT id, file_name, file_path, file_size, file_type, folder_id FROM files WHERE file_name = ? AND folder_id = ?'
    : 'SELECT id, file_name, file_path, file_size, file_type, folder_id FROM files WHERE file_name = ? AND folder_id IS NULL';
  const params = targetFolderId ? [fileName, targetFolderId] : [fileName];
  const [rows] = await db.query(query, params);
  return rows.length > 0 ? rows[0] : null;
}

// ================== Helper: Check Folder Conflict ==================
async function checkFolderConflict(folderName, targetParentId) {
  const query = targetParentId
    ? 'SELECT id, name FROM folders WHERE name = ? AND parent_id = ?'
    : 'SELECT id, name FROM folders WHERE name = ? AND parent_id IS NULL';
  const params = targetParentId ? [folderName, targetParentId] : [folderName];
  const [rows] = await db.query(query, params);
  return rows.length > 0 ? rows[0] : null;
}

// ================== Helper: Get Next Version Number ==================
async function getNextVersionNumber(fileId) {
  const [rows] = await db.query(
    'SELECT MAX(version_number) as max_version FROM file_versions WHERE file_id = $1',
    [fileId]
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
       (file_id, version_number, file_name, file_path, file_size, file_type, moved_from_folder_id, created_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        file.id, versionNumber, file.file_name, file.file_path,
        file.file_size, file.file_type, file.folder_id || null, movedBy,
        notes || `Version ${versionNumber} â€” snapshotted before overwrite`
      ]
    );
    console.log(`ðŸ“¸ Snapshot saved: ${file.file_name} as version ${versionNumber}`);
    return versionNumber;
  } catch (err) {
    console.error('Error snapshotting file as version:', err);
    throw err;
  }
}

// ================== Helper: Handle Overwrite (Phase 2) ==================
async function handleOverwrite(incomingFile, existingFile, targetFolderId, movedBy) {
  const versionNumber = await snapshotFileAsVersion(
    existingFile, movedBy,
    `Overwritten by "${incomingFile.file_name}" moved from folder ${incomingFile.folder_id || 'root'}`
  );
  await db.query(
    `UPDATE files SET file_path = $1, file_size = $2, file_type = $3, updated_by = $4, updated_at = NOW() WHERE id = $5`,
    [incomingFile.file_path, incomingFile.file_size, incomingFile.file_type, movedBy, existingFile.id]
  );
  await db.query('DELETE FROM files WHERE id = $1', [incomingFile.id]);
  await addActivityLog(movedBy, 'OVERWRITE', 'FILE', existingFile.id, existingFile.file_name,
    JSON.stringify({ action: 'overwrite', incoming_file_id: incomingFile.id, previous_version_saved: versionNumber })
  );
  return { strategy: 'overwrite', file_id: existingFile.id, file_name: existingFile.file_name, previous_version_saved: versionNumber, message: `File overwritten. Previous version saved as version ${versionNumber}.` };
}

// ================== Helper: Handle Version (Phase 2) ==================
async function handleVersion(incomingFile, existingFile, targetFolderId, movedBy) {
  try {
    // Step 1: Get next version number based on existing file
    const versionNumber = await getNextVersionNumber(existingFile.id);

    // Step 2: Generate new versioned file name
    // e.g. "Testing_Document.pdf" â†’ "Testing_Document (Version 2).pdf"
    const ext = path.extname(incomingFile.file_name); // ".pdf"
    const baseName = path.basename(incomingFile.file_name, ext); // "Testing_Document"
    const versionedFileName = `${baseName} (Version ${versionNumber})${ext}`;

    // Step 3: Rename physical file on disk
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

    // Step 4: Update the incoming file row with new name, new path, and target folder
    await db.query(
      `UPDATE files 
       SET file_name = $1, file_path = $2, folder_id = $3, updated_by = $4, updated_at = NOW()
       WHERE id = $5`,
      [
        versionedFileName,
        fs.existsSync(resolvedVersionedPath) ? versionedFilePath : incomingFile.file_path,
        targetFolderId || null,
        movedBy,
        incomingFile.id
      ]
    );

    // Step 5: Save a record in file_versions linked to the EXISTING file
    await db.query(
      `INSERT INTO file_versions 
       (file_id, version_number, file_name, file_path, file_size, file_type, moved_from_folder_id, created_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        existingFile.id,
        versionNumber,
        versionedFileName,
        fs.existsSync(resolvedVersionedPath) ? versionedFilePath : incomingFile.file_path,
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
        original_name: incomingFile.file_name,
        new_name: versionedFileName
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

// ================== Helper: Record Move History (Phase 5) ==================
async function recordMoveHistory(batchId, userId, itemType, itemId, itemName, fromFolderId, toFolderId) {
  try {
    await db.query(
      `INSERT INTO move_history 
       (batch_id, user_id, item_type, item_id, item_name, from_folder_id, to_folder_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
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
// POST /move/single
// Body: { file_id, target_folder_id, moved_by, conflict_strategy }
// conflict_strategy: 'ask' | 'overwrite' | 'version' | 'skip'
// =============================================================
router.post('/single', async (req, res) => {
  console.log('\nðŸ“¦ ===== MOVE SINGLE FILE =====');
  console.log('Body:', req.body);

  const { file_id, target_folder_id, moved_by, conflict_strategy = 'ask' } = req.body;
  const batchId = uuidv4();

  try {
    if (!file_id) return res.status(400).json({ error: 'file_id is required' });
    if (!moved_by) return res.status(400).json({ error: 'moved_by is required' });

    const userValid = await validateUser(moved_by);
    if (!userValid) return res.status(400).json({ error: 'Invalid moved_by user' });

    const [files] = await db.query('SELECT * FROM files WHERE id = $1', [file_id]);
    if (files.length === 0) return res.status(404).json({ error: 'File not found' });

    const file = files[0];
    const currentFolderId = file.folder_id ? String(file.folder_id) : null;
    const targetFolderIdStr = target_folder_id ? String(target_folder_id) : null;

    if (currentFolderId === targetFolderIdStr) {
      return res.status(400).json({ error: 'File is already in the target location' });
    }

    if (target_folder_id) {
      const [targetFolder] = await db.query('SELECT id, name FROM folders WHERE id = $1', [target_folder_id]);
      if (targetFolder.length === 0) return res.status(404).json({ error: 'Target folder not found' });
    }

    const conflict = await checkFileConflict(file.file_name, target_folder_id);

    if (conflict) {
      console.log('âš ï¸ Conflict detected:', file.file_name);

      if (conflict_strategy === 'ask') {
        return res.status(409).json({
          conflict: true,
          message: `A file named "${file.file_name}" already exists at the destination.`,
          file: { id: file.id, name: file.file_name },
          conflicting_file: { id: conflict.id, name: conflict.file_name },
          available_strategies: ['overwrite', 'version', 'skip'],
          hint: 'Resubmit with conflict_strategy set to one of the available strategies'
        });
      }

      if (conflict_strategy === 'skip') {
        return res.json({ message: 'File skipped due to conflict', skipped: true, file: { id: file.id, name: file.file_name } });
      }

      if (conflict_strategy === 'overwrite') {
        const result = await handleOverwrite(file, conflict, target_folder_id, moved_by);
        await recordMoveHistory(batchId, moved_by, 'file', result.file_id, result.file_name, file.folder_id, target_folder_id);
        return res.json({
          message: result.message, moved: true, strategy_used: 'overwrite', batch_id: batchId,
          file: { id: result.file_id, name: result.file_name, previous_version_saved: result.previous_version_saved, new_folder_id: target_folder_id || null }
        });
      }

      if (conflict_strategy === 'version') {
        const result = await handleVersion(file, conflict, target_folder_id, moved_by);
        await recordMoveHistory(batchId, moved_by, 'file', result.file_id, result.file_name, file.folder_id, target_folder_id);
        return res.json({
          message: result.message, moved: true, strategy_used: 'version', batch_id: batchId,
          file: { id: result.file_id, name: result.file_name, new_version_number: result.new_version_number, folder_id: target_folder_id || null }
        });
      }
    }

    // No conflict â€” normal move
    const previousFolderId = file.folder_id;

    await db.query(
      `UPDATE files SET folder_id = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`,
      [target_folder_id || null, moved_by, file_id]
    );

    await addActivityLog(moved_by, 'MOVE', 'FILE', file.id, file.file_name,
      `Moved from folder ${previousFolderId || 'root'} to folder ${target_folder_id || 'root'}`
    );

    await recordMoveHistory(batchId, moved_by, 'file', file.id, file.file_name, previousFolderId, target_folder_id);

    console.log(`âœ… File "${file.file_name}" moved successfully`);

    return res.json({
      message: 'File moved successfully', moved: true, batch_id: batchId,
      file: { id: file.id, name: file.file_name, previous_folder_id: previousFolderId || null, new_folder_id: target_folder_id || null }
    });

  } catch (err) {
    console.error('ðŸ’¥ Error moving single file:', err);
    return res.status(500).json({ error: 'Move failed: ' + err.message });
  }
});

// =============================================================
// ROUTE 2: Move Bulk
// POST /move/bulk
// Body: { file_ids, folder_ids, target_folder_id, moved_by, conflict_strategy }
// =============================================================
router.post('/bulk', async (req, res) => {
  console.log('\nðŸ“¦ ===== MOVE BULK =====');
  console.log('Body:', req.body);

  const { file_ids = [], folder_ids = [], target_folder_id, moved_by, conflict_strategy = 'ask' } = req.body;
  const batchId = uuidv4();

  try {
    if (!moved_by) return res.status(400).json({ error: 'moved_by is required' });
    if ((!file_ids || file_ids.length === 0) && (!folder_ids || folder_ids.length === 0)) {
      return res.status(400).json({ error: 'At least one file_id or folder_id is required' });
    }

    const userValid = await validateUser(moved_by);
    if (!userValid) return res.status(400).json({ error: 'Invalid moved_by user' });

    let targetFolderName = 'root';
    if (target_folder_id) {
      const [targetFolder] = await db.query('SELECT id, name FROM folders WHERE id = $1', [target_folder_id]);
      if (targetFolder.length === 0) return res.status(404).json({ error: 'Target folder not found' });
      targetFolderName = targetFolder[0].name;
    }

    // Pre-scan for conflicts if strategy is 'ask'
    if (conflict_strategy === 'ask') {
      const conflicts = [];
      for (const fileId of file_ids) {
        const [files] = await db.query('SELECT * FROM files WHERE id = $1', [fileId]);
        if (files.length === 0) continue;
        const conflict = await checkFileConflict(files[0].file_name, target_folder_id);
        if (conflict) {
          conflicts.push({ id: files[0].id, name: files[0].file_name, type: 'file', conflicting_id: conflict.id, conflicting_name: conflict.file_name });
        }
      }
      if (conflicts.length > 0) {
        return res.status(409).json({
          conflict: true,
          message: `${conflicts.length} conflict(s) found at the destination.`,
          conflicts,
          available_strategies: ['overwrite', 'version', 'skip'],
          hint: 'Resubmit with conflict_strategy set to overwrite, version, or skip â€” applied to all conflicts'
        });
      }
    }

    const results = { moved_files: [], moved_folders: [], skipped: [], conflicts: [], errors: [] };

    // Move Files
    for (const fileId of file_ids) {
      try {
        const [files] = await db.query('SELECT * FROM files WHERE id = $1', [fileId]);
        if (files.length === 0) { results.errors.push({ id: fileId, reason: 'File not found' }); continue; }

        const file = files[0];
        const currentFolderId = file.folder_id ? String(file.folder_id) : null;
        const targetFolderIdStr = target_folder_id ? String(target_folder_id) : null;

        if (currentFolderId === targetFolderIdStr) {
          results.skipped.push({ id: file.id, name: file.file_name, reason: 'Already in target location' });
          continue;
        }

        const conflict = await checkFileConflict(file.file_name, target_folder_id);

        if (conflict) {
          if (conflict_strategy === 'skip') {
            results.skipped.push({ id: file.id, name: file.file_name, reason: 'Conflict â€” skipped' });
            continue;
          }
          if (conflict_strategy === 'overwrite') {
            const r = await handleOverwrite(file, conflict, target_folder_id, moved_by);
            await recordMoveHistory(batchId, moved_by, 'file', r.file_id, r.file_name, file.folder_id, target_folder_id);
            results.moved_files.push({ id: r.file_id, name: r.file_name, strategy_used: 'overwrite', previous_version_saved: r.previous_version_saved, new_folder_id: target_folder_id || null });
            continue;
          }
          if (conflict_strategy === 'version') {
            const r = await handleVersion(file, conflict, target_folder_id, moved_by);
            await recordMoveHistory(batchId, moved_by, 'file', r.file_id, r.file_name, file.folder_id, target_folder_id);
            results.moved_files.push({ id: r.file_id, name: r.file_name, strategy_used: 'version', new_version_number: r.new_version_number, new_folder_id: target_folder_id || null });
            continue;
          }
          results.conflicts.push({ id: file.id, name: file.file_name, conflicting_file_id: conflict.id, strategy_used: 'needs_decision' });
          continue;
        }

        const previousFolderId = file.folder_id;
        await db.query(`UPDATE files SET folder_id = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`, [target_folder_id || null, moved_by, fileId]);
        await addActivityLog(moved_by, 'MOVE', 'FILE', file.id, file.file_name, `Bulk move â€” from folder ${previousFolderId || 'root'} to ${targetFolderName}`);
        await recordMoveHistory(batchId, moved_by, 'file', file.id, file.file_name, previousFolderId, target_folder_id);
        results.moved_files.push({ id: file.id, name: file.file_name, previous_folder_id: previousFolderId || null, new_folder_id: target_folder_id || null });

      } catch (fileErr) {
        console.error(`ðŸ’¥ Error moving file ${fileId}:`, fileErr);
        results.errors.push({ id: fileId, reason: fileErr.message });
      }
    }

    // Move Folders
    for (const folderId of folder_ids) {
      try {
        const [folders] = await db.query('SELECT * FROM folders WHERE id = $1', [folderId]);
        if (folders.length === 0) { results.errors.push({ id: folderId, reason: 'Folder not found' }); continue; }

        const folder = folders[0];

        if (String(folderId) === String(target_folder_id)) { results.errors.push({ id: folderId, name: folder.name, reason: 'Cannot move a folder into itself' }); continue; }

        const isCircular = await checkCircularReference(folderId, target_folder_id);
        if (isCircular) { results.errors.push({ id: folderId, name: folder.name, reason: 'Cannot move a folder into its own descendant' }); continue; }

        const contentDepth = await getFolderContentDepth(folderId);
        if (contentDepth > MAX_FOLDER_DEPTH) { results.errors.push({ id: folderId, name: folder.name, reason: `Folder contents exceed the maximum allowed depth of ${MAX_FOLDER_DEPTH} levels` }); continue; }

        const conflict = await checkFolderConflict(folder.name, target_folder_id);
        if (conflict) { results.conflicts.push({ id: folderId, name: folder.name, conflicting_folder_id: conflict.id, type: 'folder', strategy_used: conflict_strategy === 'skip' ? 'skipped' : 'needs_decision' }); continue; }

        const previousParentId = folder.parent_id;
        await db.query(`UPDATE folders SET parent_id = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`, [target_folder_id || null, moved_by, folderId]);
        await addActivityLog(moved_by, 'MOVE', 'FOLDER', folder.id, folder.name, `Bulk move â€” from parent ${previousParentId || 'root'} to ${targetFolderName}`);
        await recordMoveHistory(batchId, moved_by, 'folder', folder.id, folder.name, previousParentId, target_folder_id);
        results.moved_folders.push({ id: folder.id, name: folder.name, previous_parent_id: previousParentId || null, new_parent_id: target_folder_id || null });

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

    console.log('âœ… Bulk move completed:', summary);

    return res.json({
      message: `Bulk move completed: ${summary.total_moved} moved, ${summary.total_conflicts} conflicts, ${summary.total_errors} errors`,
      batch_id: batchId, results, summary
    });

  } catch (err) {
    console.error('ðŸ’¥ Error in bulk move:', err);
    return res.status(500).json({ error: 'Bulk move failed: ' + err.message });
  }
});

// =============================================================
// ROUTE 3: Move Mixed Selection
// POST /move/mixed
// Body: { items: [{ id, type }], target_folder_id, moved_by, conflict_strategy }
// =============================================================
router.post('/mixed', async (req, res) => {
  console.log('\nðŸ“¦ ===== MOVE MIXED SELECTION =====');
  console.log('Body:', req.body);

  const { items, target_folder_id, moved_by, conflict_strategy = 'ask' } = req.body;
  const batchId = uuidv4();

  try {
    if (!moved_by) return res.status(400).json({ error: 'moved_by is required' });
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required. Each item must have { id, type }' });
    }
    for (const item of items) {
      if (!item.id) return res.status(400).json({ error: 'Each item must have an id' });
      if (!item.type || !['file', 'folder'].includes(item.type)) {
        return res.status(400).json({ error: `Invalid type "${item.type}" for item ${item.id}` });
      }
    }

    const userValid = await validateUser(moved_by);
    if (!userValid) return res.status(400).json({ error: 'Invalid moved_by user' });

    let targetFolderName = 'root';
    if (target_folder_id) {
      const [targetFolder] = await db.query('SELECT id, name FROM folders WHERE id = $1', [target_folder_id]);
      if (targetFolder.length === 0) return res.status(404).json({ error: 'Target folder not found' });
      targetFolderName = targetFolder[0].name;
    }

    const file_ids = items.filter(i => i.type === 'file').map(i => i.id);
    const folder_ids = items.filter(i => i.type === 'folder').map(i => i.id);

    console.log(`ðŸ“Š Mixed selection â€” Files: ${file_ids.length}, Folders: ${folder_ids.length}`);

    // Pre-scan for conflicts if strategy is 'ask'
    if (conflict_strategy === 'ask') {
      const conflicts = [];
      for (const fileId of file_ids) {
        const [files] = await db.query('SELECT * FROM files WHERE id = $1', [fileId]);
        if (files.length === 0) continue;
        const conflict = await checkFileConflict(files[0].file_name, target_folder_id);
        if (conflict) {
          conflicts.push({ id: files[0].id, name: files[0].file_name, type: 'file', conflicting_id: conflict.id, conflicting_name: conflict.file_name });
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

    // Move Files
    for (const fileId of file_ids) {
      try {
        const [files] = await db.query('SELECT * FROM files WHERE id = $1', [fileId]);
        if (files.length === 0) { results.errors.push({ id: fileId, type: 'file', reason: 'File not found' }); continue; }

        const file = files[0];
        const currentFolderId = file.folder_id ? String(file.folder_id) : null;
        const targetFolderIdStr = target_folder_id ? String(target_folder_id) : null;

        if (currentFolderId === targetFolderIdStr) {
          results.skipped.push({ id: file.id, name: file.file_name, type: 'file', reason: 'Already in target location' });
          continue;
        }

        const conflict = await checkFileConflict(file.file_name, target_folder_id);

        if (conflict) {
          if (conflict_strategy === 'skip') { results.skipped.push({ id: file.id, name: file.file_name, type: 'file', reason: 'Conflict â€” skipped' }); continue; }
          if (conflict_strategy === 'overwrite') {
            const r = await handleOverwrite(file, conflict, target_folder_id, moved_by);
            await recordMoveHistory(batchId, moved_by, 'file', r.file_id, r.file_name, file.folder_id, target_folder_id);
            results.moved_files.push({ id: r.file_id, name: r.file_name, type: 'file', strategy_used: 'overwrite', previous_version_saved: r.previous_version_saved, new_folder_id: target_folder_id || null });
            continue;
          }
          if (conflict_strategy === 'version') {
            const r = await handleVersion(file, conflict, target_folder_id, moved_by);
            await recordMoveHistory(batchId, moved_by, 'file', r.file_id, r.file_name, file.folder_id, target_folder_id);
            results.moved_files.push({ id: r.file_id, name: r.file_name, type: 'file', strategy_used: 'version', new_version_number: r.new_version_number, new_folder_id: target_folder_id || null });
            continue;
          }
          results.conflicts.push({ id: file.id, name: file.file_name, type: 'file', conflicting_id: conflict.id, strategy_used: 'needs_decision' });
          continue;
        }

        const previousFolderId = file.folder_id;
        await db.query(`UPDATE files SET folder_id = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`, [target_folder_id || null, moved_by, fileId]);
        await addActivityLog(moved_by, 'MOVE', 'FILE', file.id, file.file_name, `Mixed move â€” from folder ${previousFolderId || 'root'} to ${targetFolderName}`);
        await recordMoveHistory(batchId, moved_by, 'file', file.id, file.file_name, previousFolderId, target_folder_id);
        results.moved_files.push({ id: file.id, name: file.file_name, type: 'file', previous_folder_id: previousFolderId || null, new_folder_id: target_folder_id || null });

      } catch (fileErr) {
        results.errors.push({ id: fileId, type: 'file', reason: fileErr.message });
      }
    }

    // Move Folders
    for (const folderId of folder_ids) {
      try {
        const [folders] = await db.query('SELECT * FROM folders WHERE id = $1', [folderId]);
        if (folders.length === 0) { results.errors.push({ id: folderId, type: 'folder', reason: 'Folder not found' }); continue; }

        const folder = folders[0];

        if (String(folderId) === String(target_folder_id)) { results.errors.push({ id: folderId, name: folder.name, type: 'folder', reason: 'Cannot move a folder into itself' }); continue; }

        const isCircular = await checkCircularReference(folderId, target_folder_id);
        if (isCircular) { results.errors.push({ id: folderId, name: folder.name, type: 'folder', reason: 'Cannot move a folder into its own descendant' }); continue; }

        const contentDepth = await getFolderContentDepth(folderId);
        if (contentDepth > MAX_FOLDER_DEPTH) { results.errors.push({ id: folderId, name: folder.name, type: 'folder', reason: `Folder contents exceed maximum depth of ${MAX_FOLDER_DEPTH}` }); continue; }

        const conflict = await checkFolderConflict(folder.name, target_folder_id);
        if (conflict) { results.conflicts.push({ id: folderId, name: folder.name, type: 'folder', conflicting_id: conflict.id, strategy_used: conflict_strategy === 'skip' ? 'skipped' : 'needs_decision' }); continue; }

        const previousParentId = folder.parent_id;
        await db.query(`UPDATE folders SET parent_id = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`, [target_folder_id || null, moved_by, folderId]);
        await addActivityLog(moved_by, 'MOVE', 'FOLDER', folder.id, folder.name, `Mixed move â€” from parent ${previousParentId || 'root'} to ${targetFolderName}`);
        await recordMoveHistory(batchId, moved_by, 'folder', folder.id, folder.name, previousParentId, target_folder_id);
        results.moved_folders.push({ id: folder.id, name: folder.name, type: 'folder', previous_parent_id: previousParentId || null, new_parent_id: target_folder_id || null });

      } catch (folderErr) {
        results.errors.push({ id: folderId, type: 'folder', reason: folderErr.message });
      }
    }

    const summary = {
      total_requested: items.length,
      total_moved: results.moved_files.length + results.moved_folders.length,
      files_moved: results.moved_files.length,
      folders_moved: results.moved_folders.length,
      total_conflicts: results.conflicts.length,
      total_skipped: results.skipped.length,
      total_errors: results.errors.length
    };

    console.log('âœ… Mixed move completed:', summary);

    return res.json({
      message: `Mixed move completed: ${summary.total_moved} moved, ${summary.total_conflicts} conflicts, ${summary.total_errors} errors`,
      batch_id: batchId, results, summary
    });

  } catch (err) {
    console.error('ðŸ’¥ Error in mixed move:', err);
    return res.status(500).json({ error: 'Mixed move failed: ' + err.message });
  }
});

// =============================================================
// ROUTE 4: Move Folder With All Its Contents
// POST /move/folder
// Body: { folder_id, target_folder_id, moved_by, conflict_strategy }
// =============================================================
router.post('/folder', async (req, res) => {
  console.log('\nðŸ“¦ ===== MOVE FOLDER WITH CONTENTS =====');
  console.log('Body:', req.body);

  const { folder_id, target_folder_id, moved_by, conflict_strategy = 'ask' } = req.body;
  const batchId = uuidv4();

  try {
    if (!folder_id) return res.status(400).json({ error: 'folder_id is required' });
    if (!moved_by) return res.status(400).json({ error: 'moved_by is required' });

    const userValid = await validateUser(moved_by);
    if (!userValid) return res.status(400).json({ error: 'Invalid moved_by user' });

    const [folders] = await db.query('SELECT * FROM folders WHERE id = $1', [folder_id]);
    if (folders.length === 0) return res.status(404).json({ error: 'Folder not found' });

    const folder = folders[0];

    if (String(folder_id) === String(target_folder_id)) return res.status(400).json({ error: 'Cannot move a folder into itself' });

    const isCircular = await checkCircularReference(folder_id, target_folder_id);
    if (isCircular) return res.status(400).json({ error: 'Cannot move a folder into its own descendant (circular reference)' });

    let targetFolderName = 'root';
    if (target_folder_id) {
      const [targetFolder] = await db.query('SELECT id, name FROM folders WHERE id = $1', [target_folder_id]);
      if (targetFolder.length === 0) return res.status(404).json({ error: 'Target folder not found' });
      targetFolderName = targetFolder[0].name;
    }

    const contentDepth = await getFolderContentDepth(folder_id);
    if (contentDepth > MAX_FOLDER_DEPTH) {
      return res.status(400).json({ error: `Folder contents are ${contentDepth} levels deep, max allowed is ${MAX_FOLDER_DEPTH}.`, content_depth: contentDepth, max_allowed: MAX_FOLDER_DEPTH });
    }

    const conflict = await checkFolderConflict(folder.name, target_folder_id);
    if (conflict) {
      if (conflict_strategy === 'ask') {
        return res.status(409).json({
          conflict: true,
          message: `A folder named "${folder.name}" already exists at the destination.`,
          folder: { id: folder.id, name: folder.name },
          conflicting_folder: { id: conflict.id, name: conflict.name },
          available_strategies: ['skip'],
          hint: 'Resubmit with conflict_strategy: skip or rename one folder first'
        });
      }
      if (conflict_strategy === 'skip') return res.json({ message: 'Folder move skipped due to conflict', skipped: true, folder: { id: folder.id, name: folder.name } });
    }

    const previousParentId = folder.parent_id;
    await db.query(`UPDATE folders SET parent_id = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`, [target_folder_id || null, moved_by, folder_id]);
    await addActivityLog(moved_by, 'MOVE', 'FOLDER', folder.id, folder.name, `Moved from parent ${previousParentId || 'root'} to ${targetFolderName} (with contents)`);
    await recordMoveHistory(batchId, moved_by, 'folder', folder.id, folder.name, previousParentId, target_folder_id);

    const [fileCount] = await db.query('SELECT COUNT(*) as count FROM files WHERE folder_id = $1', [folder_id]);
    const [subFolderCount] = await db.query('SELECT COUNT(*) as count FROM folders WHERE parent_id = $1', [folder_id]);

    console.log(`âœ… Folder "${folder.name}" moved successfully`);

    return res.json({
      message: `Folder "${folder.name}" moved successfully with all its contents`,
      moved: true, batch_id: batchId,
      folder: { id: folder.id, name: folder.name, previous_parent_id: previousParentId || null, new_parent_id: target_folder_id || null },
      contents_summary: { direct_files: fileCount[0].count, direct_subfolders: subFolderCount[0].count, depth_checked: contentDepth, max_depth_allowed: MAX_FOLDER_DEPTH, note: 'All nested contents moved with the folder automatically' }
    });

  } catch (err) {
    console.error('ðŸ’¥ Error moving folder with contents:', err);
    return res.status(500).json({ error: 'Folder move failed: ' + err.message });
  }
});

// =============================================================
// ROUTE 5: Get Move Preview
// GET /move/preview
// Query: { file_ids, folder_ids, target_folder_id }
// =============================================================
router.get('/preview', async (req, res) => {
  console.log('\nðŸ” ===== MOVE PREVIEW =====');
  const { file_ids, folder_ids, target_folder_id } = req.query;

  try {
    const fileIdList = file_ids ? (Array.isArray(file_ids) ? file_ids : [file_ids]) : [];
    const folderIdList = folder_ids ? (Array.isArray(folder_ids) ? folder_ids : [folder_ids]) : [];

    if (fileIdList.length === 0 && folderIdList.length === 0) {
      return res.status(400).json({ error: 'At least one file_id or folder_id is required' });
    }

    const preview = { can_move: [], conflicts: [], errors: [], warnings: [] };

    for (const fileId of fileIdList) {
      const [files] = await db.query('SELECT * FROM files WHERE id = $1', [fileId]);
      if (files.length === 0) { preview.errors.push({ id: fileId, type: 'file', reason: 'File not found' }); continue; }
      const file = files[0];
      const conflict = await checkFileConflict(file.file_name, target_folder_id);
      if (conflict) {
        preview.conflicts.push({ id: file.id, name: file.file_name, type: 'file', conflicting_id: conflict.id, message: `A file named "${file.file_name}" already exists at the destination`, available_strategies: ['overwrite', 'version', 'skip'] });
      } else {
        preview.can_move.push({ id: file.id, name: file.file_name, type: 'file' });
      }
    }

    for (const folderId of folderIdList) {
      const [folders] = await db.query('SELECT * FROM folders WHERE id = $1', [folderId]);
      if (folders.length === 0) { preview.errors.push({ id: folderId, type: 'folder', reason: 'Folder not found' }); continue; }
      const folder = folders[0];
      const isCircular = await checkCircularReference(folderId, target_folder_id);
      if (isCircular || String(folderId) === String(target_folder_id)) { preview.errors.push({ id: folderId, name: folder.name, type: 'folder', reason: 'Circular reference' }); continue; }
      const contentDepth = await getFolderContentDepth(folderId);
      if (contentDepth > MAX_FOLDER_DEPTH) { preview.warnings.push({ id: folderId, name: folder.name, type: 'folder', reason: `Folder is ${contentDepth} levels deep (max: ${MAX_FOLDER_DEPTH})` }); continue; }
      const conflict = await checkFolderConflict(folder.name, target_folder_id);
      if (conflict) {
        preview.conflicts.push({ id: folder.id, name: folder.name, type: 'folder', conflicting_id: conflict.id, message: `A folder named "${folder.name}" already exists at the destination`, available_strategies: ['skip'] });
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
    console.error('ðŸ’¥ Error generating move preview:', err);
    return res.status(500).json({ error: 'Preview failed: ' + err.message });
  }
});

// =============================================================
// PHASE 2 ROUTE: Get File Version History
// GET /move/versions/:fileId
// =============================================================
router.get('/versions/:fileId', async (req, res) => {
  console.log('\nðŸ“‹ ===== GET FILE VERSION HISTORY =====');
  const { fileId } = req.params;

  try {
    const [files] = await db.query(
      `SELECT f.*, fo.name AS folder_name FROM files f LEFT JOIN folders fo ON f.folder_id = fo.id WHERE f.id = $1`,
      [fileId]
    );
    if (files.length === 0) return res.status(404).json({ error: 'File not found' });

    const currentFile = files[0];

    const [versions] = await db.query(
      `SELECT fv.*, u.name AS created_by_name, fo.name AS moved_from_folder_name
       FROM file_versions fv
       LEFT JOIN users u ON fv.created_by = u.id
       LEFT JOIN folders fo ON fv.moved_from_folder_id = fo.id
       WHERE fv.file_id = $1
       ORDER BY fv.version_number DESC`,
      [fileId]
    );

    return res.json({
      message: `Version history for "${currentFile.file_name}"`,
      current_file: {
        id: currentFile.id, name: currentFile.file_name, size: currentFile.file_size,
        type: currentFile.file_type, folder: currentFile.folder_name || 'root', updated_at: currentFile.updated_at
      },
      versions: versions.map(v => ({
        id: v.id, version_number: v.version_number, file_name: v.file_name,
        file_size: v.file_size, file_type: v.file_type, moved_from_folder: v.moved_from_folder_name || 'root',
        saved_by: v.created_by_name, saved_at: v.created_at, notes: v.notes
      })),
      total_versions: versions.length
    });

  } catch (err) {
    console.error('ðŸ’¥ Error getting version history:', err);
    return res.status(500).json({ error: 'Failed to get version history: ' + err.message });
  }
});

// =============================================================
// PHASE 3 ROUTE 1: Download a Specific Version
// GET /move/versions/:fileId/download/:versionId
// =============================================================
router.get('/versions/:fileId/download/:versionId', async (req, res) => {
  console.log('\nâ¬‡ï¸ ===== DOWNLOAD VERSION =====');
  const { fileId, versionId } = req.params;
  const { user_id } = req.query;

  try {
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    const userValid = await validateUser(user_id);
    if (!userValid) return res.status(400).json({ error: 'Invalid user' });

    const [files] = await db.query('SELECT * FROM files WHERE id = $1', [fileId]);
    if (files.length === 0) return res.status(404).json({ error: 'File not found' });
    const currentFile = files[0];

    const [versions] = await db.query('SELECT * FROM file_versions WHERE id = $1 AND file_id = $2', [versionId, fileId]);
    if (versions.length === 0) return res.status(404).json({ error: 'Version not found' });
    const version = versions[0];

    let filePath = version.file_path;
    let fileExists = false;

    const pathVariations = [
      version.file_path, path.resolve(version.file_path),
      path.join(process.cwd(), version.file_path),
      path.join(process.cwd(), 'uploads', path.basename(version.file_path)),
      path.join(__dirname, '..', version.file_path),
      path.join(__dirname, '../uploads', path.basename(version.file_path))
    ];

    for (const testPath of pathVariations) {
      if (fs.existsSync(testPath)) { filePath = testPath; fileExists = true; break; }
    }

    if (!fileExists) return res.status(404).json({ error: 'Version file not found on disk', version_id: versionId, stored_path: version.file_path });

    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.includes('uploads')) return res.status(403).json({ error: 'Invalid file location' });

    await addActivityLog(user_id, 'DOWNLOAD', 'FILE', currentFile.id, currentFile.file_name,
      JSON.stringify({ action: 'version_download', version_id: versionId, version_number: version.version_number })
    );

    const downloadName = `${path.parse(currentFile.file_name).name}_v${version.version_number}${path.extname(currentFile.file_name)}`;

    console.log(`âœ… Serving version ${version.version_number} as "${downloadName}"`);

    res.download(filePath, downloadName, (err) => {
      if (err) { console.error('ðŸ’¥ Error during version download:', err); if (!res.headersSent) res.status(500).json({ error: 'Download failed' }); }
    });

  } catch (err) {
    console.error('ðŸ’¥ Error downloading version:', err);
    return res.status(500).json({ error: 'Version download failed: ' + err.message });
  }
});

// =============================================================
// PHASE 3 ROUTE 2: Restore a Previous Version
// POST /move/versions/:fileId/restore/:versionId
// Body: { restored_by }
// =============================================================
router.post('/versions/:fileId/restore/:versionId', async (req, res) => {
  console.log('\nðŸ”„ ===== RESTORE VERSION =====');
  const { fileId, versionId } = req.params;
  const { restored_by } = req.body;

  try {
    if (!restored_by) return res.status(400).json({ error: 'restored_by is required' });

    const userValid = await validateUser(restored_by);
    if (!userValid) return res.status(400).json({ error: 'Invalid restored_by user' });

    const [files] = await db.query('SELECT * FROM files WHERE id = $1', [fileId]);
    if (files.length === 0) return res.status(404).json({ error: 'File not found' });
    const currentFile = files[0];

    const [versions] = await db.query('SELECT * FROM file_versions WHERE id = $1 AND file_id = $2', [versionId, fileId]);
    if (versions.length === 0) return res.status(404).json({ error: 'Version not found' });
    const versionToRestore = versions[0];

    // Verify version physical file exists before doing anything
    let versionFilePath = versionToRestore.file_path;
    let versionFileExists = false;

    const pathVariations = [
      versionToRestore.file_path, path.resolve(versionToRestore.file_path),
      path.join(process.cwd(), versionToRestore.file_path),
      path.join(process.cwd(), 'uploads', path.basename(versionToRestore.file_path)),
      path.join(__dirname, '..', versionToRestore.file_path),
      path.join(__dirname, '../uploads', path.basename(versionToRestore.file_path))
    ];

    for (const testPath of pathVariations) {
      if (fs.existsSync(testPath)) { versionFilePath = testPath; versionFileExists = true; break; }
    }

    if (!versionFileExists) {
      return res.status(404).json({ error: 'Version file not found on disk â€” cannot restore', version_id: versionId, stored_path: versionToRestore.file_path });
    }

    // Step 1: Snapshot current file before overwriting
    const snapshotVersionNumber = await snapshotFileAsVersion(currentFile, restored_by,
      `Auto-snapshot before restoring version ${versionToRestore.version_number}`
    );

    console.log(`ðŸ“¸ Current file snapshotted as version ${snapshotVersionNumber} before restore`);

    // Step 2: Update current file with version content â€” name stays the same (name = identity)
    await db.query(
      `UPDATE files SET file_path = $1, file_size = $2, file_type = $3, updated_by = $4, updated_at = NOW() WHERE id = $5`,
      [versionToRestore.file_path, versionToRestore.file_size, versionToRestore.file_type, restored_by, fileId]
    );

    // Step 3: Remove restored version from file_versions â€” it is now the live file
    await db.query('DELETE FROM file_versions WHERE id = $1', [versionId]);

    await addActivityLog(restored_by, 'RESTORE', 'FILE', currentFile.id, currentFile.file_name,
      JSON.stringify({ action: 'version_restore', restored_version_id: versionId, restored_version_number: versionToRestore.version_number, previous_state_saved_as_version: snapshotVersionNumber })
    );

    return res.json({
      message: `Version ${versionToRestore.version_number} restored successfully. Previous state saved as version ${snapshotVersionNumber}.`,
      restored: true,
      file: { id: currentFile.id, name: currentFile.file_name, restored_from_version: versionToRestore.version_number, previous_state_saved_as_version: snapshotVersionNumber, folder_id: currentFile.folder_id || null }
    });

  } catch (err) {
    console.error('ðŸ’¥ Error restoring version:', err);
    return res.status(500).json({ error: 'Version restore failed: ' + err.message });
  }
});

// =============================================================
// PHASE 3 ROUTE 3: Delete a Specific Version
// DELETE /move/versions/:fileId/version/:versionId
// Body: { deleted_by }
// =============================================================
router.delete('/versions/:fileId/version/:versionId', async (req, res) => {
  console.log('\nðŸ—‘ï¸ ===== DELETE VERSION =====');
  const { fileId, versionId } = req.params;
  const { deleted_by } = req.body;

  try {
    if (!deleted_by) return res.status(400).json({ error: 'deleted_by is required' });

    const userValid = await validateUser(deleted_by);
    if (!userValid) return res.status(400).json({ error: 'Invalid deleted_by user' });

    const [files] = await db.query('SELECT * FROM files WHERE id = $1', [fileId]);
    if (files.length === 0) return res.status(404).json({ error: 'File not found' });
    const currentFile = files[0];

    const [versions] = await db.query('SELECT * FROM file_versions WHERE id = $1 AND file_id = $2', [versionId, fileId]);
    if (versions.length === 0) return res.status(404).json({ error: 'Version not found' });
    const version = versions[0];

    const [versionCount] = await db.query('SELECT COUNT(*) as count FROM file_versions WHERE file_id = $1', [fileId]);

    // Delete DB record
    await db.query('DELETE FROM file_versions WHERE id = $1', [versionId]);
    console.log(`ðŸ—‘ï¸ Version ${version.version_number} DB record deleted`);

    // Delete physical file â€” but ONLY if path differs from current live file
    let physicalFileDeleted = false;
    const versionPathNormalized = path.resolve(version.file_path);
    const currentPathNormalized = path.resolve(currentFile.file_path);

    if (versionPathNormalized === currentPathNormalized) {
      console.log('âš ï¸ Version file path matches current live file â€” skipping physical delete');
    } else {
      const pathVariations = [
        version.file_path, path.resolve(version.file_path),
        path.join(process.cwd(), version.file_path),
        path.join(process.cwd(), 'uploads', path.basename(version.file_path)),
        path.join(__dirname, '..', version.file_path),
        path.join(__dirname, '../uploads', path.basename(version.file_path))
      ];
      for (const testPath of pathVariations) {
        if (fs.existsSync(testPath)) {
          try { fs.unlinkSync(testPath); physicalFileDeleted = true; console.log(`ðŸ—‘ï¸ Physical version file deleted: ${testPath}`); } catch (e) { console.error('âš ï¸ Could not delete physical version file:', e.message); }
          break;
        }
      }
      if (!physicalFileDeleted) console.log('âš ï¸ Physical version file not found on disk â€” only DB record deleted');
    }

    await addActivityLog(deleted_by, 'DELETE', 'FILE', currentFile.id, currentFile.file_name,
      JSON.stringify({ action: 'version_delete', deleted_version_id: versionId, deleted_version_number: version.version_number, physical_file_deleted: physicalFileDeleted })
    );

    return res.json({
      message: `Version ${version.version_number} deleted successfully.`,
      deleted: true,
      version: { id: version.id, version_number: version.version_number, file_name: version.file_name },
      physical_file_deleted: physicalFileDeleted,
      remaining_versions: versionCount[0].count - 1
    });

  } catch (err) {
    console.error('ðŸ’¥ Error deleting version:', err);
    return res.status(500).json({ error: 'Version delete failed: ' + err.message });
  }
});

// =============================================================
// PHASE 3 ROUTE 4: Compare Two Versions
// GET /move/versions/:fileId/compare?v1=1&v2=2
// Use v1=current or v2=current to compare against the live file
// =============================================================
router.get('/versions/:fileId/compare', async (req, res) => {
  console.log('\nðŸ” ===== COMPARE VERSIONS =====');
  const { fileId } = req.params;
  const { v1, v2 } = req.query;

  try {
    if (!v1 || !v2) return res.status(400).json({ error: 'v1 and v2 query params are required. Use version_number values or "current"' });

    const [files] = await db.query(
      `SELECT f.*, u.name AS updated_by_name, fo.name AS folder_name FROM files f LEFT JOIN users u ON f.updated_by = u.id LEFT JOIN folders fo ON f.folder_id = fo.id WHERE f.id = $1`,
      [fileId]
    );
    if (files.length === 0) return res.status(404).json({ error: 'File not found' });
    const currentFile = files[0];

    async function getVersionData(versionRef) {
      if (String(versionRef).toLowerCase() === 'current') {
        return { label: 'Current (live)', version_number: 'current', file_name: currentFile.file_name, file_size: currentFile.file_size, file_type: currentFile.file_type, folder: currentFile.folder_name || 'root', saved_by: currentFile.updated_by_name || 'unknown', saved_at: currentFile.updated_at, notes: 'Live file' };
      }
      const [rows] = await db.query(
        `SELECT fv.*, u.name AS created_by_name, fo.name AS moved_from_folder_name FROM file_versions fv LEFT JOIN users u ON fv.created_by = u.id LEFT JOIN folders fo ON fv.moved_from_folder_id = fo.id WHERE fv.file_id = $1 AND fv.version_number = $2`,
        [fileId, versionRef]
      );
      if (rows.length === 0) return null;
      const v = rows[0];
      return { label: `Version ${v.version_number}`, version_number: v.version_number, file_name: v.file_name, file_size: v.file_size, file_type: v.file_type, folder: v.moved_from_folder_name || 'root', saved_by: v.created_by_name || 'unknown', saved_at: v.created_at, notes: v.notes };
    }

    const version1 = await getVersionData(v1);
    const version2 = await getVersionData(v2);

    if (!version1) return res.status(404).json({ error: `Version ${v1} not found` });
    if (!version2) return res.status(404).json({ error: `Version ${v2} not found` });

    const diff = {
      file_size_changed: version1.file_size !== version2.file_size,
      file_type_changed: version1.file_type !== version2.file_type,
      file_name_changed: version1.file_name !== version2.file_name,
      size_difference_bytes: (version2.file_size || 0) - (version1.file_size || 0),
      size_difference_label: formatSizeDiff((version2.file_size || 0) - (version1.file_size || 0))
    };

    return res.json({
      message: `Comparing ${version1.label} vs ${version2.label} for "${currentFile.file_name}"`,
      file: { id: currentFile.id, name: currentFile.file_name },
      version_1: version1, version_2: version2, diff
    });

  } catch (err) {
    console.error('ðŸ’¥ Error comparing versions:', err);
    return res.status(500).json({ error: 'Version compare failed: ' + err.message });
  }
});

// =============================================================
// PHASE 5 ROUTE 1: Get Move History
// GET /move/history?user_id=1
// Returns last 10 move batches grouped by batch_id
// Shows whether each batch is still undoable (within 24 hours)
// =============================================================
router.get('/history', async (req, res) => {
  console.log('\nðŸ“œ ===== GET MOVE HISTORY =====');
  const { user_id } = req.query;

  try {
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    const userValid = await validateUser(user_id);
    if (!userValid) return res.status(400).json({ error: 'Invalid user' });

    const [batches] = await db.query(
      `SELECT batch_id, MIN(moved_at) as moved_at, COUNT(*) as item_count,
              MAX(undone) as undone, MAX(undone_at) as undone_at
       FROM move_history
       WHERE user_id = $1
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
        'SELECT * FROM move_history WHERE batch_id = $1 ORDER BY id ASC',
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
          const [f] = await db.query('SELECT name FROM folders WHERE id = $1', [item.from_folder_id]);
          if (f.length > 0) fromFolderName = f[0].name;
        }
        if (item.to_folder_id) {
          const [f] = await db.query('SELECT name FROM folders WHERE id = $1', [item.to_folder_id]);
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

    return res.json({ message: 'Move history retrieved', history, total: history.length, undo_window: `${UNDO_EXPIRY_HOURS} hours` });

  } catch (err) {
    console.error('ðŸ’¥ Error getting move history:', err);
    return res.status(500).json({ error: 'Failed to get move history: ' + err.message });
  }
});

// =============================================================
// PHASE 5 ROUTE 2: Get Single Batch Detail
// GET /move/history/:batchId?user_id=1
// =============================================================
router.get('/history/:batchId', async (req, res) => {
  console.log('\nðŸ“œ ===== GET BATCH DETAIL =====');
  const { batchId } = req.params;
  const { user_id } = req.query;

  try {
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    const [items] = await db.query(
      `SELECT mh.*, u.name AS user_name FROM move_history mh LEFT JOIN users u ON mh.user_id = u.id WHERE mh.batch_id = $1 AND mh.user_id = $2 ORDER BY mh.id ASC`,
      [batchId, user_id]
    );

    if (items.length === 0) return res.status(404).json({ error: 'Batch not found or does not belong to this user' });

    const now = new Date();
    const movedAt = new Date(items[0].moved_at);
    const hoursElapsed = (now - movedAt) / (1000 * 60 * 60);
    const isExpired = hoursElapsed > UNDO_EXPIRY_HOURS;
    const isUndone = items[0].undone === 1;
    const canUndo = !isExpired && !isUndone;

    const formattedItems = [];
    for (const item of items) {
      let fromFolderName = 'root';
      let toFolderName = 'root';
      if (item.from_folder_id) {
        const [f] = await db.query('SELECT name FROM folders WHERE id = $1', [item.from_folder_id]);
        if (f.length > 0) fromFolderName = f[0].name;
      }
      if (item.to_folder_id) {
        const [f] = await db.query('SELECT name FROM folders WHERE id = $1', [item.to_folder_id]);
        if (f.length > 0) toFolderName = f[0].name;
      }
      formattedItems.push({
        id: item.id, item_type: item.item_type, item_id: item.item_id,
        item_name: item.item_name, from_folder: fromFolderName,
        from_folder_id: item.from_folder_id, to_folder: toFolderName,
        to_folder_id: item.to_folder_id, moved_at: item.moved_at
      });
    }

    return res.json({
      batch_id: batchId, moved_by: items[0].user_name, moved_at: items[0].moved_at,
      item_count: items.length, items: formattedItems,
      can_undo: canUndo, undone: isUndone, undone_at: items[0].undone_at || null,
      reason_cannot_undo: !canUndo ? (isUndone ? 'Already undone' : 'Undo window has expired (24 hours)') : null
    });

  } catch (err) {
    console.error('ðŸ’¥ Error getting batch detail:', err);
    return res.status(500).json({ error: 'Failed to get batch detail: ' + err.message });
  }
});

// =============================================================
// PHASE 5 ROUTE 3: Undo a Move Batch
// POST /move/undo/:batchId
// Body: { user_id }
// Reverses every item in the batch back to its original location
// =============================================================
router.post('/undo/:batchId', async (req, res) => {
  console.log('\nâ†©ï¸ ===== UNDO MOVE BATCH =====');
  const { batchId } = req.params;
  const { user_id } = req.body;

  try {
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    const userValid = await validateUser(user_id);
    if (!userValid) return res.status(400).json({ error: 'Invalid user' });

    const [items] = await db.query(
      'SELECT * FROM move_history WHERE batch_id = $1 AND user_id = $2 ORDER BY id ASC',
      [batchId, user_id]
    );

    if (items.length === 0) return res.status(404).json({ error: 'Batch not found or does not belong to this user' });

    // Check if already undone
    if (items[0].undone === 1) {
      return res.status(400).json({ error: 'This move has already been undone', undone_at: items[0].undone_at });
    }

    // Check if expired
    const now = new Date();
    const movedAt = new Date(items[0].moved_at);
    const hoursElapsed = (now - movedAt) / (1000 * 60 * 60);

    if (hoursElapsed > UNDO_EXPIRY_HOURS) {
      return res.status(400).json({
        error: `Undo window has expired. Moves can only be undone within ${UNDO_EXPIRY_HOURS} hours.`,
        moved_at: items[0].moved_at,
        hours_elapsed: hoursElapsed.toFixed(1),
        undo_window: `${UNDO_EXPIRY_HOURS} hours`
      });
    }

    const results = { undone: [], failed: [], not_found: [] };

    // Process in reverse order â€” important for nested folders
    const reversedItems = [...items].reverse();

    for (const item of reversedItems) {
      try {
        if (item.item_type === 'file') {
          const [fileCheck] = await db.query('SELECT id FROM files WHERE id = $1', [item.item_id]);
          if (fileCheck.length === 0) {
            results.not_found.push({ item_type: 'file', item_id: item.item_id, item_name: item.item_name, reason: 'File no longer exists â€” may have been deleted after the move' });
            continue;
          }
          await db.query(`UPDATE files SET folder_id = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`, [item.from_folder_id || null, user_id, item.item_id]);
          await addActivityLog(user_id, 'MOVE', 'FILE', item.item_id, item.item_name,
            JSON.stringify({ action: 'undo_move', batch_id: batchId, restored_to_folder: item.from_folder_id || 'root' })
          );
          results.undone.push({ item_type: 'file', item_id: item.item_id, item_name: item.item_name, restored_to_folder_id: item.from_folder_id || null });

        } else if (item.item_type === 'folder') {
          const [folderCheck] = await db.query('SELECT id FROM folders WHERE id = $1', [item.item_id]);
          if (folderCheck.length === 0) {
            results.not_found.push({ item_type: 'folder', item_id: item.item_id, item_name: item.item_name, reason: 'Folder no longer exists â€” may have been deleted after the move' });
            continue;
          }
          await db.query(`UPDATE folders SET parent_id = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`, [item.from_folder_id || null, user_id, item.item_id]);
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

    // Mark entire batch as undone
    await db.query(`UPDATE move_history SET undone = 1, undone_at = NOW() WHERE batch_id = $1`, [batchId]);

    const summary = {
      total_items: items.length,
      total_undone: results.undone.length,
      total_not_found: results.not_found.length,
      total_failed: results.failed.length
    };

    console.log('âœ… Undo completed:', summary);

    return res.json({
      message: `Undo completed: ${summary.total_undone} restored, ${summary.total_not_found} not found, ${summary.total_failed} failed`,
      batch_id: batchId, results, summary
    });

  } catch (err) {
    console.error('ðŸ’¥ Error undoing batch:', err);
    return res.status(500).json({ error: 'Undo failed: ' + err.message });
  }
});

module.exports = router;
