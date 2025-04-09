// Cleanup script to archive webhook-related files
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Create an archive directory
const archiveDir = path.join(rootDir, 'archived-webhook-files');
if (!fs.existsSync(archiveDir)) {
  fs.mkdirSync(archiveDir, { recursive: true });
  console.log(`Created archive directory: ${archiveDir}`);
}

// Files to archive
const filesToArchive = [
  // Root directory files
  'evia-webhook-function.js',
  
  // Script files
  'scripts/create_webhook_events_table.sql',
  'scripts/deploy-evia-webhook.sh',
  'scripts/deploy-evia-webhook-without-cli.js',
  'scripts/evia-webhook-config.txt',
  'scripts/evia-webhook-setup.js',
  'scripts/export-webhook-function.js',
  'scripts/fix_webhook_table_manual.sql',
  'scripts/fix-webhook-table.js',
  'scripts/fix-webhook-table-sql.js',
  'scripts/redeploy-webhook.sh',
  'scripts/setup-webhook-table.sql',
  'scripts/test-evia-sign-webhook.js',
  'scripts/test-evia-webhook.js',
  'scripts/test-evia-webhook-agreement.js',
  'scripts/test-local-webhook.js',
  'scripts/test-webhook.js',
  'scripts/verify-webhook-settings.js'
];

// Archive each file
let archivedCount = 0;
let skippedCount = 0;

filesToArchive.forEach(filePath => {
  const fullPath = path.join(rootDir, filePath);
  
  // Skip if file doesn't exist
  if (!fs.existsSync(fullPath)) {
    console.log(`Skipping (doesn't exist): ${filePath}`);
    skippedCount++;
    return;
  }
  
  try {
    // Create target directory structure in the archive
    const targetDir = path.join(archiveDir, path.dirname(filePath));
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    // Copy file to archive
    const targetPath = path.join(archiveDir, filePath);
    fs.copyFileSync(fullPath, targetPath);
    
    // Remove original file
    fs.unlinkSync(fullPath);
    
    console.log(`Archived: ${filePath}`);
    archivedCount++;
  } catch (err) {
    console.error(`Error archiving ${filePath}:`, err);
  }
});

// Handle Supabase functions folder
const edgeFunctionPath = path.join(rootDir, 'supabase/functions/evia-webhook');
if (fs.existsSync(edgeFunctionPath)) {
  try {
    // Create target directory in archive
    const targetDir = path.join(archiveDir, 'supabase/functions/evia-webhook');
    fs.mkdirSync(targetDir, { recursive: true });
    
    // Read all files in the directory
    const files = fs.readdirSync(edgeFunctionPath);
    
    // Copy each file
    files.forEach(file => {
      const sourcePath = path.join(edgeFunctionPath, file);
      const targetPath = path.join(targetDir, file);
      
      if (fs.statSync(sourcePath).isFile()) {
        fs.copyFileSync(sourcePath, targetPath);
        fs.unlinkSync(sourcePath);
        console.log(`Archived: supabase/functions/evia-webhook/${file}`);
        archivedCount++;
      }
    });
    
    // Remove the directory if it's empty
    const remainingFiles = fs.readdirSync(edgeFunctionPath);
    if (remainingFiles.length === 0) {
      fs.rmdirSync(edgeFunctionPath);
      console.log('Removed empty directory: supabase/functions/evia-webhook');
    }
  } catch (err) {
    console.error('Error archiving Supabase function files:', err);
  }
}

console.log('\nCleanup Summary:');
console.log(`- Total files archived: ${archivedCount}`);
console.log(`- Files skipped: ${skippedCount}`);
console.log(`\nAll webhook-related files have been moved to: ${archiveDir}`);
console.log('\nYou can now start fresh with your new webhook server implementation.');
console.log('\nNote: This cleanup script itself will remain in the scripts directory.');
console.log('      Feel free to remove it manually once you no longer need it.'); 