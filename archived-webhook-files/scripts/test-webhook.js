/**
 * Simple script to test if the webhook endpoint is accessible
 * 
 * Usage:
 * node scripts/test-webhook.js
 */

// Use dotenv in ES module format
import dotenv from 'dotenv';
import fetch from 'node-fetch';
dotenv.config();

// Get the webhook URL from environment variables
const webhookUrl = process.env.VITE_EVIA_WEBHOOK_URL;
if (!webhookUrl) {
  console.error('❌ VITE_EVIA_WEBHOOK_URL is not defined in .env file');
  process.exit(1);
}

console.log(`Testing webhook URL: ${webhookUrl}`);

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

// Send a request to the webhook endpoint
try {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(testPayload),
  });
  
  console.log(`Response status: ${response.status} ${response.statusText}`);
  
  const text = await response.text();
  try {
    // Try to parse the response as JSON
    const json = JSON.parse(text);
    console.log('Response body:', json);
  } catch (e) {
    // If the response is not valid JSON, just show the raw text
    console.log('Response body (text):', text);
  }
  
  console.log('✅ Webhook test completed');
} catch (error) {
  console.error('❌ Error testing webhook:', error.message);
  
  if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    console.error('\nThe webhook URL is not accessible. Possible reasons:');
    console.error('1. The Supabase function is not deployed or not running');
    console.error('2. The URL is incorrect in your .env file');
    console.error('3. The Supabase function has network restrictions');
    console.error('\nPlease follow the manual deployment guide in docs/manual-webhook-deployment.md');
  }
} 