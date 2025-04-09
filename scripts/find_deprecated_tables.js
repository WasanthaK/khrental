#!/usr/bin/env node

/**
 * This script searches for references to deprecated tables in the codebase.
 * It helps identify places where the old team_members and rentees tables
 * are still being used instead of the new app_users table.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const DEPRECATED_TABLES = ['team_members', 'rentees'];
const IGNORE_DIRS = ['node_modules', 'dist', '.git', 'scripts', 'db/migrations'];
const IGNORE_FILES = ['.eslintrc.json', 'README.md', 'MIGRATION_GUIDE.md'];

// Colors for console output
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Get the root directory of the project
const rootDir = path.resolve(__dirname, '..');

// Function to check if a path should be ignored
function shouldIgnore(filePath) {
  const relativePath = path.relative(rootDir, filePath);
  
  // Check if the path contains any of the ignored directories
  if (IGNORE_DIRS.some(dir => relativePath.includes(dir))) {
    return true;
  }
  
  // Check if the file is in the ignore list
  if (IGNORE_FILES.includes(path.basename(filePath))) {
    return true;
  }
  
  return false;
}

// Function to search for deprecated table references in a file
function searchFileForDeprecatedTables(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const results = [];
    
    DEPRECATED_TABLES.forEach(table => {
      const regex = new RegExp(`['".]${table}['"]|from\\(['"]${table}['"]\\)`, 'g');
      let match;
      
      while ((match = regex.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        const line = content.split('\n')[lineNumber - 1].trim();
        
        results.push({
          table,
          lineNumber,
          line,
        });
      }
    });
    
    return results;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    return [];
  }
}

// Function to recursively search directories
function searchDirectory(dir) {
  const results = [];
  
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    
    if (shouldIgnore(filePath)) {
      continue;
    }
    
    const stats = fs.statSync(filePath);
    
    if (stats.isDirectory()) {
      results.push(...searchDirectory(filePath));
    } else if (stats.isFile() && 
              (filePath.endsWith('.js') || 
               filePath.endsWith('.jsx') || 
               filePath.endsWith('.ts') || 
               filePath.endsWith('.tsx'))) {
      const fileResults = searchFileForDeprecatedTables(filePath);
      
      if (fileResults.length > 0) {
        results.push({
          file: path.relative(rootDir, filePath),
          references: fileResults,
        });
      }
    }
  }
  
  return results;
}

// Main function
function main() {
  console.log(`${COLORS.cyan}Searching for deprecated table references...${COLORS.reset}`);
  
  const results = searchDirectory(rootDir);
  
  if (results.length === 0) {
    console.log(`${COLORS.green}No deprecated table references found!${COLORS.reset}`);
    return;
  }
  
  console.log(`${COLORS.yellow}Found ${results.length} files with deprecated table references:${COLORS.reset}\n`);
  
  results.forEach(result => {
    console.log(`${COLORS.magenta}${result.file}${COLORS.reset}`);
    
    result.references.forEach(ref => {
      console.log(`  ${COLORS.red}Line ${ref.lineNumber}:${COLORS.reset} ${ref.line} ${COLORS.yellow}(${ref.table})${COLORS.reset}`);
    });
    
    console.log('');
  });
  
  console.log(`${COLORS.yellow}Total files with deprecated references: ${results.length}${COLORS.reset}`);
  console.log(`${COLORS.yellow}Total deprecated references: ${results.reduce((acc, result) => acc + result.references.length, 0)}${COLORS.reset}`);
  
  console.log(`\n${COLORS.cyan}Recommendation: Update these references to use the app_users table instead.${COLORS.reset}`);
  console.log(`${COLORS.cyan}For team_members: Use app_users with user_type: 'staff'${COLORS.reset}`);
  console.log(`${COLORS.cyan}For rentees: Use app_users with user_type: 'rentee'${COLORS.reset}`);
}

// Run the main function
main(); 