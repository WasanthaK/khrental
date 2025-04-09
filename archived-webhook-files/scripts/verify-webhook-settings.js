/**
 * Script to verify webhook settings in the code
 * 
 * Usage:
 * node scripts/verify-webhook-settings.js
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// ANSI colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

console.log(`${colors.blue}Verifying webhook settings for Evia Sign integration...${colors.reset}\n`);

// Check .env file
const envPath = path.join(process.cwd(), '.env');
let webhookUrlInEnv = null;

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/VITE_EVIA_WEBHOOK_URL=(.+)(\r?\n|$)/);
  
  if (match && match[1]) {
    webhookUrlInEnv = match[1].trim();
    console.log(`${colors.green}✓ Found webhook URL in .env file:${colors.reset}`);
    console.log(`  ${webhookUrlInEnv}\n`);
  } else {
    console.log(`${colors.yellow}⚠ No webhook URL found in .env file${colors.reset}\n`);
  }
} else {
  console.log(`${colors.yellow}⚠ No .env file found${colors.reset}\n`);
}

// Check eviaSignService.js
const servicePath = path.join(process.cwd(), 'src', 'services', 'eviaSignService.js');
let webhookUrlInCode = null;

if (fs.existsSync(servicePath)) {
  const serviceContent = fs.readFileSync(servicePath, 'utf8');
  
  // Check for DEFAULT_WEBHOOK_URL constant
  const defaultUrlMatch = serviceContent.match(/DEFAULT_WEBHOOK_URL\s*=\s*[^|]+\|\|\s*(?:typeof window[^:]+:[^'"]+'([^']+)')/);
  if (defaultUrlMatch && defaultUrlMatch[1]) {
    webhookUrlInCode = defaultUrlMatch[1].trim();
    console.log(`${colors.green}✓ Found default webhook URL in code:${colors.reset}`);
    console.log(`  ${webhookUrlInCode}\n`);
  } else {
    console.log(`${colors.yellow}⚠ No default webhook URL found in code${colors.reset}\n`);
  }
  
  // Check if CallbackUrl is used in the request
  if (serviceContent.includes('"CallbackUrl":') || serviceContent.includes('"CallbackUrl" :')) {
    console.log(`${colors.green}✓ CallbackUrl parameter is included in the request${colors.reset}\n`);
  } else {
    console.log(`${colors.red}✗ CallbackUrl parameter is NOT included in the request${colors.reset}\n`);
  }
  
  // Check if CompletedDocumentsAttached is used in the request
  if (serviceContent.includes('"CompletedDocumentsAttached":') || serviceContent.includes('"CompletedDocumentsAttached" :')) {
    console.log(`${colors.green}✓ CompletedDocumentsAttached parameter is included in the request${colors.reset}\n`);
  } else {
    console.log(`${colors.red}✗ CompletedDocumentsAttached parameter is NOT included in the request${colors.reset}\n`);
  }
} else {
  console.log(`${colors.red}✗ eviaSignService.js not found${colors.reset}\n`);
}

// Summary
console.log(`${colors.blue}==== Summary ====${colors.reset}`);

if (webhookUrlInEnv) {
  console.log(`${colors.green}✓ Webhook URL is configured in .env file${colors.reset}`);
} else {
  console.log(`${colors.yellow}⚠ Missing webhook URL in .env file. Add this line to your .env:${colors.reset}`);
  console.log(`  VITE_EVIA_WEBHOOK_URL=https://vcorwfilylgtvzktszvi.supabase.co/functions/v1/evia-webhook\n`);
}

if (webhookUrlInCode) {
  console.log(`${colors.green}✓ Default webhook URL is configured in code${colors.reset}`);
  
  if (webhookUrlInCode.includes('webhook.site')) {
    console.log(`${colors.red}✗ Warning: Using webhook.site URL in code. This should be updated to use your Supabase function.${colors.reset}`);
  } else if (webhookUrlInCode.includes('supabase.co/functions')) {
    console.log(`${colors.green}✓ Using Supabase Edge Function for webhooks${colors.reset}`);
  }
} else {
  console.log(`${colors.yellow}⚠ Missing default webhook URL in code${colors.reset}`);
}

console.log(`\n${colors.blue}Verification complete!${colors.reset}`); 