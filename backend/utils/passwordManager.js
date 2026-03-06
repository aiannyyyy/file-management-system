// ================== passwordManager.js ==================
// Location: /utils/passwordManager.js or /helpers/passwordManager.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class PDFPasswordManager {
  constructor() {
    // Configure directories
    this.tempDir = path.join(__dirname, '../temp');
    this.passwordsDir = path.join(this.tempDir, 'pdf_passwords');
    this.ensureDirectories();
  }

  /**
   * Ensure required directories exist
   */
  ensureDirectories() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
      console.log('📁 Created temp directory');
    }
    if (!fs.existsSync(this.passwordsDir)) {
      fs.mkdirSync(this.passwordsDir, { recursive: true });
      console.log('📁 Created passwords directory');
    }
  }

  /**
   * Generate a strong random password (64 characters)
   * Use this for maximum security - each file gets unique password
   * @returns {string} Strong random password
   */
  generateStrongPassword() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate a fixed password based on file ID (reproducible)
   * Use this if you need to recreate the same password for a file
   * @param {number} fileId - File ID
   * @param {string} secret - Secret key (store in .env)
   * @returns {string} Fixed password for this file
   */
  generateFixedPassword(fileId, secret = process.env.PDF_SECRET_KEY || 'DEFAULT_SECRET_CHANGE_ME') {
    return crypto
      .createHmac('sha256', secret)
      .update(`file_${fileId}_secure`)
      .digest('hex');
  }

  /**
   * Save password to file
   * @param {number} fileId - File ID
   * @param {string} fileName - Original file name
   * @param {string} ownerPassword - Owner password
   * @param {number} userId - User ID who uploaded
   * @returns {boolean} Success status
   */
  savePassword(fileId, fileName, ownerPassword, userId) {
    try {
      const passwordFile = path.join(this.passwordsDir, `file_${fileId}.json`);
      
      const data = {
        file_id: fileId,
        file_name: fileName,
        owner_password: ownerPassword,
        user_id: userId,
        created_at: new Date().toISOString(),
        note: 'Owner password for removing PDF restrictions. DO NOT SHARE.',
        restrictions_applied: {
          editing: 'disabled',
          copying: 'disabled',
          annotations: 'disabled',
          form_filling: 'disabled',
          printing: 'enabled'
        }
      };

      fs.writeFileSync(passwordFile, JSON.stringify(data, null, 2));
      console.log(`💾 Password saved for file ${fileId}: ${passwordFile}`);
      
      return true;
    } catch (err) {
      console.error('❌ Failed to save password:', err);
      return false;
    }
  }

  /**
   * Retrieve password for a file
   * @param {number} fileId - File ID
   * @returns {object|null} Password data or null if not found
   */
  getPassword(fileId) {
    try {
      const passwordFile = path.join(this.passwordsDir, `file_${fileId}.json`);
      
      if (!fs.existsSync(passwordFile)) {
        console.log(`⚠️  Password file not found for file ${fileId}`);
        return null;
      }

      const data = fs.readFileSync(passwordFile, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.error('❌ Failed to retrieve password:', err);
      return null;
    }
  }

  /**
   * Delete password file (when file is deleted)
   * @param {number} fileId - File ID
   * @returns {boolean} Success status
   */
  deletePassword(fileId) {
    try {
      const passwordFile = path.join(this.passwordsDir, `file_${fileId}.json`);
      
      if (fs.existsSync(passwordFile)) {
        fs.unlinkSync(passwordFile);
        console.log(`🗑️  Password deleted for file ${fileId}`);
        return true;
      }
      
      console.log(`⚠️  Password file not found for file ${fileId}`);
      return false;
    } catch (err) {
      console.error('❌ Failed to delete password:', err);
      return false;
    }
  }

  /**
   * List all stored passwords
   * @returns {array} Array of password data objects
   */
  listAllPasswords() {
    try {
      const files = fs.readdirSync(this.passwordsDir);
      const passwords = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const data = fs.readFileSync(path.join(this.passwordsDir, file), 'utf8');
          passwords.push(JSON.parse(data));
        }
      }

      console.log(`📋 Found ${passwords.length} password files`);
      return passwords;
    } catch (err) {
      console.error('❌ Failed to list passwords:', err);
      return [];
    }
  }

  /**
   * Cleanup old password files (older than X days)
   * @param {number} daysOld - Age threshold in days
   * @returns {number} Number of files deleted
   */
  cleanupOldPasswords(daysOld = 30) {
    try {
      const files = fs.readdirSync(this.passwordsDir);
      const now = Date.now();
      const maxAge = daysOld * 24 * 60 * 60 * 1000; // days to milliseconds
      let deletedCount = 0;

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.passwordsDir, file);
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          const createdAt = new Date(data.created_at).getTime();

          if (now - createdAt > maxAge) {
            fs.unlinkSync(filePath);
            deletedCount++;
            console.log(`🗑️  Deleted old password file: ${file}`);
          }
        }
      }

      console.log(`🧹 Cleaned up ${deletedCount} old password files`);
      return deletedCount;
    } catch (err) {
      console.error('❌ Failed to cleanup passwords:', err);
      return 0;
    }
  }

  /**
   * Export all passwords to a backup file
   * @returns {string|null} Backup file path or null on error
   */
  exportPasswordsBackup() {
    try {
      const passwords = this.listAllPasswords();
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const backupFile = path.join(this.tempDir, `password_backup_${timestamp}.json`);
      
      fs.writeFileSync(backupFile, JSON.stringify(passwords, null, 2));
      console.log(`💾 Password backup created: ${backupFile}`);
      
      return backupFile;
    } catch (err) {
      console.error('❌ Failed to export passwords:', err);
      return null;
    }
  }

  /**
   * Get statistics about stored passwords
   * @returns {object} Statistics object
   */
  getStatistics() {
    try {
      const passwords = this.listAllPasswords();
      const now = Date.now();
      
      const stats = {
        total_passwords: passwords.length,
        oldest_password: null,
        newest_password: null,
        passwords_last_7_days: 0,
        passwords_last_30_days: 0
      };

      if (passwords.length > 0) {
        // Sort by date
        passwords.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        
        stats.oldest_password = passwords[0].created_at;
        stats.newest_password = passwords[passwords.length - 1].created_at;
        
        // Count recent passwords
        passwords.forEach(pwd => {
          const age = now - new Date(pwd.created_at).getTime();
          const daysAge = age / (1000 * 60 * 60 * 24);
          
          if (daysAge <= 7) stats.passwords_last_7_days++;
          if (daysAge <= 30) stats.passwords_last_30_days++;
        });
      }

      return stats;
    } catch (err) {
      console.error('❌ Failed to get statistics:', err);
      return null;
    }
  }
}

// Export singleton instance
module.exports = new PDFPasswordManager();

// Export class for testing
module.exports.PDFPasswordManager = PDFPasswordManager;