/**
 * Script to test the Evia webhook with a real agreement ID
 * 
 * Usage:
 * node scripts/test-evia-webhook-agreement.js
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

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

// Create Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(`${colors.red}Error: Supabase URL or key not found in .env file${colors.reset}`);
  console.log('Please ensure you have the following variables in your .env file:');
  console.log('  VITE_SUPABASE_URL=your-project-url');
  console.log('  VITE_SUPABASE_SERVICE_KEY=your-service-role-key (or VITE_SUPABASE_ANON_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Get the webhook URL from .env
const webhookUrl = process.env.VITE_EVIA_WEBHOOK_URL;

if (!webhookUrl) {
  console.error(`${colors.red}Error: Webhook URL not found in .env file${colors.reset}`);
  console.log('Please add VITE_EVIA_WEBHOOK_URL to your .env file');
  process.exit(1);
}

// First, get the real agreement
async function getAgreementInfo() {
  try {
    const { data, error } = await supabase
      .from('agreements')
      .select('id, eviasignreference')
      .eq('id', '540420ad-ea6f-46df-beb8-b8e54a86e978')
      .single();
    
    if (error) {
      throw new Error(`Error fetching agreement: ${error.message}`);
    }
    
    if (!data || !data.eviasignreference) {
      throw new Error('Agreement not found or eviasignreference is missing');
    }
    
    return data;
  } catch (error) {
    console.error(`${colors.red}Error getting agreement info:${colors.reset}`, error);
    process.exit(1);
  }
}

// Create a sample event that mimics an Evia Sign SignRequestReceived event
async function createSampleEvent() {
  const agreement = await getAgreementInfo();
  console.log(`${colors.blue}Found agreement with Evia Sign reference:${colors.reset} ${agreement.eviasignreference}`);
  
  return {
    RequestId: agreement.eviasignreference,
    UserName: "Kumara",
    Email: "weerakoonewk@gmail.com",
    Subject: "Rental Agreement",
    EventId: 1,
    EventDescription: "SignRequestReceived",
    EventTime: new Date().toISOString()
  };
}

async function testWebhook() {
  console.log(`${colors.blue}Testing Evia webhook with real agreement data...${colors.reset}\n`);
  
  // Get the event data
  const sampleEvent = await createSampleEvent();
  
  console.log(`Webhook URL: ${webhookUrl}`);
  console.log(`Test event:`);
  console.log(JSON.stringify(sampleEvent, null, 2));
  console.log();
  
  try {
    // Send the test event to the webhook
    console.log(`${colors.yellow}Sending test event to webhook...${colors.reset}`);
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
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
      process.exit(1);
    }
    
    console.log(`${colors.green}Webhook test request sent successfully${colors.reset}\n`);
    
    // Wait a moment for the event to be processed
    console.log(`${colors.yellow}Waiting for event to be processed...${colors.reset}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if the event was recorded in the database
    console.log(`${colors.yellow}Checking if event was recorded in webhook_events table...${colors.reset}`);
    
    const { data: events, error } = await supabase
      .from('webhook_events')
      .select('*')
      .eq('request_id', sampleEvent.RequestId)
      .order('createdat', { ascending: false })
      .limit(1);
    
    if (error) {
      console.error(`${colors.red}Error checking webhook_events table:${colors.reset}`, error);
      process.exit(1);
    }
    
    if (events && events.length > 0) {
      console.log(`${colors.green}Success! Event found in webhook_events table:${colors.reset}`);
      console.log(JSON.stringify(events[0], null, 2));
    } else {
      console.log(`${colors.red}No event found in webhook_events table${colors.reset}`);
      console.log('This might indicate an issue with the webhook function or database permissions');
    }
    
    console.log(`\n${colors.green}Webhook test completed${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}Error testing webhook:${colors.reset}`, error);
    process.exit(1);
  }
}

// Run the test
testWebhook(); 