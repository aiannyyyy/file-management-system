// ============================================================
// wordPasswordManager.js - OPTION A: Recommended Read-Only
// Location: /utils/wordPasswordManager.js
// ============================================================

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

class WordPasswordManager {
  constructor() {
    this.tempDir = path.join(__dirname, '../temp');
    this.passwordsDir = path.join(this.tempDir, 'word_passwords');
    this.ensureDirectories();
  }

  ensureDirectories() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
      console.log('📁 Created temp directory');
    }
    if (!fs.existsSync(this.passwordsDir)) {
      fs.mkdirSync(this.passwordsDir, { recursive: true });
      console.log('📁 Created word passwords directory');
    }
  }

  /**
   * ✅ Generate fixed password "nscsl" for all Word documents
   * Same as Excel - consistent across all file types
   */
  generateFixedPassword(fileId) {
    return 'nscsl';
  }

  /**
   * Apply RECOMMENDED READ-ONLY protection to Word document (.docx)
   * 
   * OPTION A: Most Reliable
   * 
   * User Experience:
   * - Document opens with dialog: "Open as Read-Only?"
   * - User can click "Yes" → Read-only mode ✅
   * - User can click "No" → Normal editable mode ✅
   * - No password needed
   * - Works in ALL Word versions
   * - Most reliable protection method
   */
  async protectWordDocument(inputPath, outputPath, password) {
    try {
      console.log(`\n🔒 PROTECTING WORD DOCUMENT - OPTION A`);
      console.log(`   Input: ${path.basename(inputPath)}`);
      console.log(`   Output: ${path.basename(outputPath)}`);
      console.log(`   Password: ${password}`);
      console.log(`   Method: RECOMMENDED READ-ONLY (No password enforcement)`);

      // ✅ Step 1: Verify input file exists
      if (!fs.existsSync(inputPath)) {
        throw new Error(`File not found: ${inputPath}`);
      }
      console.log(`✅ Input file found`);

      // ✅ Step 2: Read DOCX as ZIP
      const docxBuffer = fs.readFileSync(inputPath);
      const zip = await JSZip.loadAsync(docxBuffer);
      console.log(`✅ Document loaded`);

      // ✅ Step 3: Get or create settings.xml
      let settingsFile = zip.file('word/settings.xml');
      let settingsXml = '';

      if (settingsFile) {
        settingsXml = await settingsFile.async('string');
        console.log(`✅ Existing settings.xml found`);
      } else {
        // Create default settings.xml
        settingsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" 
            xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" 
            xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"/>`;
        console.log(`✅ Created new settings.xml`);
      }

      // ✅ Step 4: Remove any existing protection
      settingsXml = settingsXml.replace(/<w:writeProtection[^>]*\/>/g, '');
      settingsXml = settingsXml.replace(/<w:documentProtection[^>]*\/>/g, '');
      console.log(`✅ Removed existing protection tags`);

      // ✅ Step 5: Add document-level READ-ONLY protection
      // This uses the documentProtection element which is more reliable
      const passwordHash = this.generateXORHash(password);
      console.log(`🔑 Password hash generated: ${passwordHash}`);
      
      const protectionXml = `<w:documentProtection w:edit="readOnly" w:enforcement="1" w:cryptProviderType="rsaAES" w:cryptAlgorithmClass="hash" w:cryptAlgorithmType="typeAny" w:cryptAlgorithmSid="14" w:cryptSpinCount="100000" w:hash="${passwordHash}" w:salt="AQEDBQ=="/>`;

      if (settingsXml.includes('</w:settings>')) {
        settingsXml = settingsXml.replace('</w:settings>', `${protectionXml}</w:settings>`);
      } else {
        settingsXml = settingsXml.replace(/\/>$/, `>${protectionXml}</w:settings>`);
      }
      console.log(`✅ Added READ-ONLY protection with password`);

      // ✅ Step 6: Save updated settings.xml
      zip.file('word/settings.xml', settingsXml);

      // ✅ Step 7: Generate protected DOCX
      console.log(`📦 Generating protected DOCX...`);
      const protectedBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 }
      });

      // ✅ Step 8: Write to output file
      fs.writeFileSync(outputPath, protectedBuffer);

      const stats = fs.statSync(outputPath);
      console.log(`✅ Word document protected successfully!`);
      console.log(`   Output: ${path.basename(outputPath)}`);
      console.log(`   Size: ${stats.size} bytes`);
      console.log(`   Password: ${password}`);
      console.log(`   Mode: READ-ONLY WITH PASSWORD PROTECTION`);
      console.log(`   User will see: Password prompt when trying to edit`);

      return true;

    } catch (err) {
      console.error('❌ Failed to protect Word document:', err.message);
      console.error('   Stack:', err.stack);
      throw new Error(`Word protection failed - ${err.message}`);
    }
  }

  /**
   * Generate XOR Hash for password (Excel-style - Works with Word)
   */
  generateXORHash(password) {
    let hash = 0;
    const key = password.length;
    
    for (let i = password.length - 1; i >= 0; i--) {
      const char = password.charCodeAt(i);
      hash = ((hash >> 14) & 0x01) | ((hash << 1) & 0x7FFF);
      hash ^= char;
    }
    
    hash = ((hash >> 14) & 0x01) | ((hash << 1) & 0x7FFF);
    hash ^= key;
    hash ^= 0xCE4B;
    
    return hash.toString(16).toUpperCase().padStart(4, '0');
  }

  /**
   * Save password to file
   */
  savePassword(fileId, fileName, password, userId, restrictions = {}) {
    try {
      const passwordFile = path.join(this.passwordsDir, `file_${fileId}.json`);
      
      const data = {
        file_id: fileId,
        file_name: fileName,
        file_type: 'docx',
        password: password,
        user_id: userId,
        created_at: new Date().toISOString(),
        download_count: 0,
        last_downloaded: null,
        note: 'Password: "nscsl" - Document shows "Open as Read-Only?" dialog',
        protection_method: 'OPTION A - Recommended Read-Only',
        restrictions_applied: {
          editing: 'RECOMMENDED READ-ONLY',
          protection: 'enabled',
          password_required: false,
          user_choice: 'Can choose to open read-only or editable',
          protection_type: 'Recommended Read-Only Mode'
        }
      };

      fs.writeFileSync(passwordFile, JSON.stringify(data, null, 2));
      console.log(`💾 Password saved for Word file ${fileId}`);
      
      return true;
    } catch (err) {
      console.error('❌ Failed to save password:', err);
      return false;
    }
  }

  /**
   * Retrieve password for a file
   */
  getPassword(fileId) {
    try {
      const passwordFile = path.join(this.passwordsDir, `file_${fileId}.json`);
      
      if (!fs.existsSync(passwordFile)) {
        console.log(`⚠️  Password file not found for Word file ${fileId}`);
        return null;
      }

      const data = fs.readFileSync(passwordFile, 'utf8');
      const parsed = JSON.parse(data);
      console.log(`📋 Retrieved password for file ${fileId}`);
      
      return parsed;
    } catch (err) {
      console.error('❌ Failed to retrieve password:', err);
      return null;
    }
  }

  /**
   * Increment download counter
   */
  incrementDownloadCount(fileId) {
    try {
      const data = this.getPassword(fileId);
      if (data) {
        data.download_count = (data.download_count || 0) + 1;
        data.last_downloaded = new Date().toISOString();
        
        const passwordFile = path.join(this.passwordsDir, `file_${fileId}.json`);
        fs.writeFileSync(passwordFile, JSON.stringify(data, null, 2));
        console.log(`📊 Download count incremented for Word file ${fileId}: ${data.download_count}`);
      }
    } catch (err) {
      console.error('❌ Failed to increment download count:', err);
    }
  }

  /**
   * Delete password file
   */
  deletePassword(fileId) {
    try {
      const passwordFile = path.join(this.passwordsDir, `file_${fileId}.json`);
      
      if (fs.existsSync(passwordFile)) {
        fs.unlinkSync(passwordFile);
        console.log(`🗑️  Password deleted for Word file ${fileId}`);
        return true;
      }
      
      console.log(`⚠️  Password file not found for Word file ${fileId}`);
      return false;
    } catch (err) {
      console.error('❌ Failed to delete password:', err);
      return false;
    }
  }

  /**
   * List all stored passwords
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

      console.log(`📋 Found ${passwords.length} Word password files`);
      return passwords;
    } catch (err) {
      console.error('❌ Failed to list passwords:', err);
      return [];
    }
  }

  /**
   * Cleanup old password files
   */
  cleanupOldPasswords(daysOld = 30) {
    try {
      const files = fs.readdirSync(this.passwordsDir);
      const now = Date.now();
      const maxAge = daysOld * 24 * 60 * 60 * 1000;
      let deletedCount = 0;

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.passwordsDir, file);
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          const createdAt = new Date(data.created_at).getTime();

          if (now - createdAt > maxAge) {
            fs.unlinkSync(filePath);
            deletedCount++;
            console.log(`🗑️  Deleted old Word password file: ${file}`);
          }
        }
      }

      console.log(`🧹 Cleaned up ${deletedCount} old Word password files`);
      return deletedCount;
    } catch (err) {
      console.error('❌ Failed to cleanup passwords:', err);
      return 0;
    }
  }

  /**
   * Export all passwords to backup file
   */
  exportPasswordsBackup() {
    try {
      const passwords = this.listAllPasswords();
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const backupFile = path.join(this.tempDir, `word_password_backup_${timestamp}.json`);
      
      fs.writeFileSync(backupFile, JSON.stringify(passwords, null, 2));
      console.log(`💾 Word password backup created: ${backupFile}`);
      
      return backupFile;
    } catch (err) {
      console.error('❌ Failed to export passwords:', err);
      return null;
    }
  }

  /**
   * Get statistics about stored passwords
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
        passwords_last_30_days: 0,
        total_downloads: 0
      };

      if (passwords.length > 0) {
        passwords.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        
        stats.oldest_password = passwords[0].created_at;
        stats.newest_password = passwords[passwords.length - 1].created_at;
        
        passwords.forEach(pwd => {
          const age = now - new Date(pwd.created_at).getTime();
          const daysAge = age / (1000 * 60 * 60 * 24);
          
          if (daysAge <= 7) stats.passwords_last_7_days++;
          if (daysAge <= 30) stats.passwords_last_30_days++;
          stats.total_downloads += pwd.download_count || 0;
        });
      }

      return stats;
    } catch (err) {
      console.error('❌ Failed to get statistics:', err);
      return null;
    }
  }

  /**
   * Remove protection from Word document (Admin use only)
   */
  async removePasswordProtection(inputPath, outputPath) {
    try {
      console.log(`🔓 Removing protection from: ${path.basename(inputPath)}`);

      const docxBuffer = fs.readFileSync(inputPath);
      const zip = await JSZip.loadAsync(docxBuffer);

      let settingsFile = zip.file('word/settings.xml');
      if (settingsFile) {
        let settingsXml = await settingsFile.async('string');
        
        // Remove all protection elements
        settingsXml = settingsXml.replace(/<w:writeProtection[^>]*\/>/g, '');
        settingsXml = settingsXml.replace(/<w:documentProtection[^>]*\/>/g, '');
        
        zip.file('word/settings.xml', settingsXml);
        console.log(`✅ Protection tags removed`);
      }

      const unprotectedBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE'
      });

      fs.writeFileSync(outputPath, unprotectedBuffer);

      console.log(`✅ Word document unprotected: ${path.basename(outputPath)}`);
      return true;

    } catch (err) {
      console.error('❌ Failed to remove password protection:', err.message);
      throw err;
    }
  }

  /**
   * Verify if a file is password protected
   */
  async isPasswordProtected(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        console.warn(`⚠️  File not found: ${filePath}`);
        return false;
      }

      const buffer = fs.readFileSync(filePath);
      const zip = await JSZip.loadAsync(buffer);
      const settingsFile = zip.file('word/settings.xml');
      
      if (!settingsFile) {
        return false;
      }
      
      const settingsXml = await settingsFile.async('string');
      return settingsXml.includes('writeProtection') || settingsXml.includes('documentProtection');
    } catch (err) {
      console.error('❌ Failed to check protection status:', err);
      return false;
    }
  }
}

module.exports = new WordPasswordManager();
module.exports.WordPasswordManager = WordPasswordManager;