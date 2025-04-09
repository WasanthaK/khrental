/**
 * Script to export the webhook function code for manual deployment
 * 
 * Usage:
 * node scripts/export-webhook-function.js
 */

import fs from 'fs';
import path from 'path';

// ANSI colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

console.log(`${colors.yellow}Exporting Evia webhook function for manual deployment...${colors.reset}`);

// Path to function source file
const functionDir = path.join(process.cwd(), 'supabase', 'functions', 'evia-webhook');
const indexPath = path.join(functionDir, 'index.js');

// Export file path
const exportPath = path.join(process.cwd(), 'evia-webhook-function.js');

try {
  // Check if function directory exists
  if (!fs.existsSync(functionDir)) {
    console.error(`${colors.red}Error: Function directory not found: ${functionDir}${colors.reset}`);
    console.log('Make sure you are running this script from the project root directory.');
    process.exit(1);
  }

  // Check if index.js exists
  if (!fs.existsSync(indexPath)) {
    console.error(`${colors.red}Error: Function source file not found: ${indexPath}${colors.reset}`);
    process.exit(1);
  }

  // Read the function code
  const functionCode = fs.readFileSync(indexPath, 'utf8');
  
  // Save it to the export file
  fs.writeFileSync(exportPath, functionCode);
  
  console.log(`${colors.green}Function code exported successfully to ${exportPath}${colors.reset}`);
  console.log('\nTo deploy this function:');
  console.log('1. Go to your Supabase dashboard: https://app.supabase.com/');
  console.log('2. Select your project');
  console.log('3. Go to the "Edge Functions" section');
  console.log('4. Click "Create a new function"');
  console.log('5. Name it "evia-webhook"');
  console.log('6. Copy and paste the contents of the exported file');
  console.log('7. Click "Create function"');
  
  console.log(`\n${colors.yellow}After deployment, your webhook URL will be:${colors.reset}`);
  console.log('https://[YOUR-PROJECT-REF].supabase.co/functions/v1/evia-webhook');
  console.log('\nMake sure to:');
  console.log('1. Set this URL in your Evia Sign configuration');
  console.log('2. Add it to your .env file as VITE_EVIA_WEBHOOK_URL');
  
  console.log(`\n${colors.blue}To test the webhook:${colors.reset}`);
  console.log('node scripts/test-webhook.js');
  
} catch (error) {
  console.error(`${colors.red}Error exporting function:${colors.reset}`, error);
  process.exit(1);
} 