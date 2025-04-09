/**
 * Script to deploy the Evia webhook function without requiring the Supabase CLI
 * 
 * Usage:
 * node scripts/deploy-evia-webhook-without-cli.js
 */

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';

// Load environment variables
dotenv.config();

// Convert exec to Promise-based
const execAsync = promisify(exec);

// ANSI colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

// Create Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(`${colors.red}Error: Supabase URL or keys not found in .env file${colors.reset}`);
  console.log('Please ensure you have the following variables in your .env file:');
  console.log('  VITE_SUPABASE_URL=your-project-url');
  console.log('  VITE_SUPABASE_SERVICE_KEY=your-service-role-key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Extract project reference from URL
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

if (!projectRef) {
  console.error(`${colors.red}Error: Could not extract project reference from Supabase URL${colors.reset}`);
  console.log('Please ensure your VITE_SUPABASE_URL is in the format:');
  console.log('  https://your-project-ref.supabase.co');
  process.exit(1);
}

/**
 * Helper function to zip the function directory
 */
async function zipFunction(functionName) {
  try {
    console.log(`${colors.blue}Creating zip file for ${functionName}...${colors.reset}`);
    
    // Path to function directory
    const functionDir = path.join(process.cwd(), 'supabase', 'functions', functionName);
    
    // Check if directory exists
    if (!fs.existsSync(functionDir)) {
      console.error(`${colors.red}Error: Function directory not found: ${functionDir}${colors.reset}`);
      process.exit(1);
    }
    
    // Create temp directory if it doesn't exist
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
    
    // Name of zip file
    const zipFile = path.join(tempDir, `${functionName}.zip`);
    
    // Remove existing zip if it exists
    if (fs.existsSync(zipFile)) {
      fs.unlinkSync(zipFile);
    }
    
    // Determine appropriate zip command based on OS
    let zipCommand;
    if (process.platform === 'win32') {
      // For Windows, we'll use PowerShell's Compress-Archive
      zipCommand = `powershell -command "Compress-Archive -Path '${functionDir}/*' -DestinationPath '${zipFile}'"`;
    } else {
      // For Linux/Mac, use zip command
      zipCommand = `cd "${functionDir}" && zip -r "${zipFile}" .`;
    }
    
    // Execute the zip command
    await execAsync(zipCommand);
    
    console.log(`${colors.green}Function code zipped successfully${colors.reset}`);
    return zipFile;
  } catch (error) {
    console.error(`${colors.red}Error zipping function:${colors.reset}`, error);
    throw error;
  }
}

/**
 * Deploys a function to Supabase Edge Functions
 */
async function deployFunction(functionName) {
  try {
    console.log(`${colors.yellow}Deploying ${functionName} function to Supabase...${colors.reset}`);
    
    // Zip the function directory
    const zipFile = await zipFunction(functionName);
    
    // Read the zip file
    const zipData = fs.readFileSync(zipFile);
    
    // Function deployment API endpoint
    const deployUrl = `https://${projectRef}.supabase.co/functions/v1/deploy`;
    
    // Deploy the function
    const response = await fetch(deployUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/octet-stream',
        'x-function-name': functionName,
      },
      body: zipData
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Deployment failed with status ${response.status}: ${text}`);
    }
    
    const result = await response.json();
    console.log(`${colors.green}Function ${functionName} deployed successfully!${colors.reset}`);
    
    // Clean up zip file
    fs.unlinkSync(zipFile);
    
    return `https://${projectRef}.supabase.co/functions/v1/${functionName}`;
  } catch (error) {
    console.error(`${colors.red}Error deploying function:${colors.reset}`, error);
    throw error;
  }
}

/**
 * Tests if a webhook endpoint is accessible
 */
async function testWebhook(webhookUrl) {
  try {
    console.log(`${colors.blue}Testing webhook URL: ${webhookUrl}${colors.reset}`);
    
    // Send a HEAD request to check if the endpoint is accessible
    const response = await fetch(webhookUrl, { method: 'HEAD' });
    console.log(`${colors.blue}Response status: ${response.status} ${response.statusText}${colors.reset}`);
    
    return response.status === 405; // 405 Method Not Allowed is expected for HEAD on POST endpoint
  } catch (error) {
    console.error(`${colors.red}Error testing webhook:${colors.reset}`, error);
    return false;
  }
}

/**
 * Sends a test webhook event
 */
async function sendTestEvent(webhookUrl) {
  try {
    console.log(`${colors.blue}Sending test event to webhook...${colors.reset}`);
    
    // Create a simple test payload
    const testPayload = {
      RequestId: 'test-request-123',
      EventId: 1,
      EventDescription: 'SignRequestReceived',
      UserName: 'Test User',
      Email: 'test@example.com',
      Subject: 'Test Webhook',
      EventTime: new Date().toISOString(),
    };
    
    // Send a POST request to the webhook endpoint
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });
    
    console.log(`${colors.blue}Response status: ${response.status} ${response.statusText}${colors.reset}`);
    
    // Try to parse the response as JSON
    let responseData;
    try {
      responseData = await response.json();
      console.log(`${colors.blue}Response body:${colors.reset}`, responseData);
    } catch (e) {
      const text = await response.text();
      console.log(`${colors.blue}Response body (text):${colors.reset}`, text);
    }
    
    return response.ok;
  } catch (error) {
    console.error(`${colors.red}Error sending test event:${colors.reset}`, error);
    return false;
  }
}

/**
 * Updates the .env file with the webhook URL
 */
async function updateEnvFile(webhookUrl) {
  try {
    const envFilePath = path.join(process.cwd(), '.env');
    let envContent = '';
    
    // Read existing .env file if it exists
    if (fs.existsSync(envFilePath)) {
      envContent = fs.readFileSync(envFilePath, 'utf8');
    }
    
    // Check if VITE_EVIA_WEBHOOK_URL exists in .env
    if (envContent.includes('VITE_EVIA_WEBHOOK_URL=')) {
      // Replace the existing line
      envContent = envContent.replace(
        /VITE_EVIA_WEBHOOK_URL=.*/,
        `VITE_EVIA_WEBHOOK_URL=${webhookUrl}`
      );
    } else {
      // Add the new line
      envContent += `\nVITE_EVIA_WEBHOOK_URL=${webhookUrl}\n`;
    }
    
    // Write the updated content back to .env
    fs.writeFileSync(envFilePath, envContent);
    
    console.log(`${colors.green}.env file updated with webhook URL${colors.reset}`);
    return true;
  } catch (error) {
    console.error(`${colors.red}Error updating .env file:${colors.reset}`, error);
    return false;
  }
}

/**
 * Main function to deploy the webhook
 */
async function main() {
  try {
    console.log(`${colors.yellow}Starting deployment of Evia webhook function...${colors.reset}`);
    
    // First, check if the processed column exists in webhook_events
    let columnExists = null;
    let columnError = null;
    
    // Use try/catch instead of .catch()
    try {
      const result = await supabase.rpc('exec_sql', {
        sql: `
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'webhook_events' 
            AND column_name = 'processed'
          ) as column_exists;
        `
      });
      
      columnExists = result.data;
      columnError = result.error;
    } catch (err) {
      columnError = { message: 'RPC exec_sql not available' };
    }
    
    // If the RPC call failed, try a different approach
    let hasProcessedColumn = false;
    
    if (columnError) {
      console.log(`${colors.yellow}Could not check for processed column using RPC${colors.reset}`);
      
      // Try direct check (this requires permissions to query information_schema)
      try {
        const { data: columns, error: columnsError } = await supabase
          .from('webhook_events')
          .select('*')
          .limit(1);
        
        if (columnsError) {
          if (columnsError.code === '42P01') { // Table doesn't exist
            console.error(`${colors.red}The webhook_events table doesn't exist yet${colors.reset}`);
            console.log('Please run the SQL script in scripts/create_webhook_events_table.sql first');
          } else {
            console.error(`${colors.red}Error checking webhook_events table:${colors.reset}`, columnsError);
          }
        } else if (columns && columns.length > 0) {
          // Check if the first row has a processed property
          hasProcessedColumn = 'processed' in columns[0];
        }
      } catch (error) {
        console.error(`${colors.red}Error checking webhook_events table:${colors.reset}`, error);
      }
    } else if (columnExists && columnExists[0]) {
      hasProcessedColumn = columnExists[0].column_exists;
    }
    
    if (!hasProcessedColumn) {
      console.log(`${colors.yellow}The processed column is missing in webhook_events table${colors.reset}`);
      console.log('Please run the SQL script in scripts/fix-webhook-table-sql.js');
      
      const proceed = await askQuestion('Do you want to proceed with deployment anyway? (y/n): ');
      if (proceed.toLowerCase() !== 'y') {
        console.log('Deployment cancelled.');
        process.exit(0);
      }
    }
    
    // Deploy the function
    const webhookUrl = await deployFunction('evia-webhook');
    
    // Test if the endpoint is accessible
    const isAccessible = await testWebhook(webhookUrl);
    
    if (isAccessible) {
      console.log(`${colors.green}Webhook endpoint is accessible!${colors.reset}`);
      
      // Ask to update .env
      const updateEnv = await askQuestion('Do you want to update your .env file with the webhook URL? (y/n): ');
      if (updateEnv.toLowerCase() === 'y') {
        await updateEnvFile(webhookUrl);
      }
      
      // Ask to send test event
      const sendTest = await askQuestion('Do you want to send a test event to the webhook? (y/n): ');
      if (sendTest.toLowerCase() === 'y') {
        const success = await sendTestEvent(webhookUrl);
        if (success) {
          console.log(`${colors.green}Test event sent successfully!${colors.reset}`);
          
          // Check if event was stored in webhook_events
          console.log(`${colors.blue}Checking if event was stored in webhook_events table...${colors.reset}`);
          
          // Wait a moment for the event to be processed
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          try {
            const { data: events, error: eventsError } = await supabase
              .from('webhook_events')
              .select('*')
              .eq('request_id', 'test-request-123')
              .order('createdat', { ascending: false })
              .limit(1);
            
            if (eventsError) {
              console.error(`${colors.red}Error checking webhook_events table:${colors.reset}`, eventsError);
            } else if (events && events.length > 0) {
              console.log(`${colors.green}Event was successfully stored in webhook_events table!${colors.reset}`);
              console.log(`${colors.blue}Event details:${colors.reset}`, events[0]);
            } else {
              console.log(`${colors.yellow}No event found in webhook_events table${colors.reset}`);
              console.log('This might indicate an issue with the webhook function or database permissions');
            }
          } catch (error) {
            console.error(`${colors.red}Error checking webhook_events table:${colors.reset}`, error);
          }
        } else {
          console.log(`${colors.yellow}Test event failed${colors.reset}`);
        }
      }
    } else {
      console.log(`${colors.yellow}Warning: Webhook endpoint is not accessible${colors.reset}`);
      console.log('This might be due to CORS restrictions or function deployment issues');
    }
    
    console.log(`${colors.green}Deployment process completed!${colors.reset}`);
    console.log(`Your webhook URL is: ${webhookUrl}`);
    console.log('Use this URL in your Evia Sign API configuration');
    
  } catch (error) {
    console.error(`${colors.red}Deployment failed:${colors.reset}`, error);
    process.exit(1);
  }
}

/**
 * Helper function to ask a question and get user input
 */
function askQuestion(question) {
  return new Promise(resolve => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    readline.question(question, answer => {
      readline.close();
      resolve(answer);
    });
  });
}

// Run the main function
main(); 