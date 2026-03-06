const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const JSZip = require('jszip');
const xml2js = require('xml2js');

class ExcelPasswordManager {
  constructor() {
    this.tempDir = path.join(__dirname, '../temp');
    this.passwordsDir = path.join(this.tempDir, 'excel_passwords');
    this.ensureDirectories();
  }

  ensureDirectories() {
    try {
      if (!fs.existsSync(this.tempDir)) {
        fs.mkdirSync(this.tempDir, { recursive: true });
        console.log('📁 Temp directory created');
      }
      if (!fs.existsSync(this.passwordsDir)) {
        fs.mkdirSync(this.passwordsDir, { recursive: true });
        console.log('📁 Password directory created');
      }
    } catch (err) {
      console.error('❌ Directory creation failed:', err);
      throw err;
    }
  }

  generateFixedPassword(fileId) {
    return 'nscsl';
  }

  /**
   * Generate XOR-based password hash for Excel
   */
  generatePasswordHash(password) {
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
   * Convert XLS to XLSX using XLSX library
   */
  convertXLStoXLSX(inputPath, outputPath) {
    try {
      console.log(`🔄 Converting XLS to XLSX...`);
      const workbook = XLSX.readFile(inputPath);
      XLSX.writeFile(workbook, outputPath);
      console.log(`✅ Converted to XLSX`);
      return true;
    } catch (err) {
      console.error(`❌ Conversion failed:`, err.message);
      throw err;
    }
  }

  /**
   * Add sheet protection to XLSX file by modifying XML
   */
  async addSheetProtectionXML(xlsxPath, password) {
    try {
      console.log(`🔐 Adding sheet protection via XML...`);
      
      const fileBuffer = fs.readFileSync(xlsxPath);
      const zip = await JSZip.loadAsync(fileBuffer);
      
      const passwordHash = this.generatePasswordHash(password);
      console.log(`   Password hash: ${passwordHash}`);

      // Process all worksheets
      const sheetFiles = Object.keys(zip.files).filter(name => 
        name.startsWith('xl/worksheets/sheet') && name.endsWith('.xml')
      );

      console.log(`   Found ${sheetFiles.length} worksheets`);

      for (const sheetFile of sheetFiles) {
        let sheetXml = await zip.file(sheetFile).async('string');
        
        // Remove existing protection if any
        sheetXml = sheetXml.replace(/<sheetProtection[^>]*\/?>/g, '');
        
        // Add protection element after sheetData
        const protectionXml = `<sheetProtection sheet="1" password="${passwordHash}" objects="1" scenarios="1" formatCells="0" formatColumns="0" formatRows="0" insertColumns="0" insertRows="0" insertHyperlinks="0" deleteColumns="0" deleteRows="0" selectLockedCells="1" sort="0" autoFilter="0" pivotTables="0" selectUnlockedCells="1"/>`;
        
        if (sheetXml.includes('</sheetData>')) {
          sheetXml = sheetXml.replace('</sheetData>', `</sheetData>${protectionXml}`);
        } else {
          sheetXml = sheetXml.replace('</worksheet>', `${protectionXml}</worksheet>`);
        }
        
        zip.file(sheetFile, sheetXml);
        console.log(`   ✅ Protected: ${sheetFile}`);
      }

      // Generate protected XLSX
      const protectedBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE'
      });

      fs.writeFileSync(xlsxPath, protectedBuffer);
      console.log(`✅ Sheet protection XML added`);
      return true;

    } catch (err) {
      console.error(`❌ XML protection failed:`, err.message);
      throw err;
    }
  }

  /**
   * Main protection method
   */
  async protectExcelDocument(inputPath, outputPath, password) {
    try {
      console.log(`\n🔒 PROTECTING EXCEL FILE`);
      console.log(`   Input: ${inputPath}`);
      console.log(`   Output: ${outputPath}`);
      console.log(`   Password: ${password}`);

      if (!fs.existsSync(inputPath)) {
        throw new Error(`File not found: ${inputPath}`);
      }

      const ext = path.extname(inputPath).toLowerCase();
      let workingPath = inputPath;

      // Convert XLS to XLSX if needed
      if (ext === '.xls') {
        const tempXlsx = outputPath + '.temp.xlsx';
        this.convertXLStoXLSX(inputPath, tempXlsx);
        workingPath = tempXlsx;
      } else {
        // Copy XLSX to temp location for processing
        const tempXlsx = outputPath + '.temp.xlsx';
        fs.copyFileSync(inputPath, tempXlsx);
        workingPath = tempXlsx;
      }

      // Add sheet protection via XML
      await this.addSheetProtectionXML(workingPath, password);

      // Move to final location
      fs.renameSync(workingPath, outputPath);

      const stats = fs.statSync(outputPath);
      console.log(`✅ Protected file saved`);
      console.log(`   Size: ${stats.size} bytes`);
      console.log(`   Password: ${password}`);

      return true;

    } catch (err) {
      console.error('❌ Protection failed:', err.message);
      throw new Error(`Excel protection failed - ${err.message}`);
    }
  }

  savePassword(fileId, fileName, password, userId) {
    try {
      const passwordFile = path.join(this.passwordsDir, `file_${fileId}.json`);
      
      const data = {
        file_id: fileId,
        file_name: fileName,
        password: password,
        user_id: userId,
        created_at: new Date().toISOString(),
        note: 'Password "nscsl" required to edit'
      };

      fs.writeFileSync(passwordFile, JSON.stringify(data, null, 2));
      console.log(`💾 Password saved`);
      return true;
    } catch (err) {
      console.error('❌ Failed to save password:', err);
      return false;
    }
  }

  getPassword(fileId) {
    try {
      const passwordFile = path.join(this.passwordsDir, `file_${fileId}.json`);
      
      if (!fs.existsSync(passwordFile)) {
        return null;
      }

      const data = fs.readFileSync(passwordFile, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.error('❌ Failed to get password:', err);
      return null;
    }
  }

  incrementDownloadCount(fileId) {
    try {
      const data = this.getPassword(fileId);
      if (data) {
        data.download_count = (data.download_count || 0) + 1;
        const passwordFile = path.join(this.passwordsDir, `file_${fileId}.json`);
        fs.writeFileSync(passwordFile, JSON.stringify(data, null, 2));
      }
    } catch (err) {
      console.error('❌ Failed to increment count:', err);
    }
  }

  deletePassword(fileId) {
    try {
      const passwordFile = path.join(this.passwordsDir, `file_${fileId}.json`);
      if (fs.existsSync(passwordFile)) {
        fs.unlinkSync(passwordFile);
        console.log(`🗑️  Password deleted`);
        return true;
      }
      return false;
    } catch (err) {
      console.error('❌ Failed to delete password:', err);
      return false;
    }
  }

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
      return passwords;
    } catch (err) {
      console.error('❌ Failed to list passwords:', err);
      return [];
    }
  }

  getStatistics() {
    try {
      const passwords = this.listAllPasswords();
      return {
        total_passwords: passwords.length,
        total_downloads: passwords.reduce((sum, pwd) => sum + (pwd.download_count || 0), 0)
      };
    } catch (err) {
      console.error('❌ Failed to get statistics:', err);
      return null;
    }
  }

  async isPasswordProtected(filePath) {
    try {
      if (!fs.existsSync(filePath)) return false;
      
      const fileBuffer = fs.readFileSync(filePath);
      const zip = await JSZip.loadAsync(fileBuffer);
      
      const sheetFiles = Object.keys(zip.files).filter(name => 
        name.startsWith('xl/worksheets/sheet') && name.endsWith('.xml')
      );

      for (const sheetFile of sheetFiles) {
        const sheetXml = await zip.file(sheetFile).async('string');
        if (sheetXml.includes('<sheetProtection')) {
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error('❌ Failed to check protection:', err);
      return false;
    }
  }
}

module.exports = new ExcelPasswordManager();
module.exports.ExcelPasswordManager = ExcelPasswordManager;