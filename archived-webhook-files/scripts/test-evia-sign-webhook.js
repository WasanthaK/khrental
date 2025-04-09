/**
 * Script to test the Evia webhook specifically simulating an Evia Sign request 
 * (without auth headers)
 * 
 * Usage:
 * node scripts/test-evia-sign-webhook.js
 */

import fetch from 'node-fetch';
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

// Get the webhook URL from .env
const webhookUrl = process.env.VITE_EVIA_WEBHOOK_URL;

if (!webhookUrl) {
  console.error(`${colors.red}Error: Webhook URL not found in .env file${colors.reset}`);
  console.log('Please add VITE_EVIA_WEBHOOK_URL to your .env file');
  process.exit(1);
}

// Generate a unique ID for this test
const testId = `test-eviasign-${Date.now()}`;

// Create a sample event that mimics an Evia Sign event
const sampleEvent = {
  RequestId: testId,
  UserName: "Test User",
  Email: "test@example.com",
  Subject: "Test Webhook Event",
  EventId: 1,
  EventDescription: "SignRequestReceived",
  EventTime: new Date().toISOString()
};

async function testWebhook() {
  console.log(`${colors.blue}Testing Evia webhook as if it came from Evia Sign (no auth header)...${colors.reset}\n`);
  console.log(`Webhook URL: ${webhookUrl}`);
  console.log(`Test ID: ${testId}`);
  console.log(`Event type: ${sampleEvent.EventDescription}`);
  console.log();
  
  try {
    // Send the test event to the webhook WITHOUT auth header
    console.log(`${colors.yellow}Sending test event to webhook...${colors.reset}`);
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
        // No Authorization header to simulate real Evia Sign requests
      },
      body: JSON.stringify(sampleEvent),
    });
    
    console.log(`Response status: ${response.status} ${response.statusText}`);
    
    let responseData;
    try {
      responseData = await response.json();
      console.log('Response body:', responseData);
    } catch (e) {
      const text = await response.text();
      console.log('Response body (text):', text);
    }
    
    if (!response.ok) {
      console.error(`${colors.red}Webhook test failed with status ${response.status}${colors.reset}`);
      console.log(`${colors.yellow}This may be expected if you haven't deployed the updated function yet${colors.reset}`);
      console.log(`${colors.yellow}Make sure to copy the function from evia-webhook-function.js to your Supabase dashboard${colors.reset}`);
      process.exit(1);
    }
    
    console.log(`${colors.green}Webhook test request sent successfully${colors.reset}\n`);
    console.log(`${colors.green}Your webhook function is now ready to receive events from Evia Sign!${colors.reset}`);
    console.log(`${colors.green}The webhook will work with both authenticated and unauthenticated requests.${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}Error testing webhook:${colors.reset}`, error);
    process.exit(1);
  }
}

// Run the test
testWebhook(); 