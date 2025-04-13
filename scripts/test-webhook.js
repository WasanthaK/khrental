/**
 * Test script for sending mock webhooks to the Evia Sign webhook endpoint
 * Run this script to verify that the webhook handling is working correctly
 * 
 * Usage: node scripts/test-webhook.js [event-type]
 * Where event-type is one of: 1 (SignRequestReceived), 2 (SignatoryCompleted), 3 (RequestCompleted)
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { config } from 'dotenv';
import { setTimeout } from 'timers/promises';

// Load environment variables from .env file
config();

// Get the Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Default webhook endpoint - use your local development server 
// or the actual production endpoint
const WEBHOOK_URL = process.env.WEBHOOK_TEST_URL || 'http://localhost:5174/api/evia-webhook';

// Event types
const EVENT_TYPES = {
  1: 'SignRequestReceived',
  2: 'SignatoryCompleted',
  3: 'RequestCompleted'
};

// Get event type from command line argument
const eventId = parseInt(process.argv[2]) || 1;
const eventType = EVENT_TYPES[eventId] || 'SignRequestReceived';

// Create a test agreement in the database
async function createTestAgreement(requestId) {
  try {
    console.log('Creating test agreement in database...');
    
    const { data, error } = await supabase
      .from('agreements')
      .insert([{
        status: 'draft',
        eviasignreference: requestId,
        createdat: new Date().toISOString(),
        updatedat: new Date().toISOString(),
        terms: {
          monthlyRent: 1000,
          depositAmount: 2000,
          paymentDueDay: 1,
          noticePeriod: 30
        },
        signature_status: 'pending'
      }])
      .select();
      
    if (error) {
      console.error('Error creating test agreement:', error);
      return null;
    }
    
    console.log('Test agreement created:', data[0]?.id);
    return data[0]?.id;
  } catch (err) {
    console.error('Failed to create test agreement:', err);
    return null;
  }
}

// Function to send mock webhook
async function sendMockWebhook() {
  try {
    console.log('========================================');
    console.log(`Sending mock webhook for event: ${eventType} (EventId: ${eventId})`);
    console.log('========================================');
    
    // Generate a unique request ID
    const requestId = randomUUID();
    console.log('Generated RequestId:', requestId);
    
    // Create a test agreement in the database
    const agreementId = await createTestAgreement(requestId);
    
    // Create webhook payload
    const payload = {
      RequestId: requestId,
      UserName: 'Test User',
      Email: 'test@example.com',
      Subject: 'Test Webhook',
      EventId: eventId,
      EventDescription: eventType,
      EventTime: new Date().toISOString()
    };
    
    // Add document content for RequestCompleted event
    if (eventId === 3) {
      payload.Documents = [{
        DocumentName: 'test-document.pdf',
        DocumentContent: 'VGhpcyBpcyBhIHRlc3QgZG9jdW1lbnQ=' // Base64 for "This is a test document"
      }];
    }
    
    console.log('Sending webhook to:', WEBHOOK_URL);
    
    // Send webhook request
    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Webhook sent successfully!');
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
    
    // Check if webhook was stored in database
    console.log('Checking if webhook was stored in database...');
    
    // Using Promise-based setTimeout instead of callback-based
    await setTimeout(2000);
    
    try {
      const { data, error } = await supabase
        .from('webhook_events')
        .select('*')
        .eq('request_id', requestId.toString())
        .order('createdat', { ascending: false });
        
      if (error) {
        console.error('Error checking database:', error);
      } else if (data && data.length > 0) {
        console.log('Webhook stored successfully in database!');
        console.log('Stored webhook data:', data[0]);
        
        // Check if agreement was updated
        if (agreementId) {
          const { data: agreement, error: agreementError } = await supabase
            .from('agreements')
            .select('*')
            .eq('id', agreementId)
            .single();
            
          if (agreementError) {
            console.error('Error checking agreement:', agreementError);
          } else {
            console.log('Agreement updated:', {
              status: agreement.status,
              signature_status: agreement.signature_status
            });
          }
        }
      } else {
        console.log('Webhook not found in database');
      }
    } catch (err) {
      console.error('Error checking database:', err);
    }
  } catch (error) {
    console.error('Error sending webhook:', error);
    console.error('Response status:', error.response?.status);
    console.error('Response data:', error.response?.data);
  }
}

// Run the test
sendMockWebhook(); 