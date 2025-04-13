// Test sending a webhook to the Azure deployment
import fetch from 'node-fetch';
import { randomUUID } from 'crypto';

// Get event ID from command line arguments or default to 1
const eventId = parseInt(process.argv[2] || 1, 10);
const azureUrl = 'https://khrental.azurewebsites.net/api/webhooks/evia';

// Map event IDs to event descriptions
const EVENT_TYPES = {
  1: 'SignRequestReceived',
  2: 'SignatoryCompleted', 
  3: 'RequestCompleted'
};

async function sendAzureWebhook() {
  try {
    console.log('========================================');
    console.log(`Sending webhook to: ${azureUrl}`);
    console.log(`Event: ${EVENT_TYPES[eventId]} (EventId: ${eventId})`);
    console.log('========================================');
    
    // Create payload
    const requestId = randomUUID();
    const payload = {
      RequestId: requestId,
      UserName: 'Azure Test User',
      Email: 'azuretest@example.com',
      Subject: 'Azure Webhook Test',
      EventId: eventId,
      EventDescription: EVENT_TYPES[eventId],
      EventTime: new Date().toISOString()
    };
    
    if (eventId === 3) {
      // Add sample document for RequestCompleted events
      payload.Documents = [{
        DocumentName: 'azure-test-document.pdf',
        DocumentContent: 'VGhpcyBpcyBhIHRlc3QgZG9jdW1lbnQ=' // Base64 encoded "This is a test document"
      }];
    }
    
    console.log('Sending payload:', JSON.stringify(payload, null, 2));
    
    // Send webhook
    const response = await fetch(azureUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('Response status:', response.status);
      console.log('Response data:', JSON.stringify(data, null, 2));
      console.log('✅ Webhook sent successfully!');
    } else {
      console.error('❌ Error sending webhook:', response.status, response.statusText);
      const text = await response.text();
      console.error('Response:', text);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

sendAzureWebhook(); 