/**
 * Azure Configuration Verification Tool
 * 
 * This script helps verify that all required environment variables are set
 * for Azure deployment and tests connections to necessary services.
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load environment variables from root .env
dotenv.config({ path: path.join(rootDir, '.env') });

// Load environment variables from webhook-server .env if exists
if (fs.existsSync(path.join(rootDir, 'webhook-server', '.env'))) {
  dotenv.config({ path: path.join(rootDir, 'webhook-server', '.env') });
}

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Required environment variables
const requiredVars = {
  main: [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_EVIA_WEBHOOK_URL'
  ],
  webhook: [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'EVIA_SIGN_WEBHOOK_URL'
  ]
};

// Test variables that should have the same values
const matchingVars = [
  ['VITE_SUPABASE_URL', 'SUPABASE_URL'],
  ['VITE_EVIA_WEBHOOK_URL', 'EVIA_SIGN_WEBHOOK_URL']
];

console.log(`${colors.cyan}========================================${colors.reset}`);
console.log(`${colors.cyan}  Azure Deployment Configuration Checker ${colors.reset}`);
console.log(`${colors.cyan}========================================${colors.reset}\n`);

// Check required environment variables
console.log(`${colors.magenta}Checking required environment variables...${colors.reset}`);

let mainMissingVars = [];
let webhookMissingVars = [];

// Check main app vars
console.log(`\n${colors.blue}Main Application Variables:${colors.reset}`);
requiredVars.main.forEach(varName => {
  if (process.env[varName]) {
    console.log(`  ${colors.green}✅ ${varName} is set${colors.reset}`);
  } else {
    console.log(`  ${colors.red}❌ ${varName} is missing${colors.reset}`);
    mainMissingVars.push(varName);
  }
});

// Check webhook server vars
console.log(`\n${colors.blue}Webhook Server Variables:${colors.reset}`);
requiredVars.webhook.forEach(varName => {
  if (process.env[varName]) {
    console.log(`  ${colors.green}✅ ${varName} is set${colors.reset}`);
  } else {
    console.log(`  ${colors.red}❌ ${varName} is missing${colors.reset}`);
    webhookMissingVars.push(varName);
  }
});

// Check matching variables
console.log(`\n${colors.blue}Checking matching variables:${colors.reset}`);
matchingVars.forEach(([var1, var2]) => {
  if (process.env[var1] && process.env[var2]) {
    if (process.env[var1] === process.env[var2]) {
      console.log(`  ${colors.green}✅ ${var1} and ${var2} match${colors.reset}`);
    } else {
      console.log(`  ${colors.yellow}⚠️ ${var1} and ${var2} have different values${colors.reset}`);
      console.log(`    ${var1}: ${process.env[var1]}`);
      console.log(`    ${var2}: ${process.env[var2]}`);
    }
  } else {
    console.log(`  ${colors.yellow}⚠️ Cannot compare ${var1} and ${var2} (one or both missing)${colors.reset}`);
  }
});

// Check Supabase connection
console.log(`\n${colors.blue}Testing Supabase connection:${colors.reset}`);
let supabaseTestResult = { success: false, message: 'Test not run' };

async function testSupabaseConnection() {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      return { success: false, message: 'Supabase URL or service key missing' };
    }
    
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    // Test database connection
    const { data, error } = await supabase.from('webhook_events').select('id').limit(1);
    
    if (error) {
      throw error;
    }
    
    // Also check if agreements table exists
    const { data: agreementsData, error: agreementsError } = await supabase
      .from('agreements')
      .select('id')
      .limit(1);
    
    if (agreementsError) {
      return { 
        success: false, 
        message: `Connected to Supabase but couldn't access agreements table: ${agreementsError.message}` 
      };
    }
    
    return { success: true, message: 'Successfully connected to Supabase' };
  } catch (error) {
    return { success: false, message: `Error connecting to Supabase: ${error.message}` };
  }
}

// Test webhook endpoint
console.log(`\n${colors.blue}Testing webhook URL:${colors.reset}`);
let webhookTestResult = { success: false, message: 'Test not run' };

async function testWebhookEndpoint() {
  try {
    if (!process.env.EVIA_SIGN_WEBHOOK_URL) {
      return { success: false, message: 'Webhook URL is missing' };
    }
    
    // Just check if the URL is valid and reachable
    // We don't actually send a POST request to avoid creating test data
    const webhookUrl = new URL(process.env.EVIA_SIGN_WEBHOOK_URL);
    const baseUrl = `${webhookUrl.protocol}//${webhookUrl.host}`;
    
    // Try to reach the base URL
    const response = await fetch(baseUrl, {
      method: 'GET',
      timeout: 5000
    });
    
    if (response.ok) {
      return { success: true, message: `Webhook endpoint base URL (${baseUrl}) is reachable` };
    } else {
      return { 
        success: false, 
        message: `Webhook endpoint base URL returned status ${response.status}` 
      };
    }
  } catch (error) {
    return { 
      success: false, 
      message: `Error checking webhook URL: ${error.message}` 
    };
  }
}

// Check GitHub workflows
console.log(`\n${colors.blue}Checking GitHub workflow files:${colors.reset}`);
const mainWorkflowPath = path.join(rootDir, '.github', 'workflows', 'main-app-deploy.yml');
const webhookWorkflowPath = path.join(rootDir, '.github', 'workflows', 'webhook-deploy.yml');

if (fs.existsSync(mainWorkflowPath)) {
  console.log(`  ${colors.green}✅ main-app-deploy.yml workflow exists${colors.reset}`);
} else {
  console.log(`  ${colors.red}❌ main-app-deploy.yml workflow is missing${colors.reset}`);
}

if (fs.existsSync(webhookWorkflowPath)) {
  console.log(`  ${colors.green}✅ webhook-deploy.yml workflow exists${colors.reset}`);
} else {
  console.log(`  ${colors.red}❌ webhook-deploy.yml workflow is missing${colors.reset}`);
}

// Run async tests
async function runTests() {
  supabaseTestResult = await testSupabaseConnection();
  webhookTestResult = await testWebhookEndpoint();
  
  // Log results of tests
  console.log(`\n${colors.blue}Supabase connection test:${colors.reset}`);
  if (supabaseTestResult.success) {
    console.log(`  ${colors.green}✅ ${supabaseTestResult.message}${colors.reset}`);
  } else {
    console.log(`  ${colors.red}❌ ${supabaseTestResult.message}${colors.reset}`);
  }
  
  console.log(`\n${colors.blue}Webhook URL test:${colors.reset}`);
  if (webhookTestResult.success) {
    console.log(`  ${colors.green}✅ ${webhookTestResult.message}${colors.reset}`);
  } else {
    console.log(`  ${colors.yellow}⚠️ ${webhookTestResult.message}${colors.reset}`);
    console.log(`  ${colors.yellow}   (This may be expected if webhook server is not running yet)${colors.reset}`);
  }
  
  // Summary
  console.log(`\n${colors.cyan}========================================${colors.reset}`);
  console.log(`${colors.cyan}               Summary                  ${colors.reset}`);
  console.log(`${colors.cyan}========================================${colors.reset}\n`);
  
  const mainConfigReady = mainMissingVars.length === 0;
  const webhookConfigReady = webhookMissingVars.length === 0;
  const workflowsReady = fs.existsSync(mainWorkflowPath) && fs.existsSync(webhookWorkflowPath);
  const supabaseReady = supabaseTestResult.success;
  
  console.log(`Main App Configuration: ${mainConfigReady ? colors.green + '✅ Ready' : colors.red + '❌ Not Ready'}${colors.reset}`);
  console.log(`Webhook Configuration: ${webhookConfigReady ? colors.green + '✅ Ready' : colors.red + '❌ Not Ready'}${colors.reset}`);
  console.log(`GitHub Workflows: ${workflowsReady ? colors.green + '✅ Ready' : colors.red + '❌ Not Ready'}${colors.reset}`);
  console.log(`Supabase Connection: ${supabaseReady ? colors.green + '✅ Ready' : colors.red + '❌ Not Ready'}${colors.reset}`);
  
  console.log(`\n${colors.magenta}Overall Deployment Readiness:${colors.reset}`);
  if (mainConfigReady && webhookConfigReady && workflowsReady && supabaseReady) {
    console.log(`${colors.green}✅ Your configuration is ready for deployment to Azure!${colors.reset}`);
  } else {
    console.log(`${colors.red}❌ Some issues need to be fixed before deployment.${colors.reset}`);
    console.log(`${colors.yellow}   See details above for what needs to be addressed.${colors.reset}`);
  }
}

runTests().catch(error => {
  console.error(`${colors.red}Error running tests: ${error.message}${colors.reset}`);
}); 