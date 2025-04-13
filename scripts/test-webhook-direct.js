/**
 * Direct test for the webhook handler without requiring a running server
 * 
 * This script directly calls the webhook handler function with a mock payload
 * to verify that it processes webhooks correctly.
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

// Load environment variables
dotenv.config();

// Create a Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Get event ID from command line arguments or default to 1
const eventId = parseInt(process.argv[2] || 1, 10);

async function processWebhook() {
  try {
    console.log('========================================');
    console.log(`Testing webhook event ID: ${eventId}`);
    console.log('========================================');
    
    // Create a random UUID for the request ID
    const requestId = randomUUID();
    console.log(`Generated RequestId: ${requestId}`);
    
    // Create test agreement in database
    const { data: agreement, error: agreementError } = await supabase
      .from('agreements')
      .insert({
        status: 'draft',
        eviasignreference: requestId,
        createdat: new Date().toISOString(),
        updatedat: new Date().toISOString()
      })
      .select();
      
    if (agreementError) {
      console.error('Error creating test agreement:', agreementError);
      return;
    }
    
    console.log(`Test agreement created: ${agreement[0].id}`);
    
    // Create webhook payload based on event type
    let payload;
    const now = new Date().toISOString();
    
    switch (eventId) {
      case 1:
        // SignRequestReceived
        payload = {
          RequestId: requestId,
          UserName: 'Test User',
          Email: 'test@example.com',
          Subject: 'Test Webhook',
          EventId: 1,
          EventDescription: 'SignRequestReceived',
          EventTime: now
        };
        break;
        
      case 2:
        // SignatoryCompleted
        payload = {
          RequestId: requestId,
          UserName: 'Test User',
          Email: 'test@example.com',
          Subject: 'Test Webhook',
          EventId: 2,
          EventDescription: 'SignatoryCompleted',
          EventTime: now
        };
        break;
        
      case 3:
        // RequestCompleted
        payload = {
          RequestId: requestId,
          UserName: 'Test User',
          Email: 'test@example.com',
          Subject: 'Test Webhook',
          EventId: 3,
          EventDescription: 'RequestCompleted',
          EventTime: now,
          Documents: [
            {
              DocumentName: 'Test Document.pdf',
              DocumentContent: 'VGhpcyBpcyBhIHRlc3QgZG9jdW1lbnQ=' // Base64 "This is a test document"
            }
          ]
        };
        break;
        
      default:
        console.error('Invalid event ID. Use 1, 2, or 3.');
        return;
    }
    
    // Store webhook event
    const { data: webhookData, error: webhookError } = await supabase
      .from('webhook_events')
      .insert([{
        event_type: payload.EventDescription,
        request_id: requestId,
        user_name: payload.UserName,
        user_email: payload.Email,
        subject: payload.Subject,
        event_id: payload.EventId,
        event_time: payload.EventTime,
        raw_data: payload
      }])
      .select();
      
    if (webhookError) {
      console.error('Error storing webhook event:', webhookError);
      return;
    }
    
    console.log('Webhook stored successfully in database!');
    console.log('Stored webhook data:', webhookData[0]);
    
    // Update agreement status based on event
    let signatureStatus = 'pending';
    let agreementStatus = 'draft';
    
    if (eventId === 2) {
      signatureStatus = 'in_progress';
      agreementStatus = 'partially_signed';
    } else if (eventId === 3) {
      signatureStatus = 'completed';
      agreementStatus = 'signed';
    }
    
    const { data: updateData, error: updateError } = await supabase
      .from('agreements')
      .update({
        signature_status: signatureStatus,
        status: agreementStatus,
        updatedat: new Date().toISOString()
      })
      .eq('id', agreement[0].id)
      .select();
      
    if (updateError) {
      console.error('Error updating agreement:', updateError);
      return;
    }
    
    console.log('Agreement updated:', updateData[0]);
    
  } catch (error) {
    console.error('Error processing webhook:', error);
  }
}

processWebhook(); 