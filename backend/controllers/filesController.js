//filesController.js
const path = require('path');
const fs = require('fs');

// Import all password managers
const pdfPasswordManager = require('../utils/passwordManager');
const wordPasswordManager = require('../utils/wordPasswordManager');
const excelPasswordManager = require('../utils/excelPasswordManager');

/**
 * Download file with password protection
 * Route: GET /api/files/download/:fileId
 */
async function downloadProtectedFile(req, res) {
  try {
    const { fileId } = req.params;
    const userId = req.user.id; // From auth middleware

    console.log(`\n📥 Download request for file: ${fileId}`);
    console.log(`   User ID: ${userId}`);

    // Get file info from database
    const file = await getFileFromDatabase(fileId);
    console.log(`   Database query result:`, file);
    
    if (!file) {
      console.error(`❌ File not found in database: ${fileId}`);
      return res.status(404).json({ error: 'File not found' });
    }

    console.log(`   File found:`, file.file_name);

    // Check if user has permission
    if (file.user_id !== userId && !req.user.isAdmin) {
      console.error(`❌ Access denied for user ${userId}`);
      return res.status(403).json({ error: 'Access denied' });
    }

    const originalFilePath = path.join(__dirname, '../uploads', file.file_path);
    const fileExt = path.extname(file.file_name).toLowerCase();
    
    console.log(`   Original path: ${originalFilePath}`);
    console.log(`   File extension: ${fileExt}`);
    
    // Check if file exists
    if (!fs.existsSync(originalFilePath)) {
      console.error(`❌ Original file does not exist: ${originalFilePath}`);
      return res.status(404).json({ error: 'Source file not found on server' });
    }
    console.log(`   ✅ Original file exists`);
    
    // Temporary protected file path
    const protectedFileName = `protected_${Date.now()}_${file.file_name}`;
    const protectedFilePath = path.join(__dirname, '../temp', protectedFileName);

    console.log(`   Protected temp path: ${protectedFilePath}`);

    // Generate password based on file type
    let password;
    let passwordManager;

    console.log(`\n🔐 Applying protection for: ${fileExt}`);

    switch (fileExt) {
      case '.pdf':
        passwordManager = pdfPasswordManager;
        password = passwordManager.generateFixedPassword(fileId);
        
        // Apply PDF restrictions (your existing qpdf logic)
        await applyPDFRestrictions(originalFilePath, protectedFilePath, password);
        break;

      case '.docx':
      case '.doc':
        passwordManager = wordPasswordManager;
        password = passwordManager.generateFixedPassword(fileId);
        
        // Apply Word protection
        await passwordManager.protectWordDocument(
          originalFilePath,
          protectedFilePath,
          password
        );
        break;

      case '.xlsx':
      case '.xls':
        passwordManager = excelPasswordManager;
        password = passwordManager.generateFixedPassword(fileId);
        
        console.log(`   Password generated: ${password}`);
        console.log(`   Starting Excel protection...`);
        
        // If XLS file, change output extension to XLSX (since we convert during protection)
        let finalProtectedPath = protectedFilePath;
        if (fileExt === '.xls') {
          finalProtectedPath = protectedFilePath.replace(/\.xls$/, '.xlsx');
          console.log(`   🔄 XLS will be converted to XLSX`);
          console.log(`   Output will be: ${finalProtectedPath}`);
        }
        
        try {
          // Apply Excel protection
          await passwordManager.protectExcelDocument(
            originalFilePath,
            finalProtectedPath,
            password
          );
          console.log(`   ✅ Excel protection completed`);
          
          // Update the path for download
          protectedFilePath = finalProtectedPath;
        } catch (protectErr) {
          console.error(`   ❌ Excel protection error:`, protectErr.message);
          console.error(`   Stack:`, protectErr.stack);
          throw protectErr;
        }
        break;

      default:
        // No protection for other file types
        return res.download(originalFilePath, file.file_name);
    }

    // Save password info to JSON
    passwordManager.savePassword(
      fileId,
      file.file_name,
      password,
      userId
    );

    // Increment download count
    passwordManager.incrementDownloadCount(fileId);

    console.log(`\n📦 Sending file to client...`);
    console.log(`   File: ${file.file_name}`);

    // Determine the filename to send
    // If XLS was converted to XLSX, update the filename
    let downloadFileName = file.file_name;
    if (path.extname(file.file_name).toLowerCase() === '.xls') {
      downloadFileName = file.file_name.replace(/\.xls$/, '.xlsx');
      console.log(`   📝 Filename changed: ${file.file_name} → ${downloadFileName}`);
    }

    // Send protected file
    res.download(protectedFilePath, downloadFileName, (err) => {
      console.log(`\n🧹 Download completed, cleaning up...`);
      
      // Cleanup temp file after download
      if (fs.existsSync(protectedFilePath)) {
        fs.unlinkSync(protectedFilePath);
        console.log(`   ✅ Cleaned up: ${protectedFileName}`);
      }

      if (err) {
        console.error('❌ Download error:', err);
      } else {
        console.log(`   ✅ File sent successfully`);
      }
    });

  } catch (error) {
    console.error('\n❌ DOWNLOAD ERROR:', error.message);
    console.error('Stack trace:', error.stack);
    
    res.status(500).json({ 
      error: 'Failed to download file',
      message: error.message,
      details: error.stack
    });
  }
}

/**
 * Get password info for a file (admin only)
 * Route: GET /api/files/:fileId/password
 */
async function getFilePassword(req, res) {
  try {
    const { fileId } = req.params;

    // Check admin permission
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get file info from database
    const file = await getFileFromDatabase(fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const fileExt = path.extname(file.file_name).toLowerCase();
    let passwordData;

    // Get password based on file type
    switch (fileExt) {
      case '.pdf':
        passwordData = pdfPasswordManager.getPassword(fileId);
        break;
      case '.docx':
      case '.doc':
        passwordData = wordPasswordManager.getPassword(fileId);
        break;
      case '.xlsx':
      case '.xls':
        passwordData = excelPasswordManager.getPassword(fileId);
        break;
      default:
        return res.json({ message: 'File type does not have password protection' });
    }

    if (!passwordData) {
      return res.status(404).json({ error: 'Password not found' });
    }

    res.json(passwordData);

  } catch (error) {
    console.error('❌ Error getting password:', error);
    res.status(500).json({ error: 'Failed to retrieve password' });
  }
}

/**
 * Delete file and its password
 * Route: DELETE /api/files/:fileId
 */
async function deleteFile(req, res) {
  try {
    const { fileId } = req.params;
    const userId = req.user.id;

    const file = await getFileFromDatabase(fileId);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check permission
    if (file.user_id !== userId && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete physical file
    const filePath = path.join(__dirname, '../uploads', file.file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️  Deleted file: ${file.file_name}`);
    }

    // Delete password based on file type
    const fileExt = path.extname(file.file_name).toLowerCase();
    switch (fileExt) {
      case '.pdf':
        pdfPasswordManager.deletePassword(fileId);
        break;
      case '.docx':
      case '.doc':
        wordPasswordManager.deletePassword(fileId);
        break;
      case '.xlsx':
      case '.xls':
        excelPasswordManager.deletePassword(fileId);
        break;
    }

    // Delete from database
    await deleteFileFromDatabase(fileId);

    res.json({ message: 'File deleted successfully' });

  } catch (error) {
    console.error('❌ Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
}

/**
 * Get password statistics (admin only)
 * Route: GET /api/admin/password-stats
 */
function getPasswordStatistics(req, res) {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const stats = {
      pdf: pdfPasswordManager.getStatistics(),
      word: wordPasswordManager.getStatistics(),
      excel: excelPasswordManager.getStatistics()
    };

    res.json(stats);

  } catch (error) {
    console.error('❌ Error getting statistics:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
}

/**
 * Get Excel protection status
 * Route: GET /api/files/:fileId/protection-status
 */
async function getProtectionStatus(req, res) {
  try {
    const { fileId } = req.params;
    const userId = req.user.id;

    const file = await getFileFromDatabase(fileId);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check permission
    if (file.user_id !== userId && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const fileExt = path.extname(file.file_name).toLowerCase();
    const originalFilePath = path.join(__dirname, '../uploads', file.file_path);

    let isProtected = false;

    switch (fileExt) {
      case '.xlsx':
      case '.xls':
        isProtected = await excelPasswordManager.isPasswordProtected(originalFilePath);
        break;
      // Add similar checks for other file types if needed
    }

    res.json({
      file_id: fileId,
      file_name: file.file_name,
      file_type: fileExt,
      is_protected: isProtected,
      password: 'nscsl',
      protection_type: 'READ-ONLY'
    });

  } catch (error) {
    console.error('❌ Error checking protection status:', error);
    res.status(500).json({ error: 'Failed to check protection status' });
  }
}

// Placeholder functions (implement based on your database)
async function getFileFromDatabase(fileId) {
  // Your database query here
  // Example: return await inhouseDb.query('SELECT * FROM files WHERE id = ?', [fileId]);
}

async function deleteFileFromDatabase(fileId) {
  // Your database delete query here
  // Example: return await inhouseDb.query('DELETE FROM files WHERE id = ?', [fileId]);
}

async function applyPDFRestrictions(inputPath, outputPath, password) {
  // Your existing qpdf logic here
}

module.exports = {
  downloadProtectedFile,
  getFilePassword,
  deleteFile,
  getPasswordStatistics,
  getProtectionStatus
};