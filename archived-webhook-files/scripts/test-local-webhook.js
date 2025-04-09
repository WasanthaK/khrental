/**
 * Script to test the local webhook handler for Evia Sign
 * 
 * Usage: node scripts/test-local-webhook.js
 */

import fetch from 'node-fetch';

// URL of the local webhook endpoint
const WEBHOOK_URL = 'http://localhost:5173/api/evia-webhook';

// Create a sample webhook payload for a signature received event
const samplePayload = {
  RequestId: 'test-request-' + Date.now(),
  EventId: 1,
  EventDescription: 'SignRequestReceived',
  UserName: 'Test User',
  Email: 'test@example.com',
  Subject: 'Test Document',
  EventTime: new Date().toISOString()
};

// Send the request to the webhook endpoint
async function testWebhook() {
  try {
    console.log(`Testing webhook at ${WEBHOOK_URL} with payload:`, samplePayload);
    
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(samplePayload)
    });
    
    console.log(`Response status: ${response.status} ${response.statusText}`);
    
    const responseData = await response.json();
    console.log('Response data:', responseData);
    
    console.log('\nWebhook test completed successfully!');
  } catch (error) {
    console.error('Error testing webhook:', error);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\nCould not connect to the webhook endpoint. Make sure your application is running.');
    }
  }
}

// Run the test
testWebhook();

// After 2 seconds, also test a completion event
setTimeout(() => {
  const completionPayload = {
    RequestId: samplePayload.RequestId,
    EventId: 3,
    EventDescription: 'RequestCompleted',
    UserName: 'Test User',
    Email: 'test@example.com',
    Subject: 'Test Document',
    EventTime: new Date().toISOString(),
    Documents: [{
      DocumentName: 'test-document.pdf',
      DocumentContent: 'JVBERi0xLjcNCiW1tbW1DQoxIDAgb2JqDQo8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFIvTGFuZyhlbi1VUykgL1N0cnVjdFRyZWVSb290IDMwIDAgUi9NYXJrSW5mbzw8L01hcmtlZCB0cnVlPj4vTWV0YWRhdGEgOTkgMCBSL1ZpZXdlclByZWZlcmVuY2VzIDEwMCAwIFI+Pg0KZW5kb2JqDQoyIDAgb2JqDQo8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1sgMyAwIFIgXSA+Pg0KZW5kb2JqDQozIDAgb2JqDQo' // shortened base64 data
    }]
  };
  
  console.log('\nTesting completion webhook with payload:', completionPayload);
  
  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(completionPayload)
  })
  .then(response => {
    console.log(`Completion response status: ${response.status} ${response.statusText}`);
    return response.json();
  })
  .then(data => {
    console.log('Completion response data:', data);
    console.log('\nCompletion webhook test completed successfully!');
  })
  .catch(error => {
    console.error('Error testing completion webhook:', error);
  });
}, 2000); 