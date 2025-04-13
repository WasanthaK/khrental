/**
 * Evia Sign Webhook Handler
 * 
 * This module provides a centralized handler for Evia Sign webhook events.
 * It receives webhook notifications from Evia Sign when document status changes,
 * processes them, and updates the database accordingly.
 * 
 * Webhook events handled:
 * - SignRequestReceived (EventId: 1): Initial request created
 * - SignatoryCompleted (EventId: 2): Individual signatory has signed
 * - RequestCompleted (EventId: 3): All signatories have completed, document is fully signed
 * 
 * @module api/evia-sign/webhookHandler
 */

import { supabase } from '../../services/supabaseClient';

/**
 * Main handler for Evia Sign webhook events
 * This function processes the webhook payload and updates the database accordingly
 * 
 * @param {Object} payload - The webhook payload from Evia Sign
 * @returns {Promise<Object>} - Processing result
 */
export async function handleSignatureWebhook(payload) {
  try {
    console.log('=============================================');
    console.log('🔔 WEBHOOK RECEIVED FROM EVIA SIGN SERVICE 🔔');
    console.log('=============================================');
    console.log('Webhook payload:', {
      eventId: payload.EventId,
      eventDescription: payload.EventDescription,
      requestId: payload.RequestId,
      userName: payload.UserName,
      email: payload.Email,
      hasDocuments: !!payload.Documents
    });

    // Extract data from the webhook payload
    const { 
      RequestId, 
      EventId, 
      EventDescription, 
      UserName, 
      Email, 
      Subject,
      EventTime, 
      Documents 
    } = payload;

    // Basic validation
    if (!RequestId || !EventId) {
      throw new Error('Invalid webhook payload: missing required fields');
    }

    // Store the webhook event in the database for audit purposes
    await storeWebhookEvent(payload);

    // Map event type to status using the central mapping
    let status = mapEventToStatus(EventId);
    
    console.log(`Webhook: ${EventDescription} for ${RequestId}, setting status to ${status}`);

    // Find the agreement using the RequestId
    const agreement = await findAgreement(RequestId);
    
    // Process the webhook based on event type
    switch (EventId) {
      case 1: // SignRequestReceived
        return await handleSignRequestReceived(agreement);
        
      case 2: // SignatoryCompleted
        return await handleSignatoryCompleted(agreement, UserName, Email, EventTime);
        
      case 3: // RequestCompleted
        return await handleRequestCompleted(agreement, EventTime, Documents);
        
      default:
        console.warn(`Unknown event type: ${EventId}`);
        return { 
          success: false, 
          message: `Unknown event type: ${EventId}` 
        };
    }
  } catch (error) {
    console.error('Webhook processing error:', error);
    return { 
      success: false, 
      error: error.message || 'Error processing webhook' 
    };
  }
}

/**
 * HTTP request handler for API routes
 * This function can be used with various HTTP frameworks (Express, Next.js, etc.)
 * 
 * @param {Request} req - The HTTP request object
 * @returns {Promise<Response>} - The HTTP response
 */
export async function webhookRequestHandler(req) {
  try {
    // Verify request method
    if (req.method !== 'POST') {
      return createResponse('Method not allowed', 405);
    }

    // Get request body (handle different frameworks)
    const payload = req.body || await req.json();
    
    // Process the webhook
    const result = await handleSignatureWebhook(payload);

    // Return success or error response
    if (result.success === false) {
      return createResponse({ error: result.error || 'Failed to process webhook' }, 400);
    } else {
      return createResponse(result, 200);
    }
  } catch (error) {
    console.error('Error handling webhook request:', error);
    return createResponse({ error: error.message || 'Internal server error' }, 500);
  }
}

/**
 * Next.js API route handler
 * This is the handler function for Next.js API routes
 * 
 * @param {Object} req - Next.js request object
 * @param {Object} res - Next.js response object
 */
export async function nextApiHandler(req, res) {
  try {
    // Log incoming webhook request for debugging
    console.log('🔔 WEBHOOK REQUEST RECEIVED:', {
      method: req.method,
      url: req.url,
      headers: {
        'content-type': req.headers['content-type'],
        'content-length': req.headers['content-length']
      }
    });

    // Verify request method
    if (req.method !== 'POST') {
      console.log('❌ WEBHOOK ERROR: Method not allowed:', req.method);
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Log the body size to check if we're getting data
    console.log('📦 WEBHOOK BODY SIZE:', 
      req.body ? JSON.stringify(req.body).length : 'empty body'
    );

    // Process the webhook
    const result = await handleSignatureWebhook(req.body);

    // Return response
    if (result.success === false) {
      console.log('❌ WEBHOOK PROCESSING ERROR:', result.error);
      return res.status(400).json({ error: result.error || 'Failed to process webhook' });
    } else {
      console.log('✅ WEBHOOK PROCESSED SUCCESSFULLY:', result.message);
      return res.status(200).json(result);
    }
  } catch (error) {
    console.error('❌ WEBHOOK HANDLER ERROR:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// ========== Helper functions ==========

/**
 * Create a standardized HTTP response
 * Works with different HTTP frameworks
 */
function createResponse(data, status = 200) {
  // Check if we're in a Node.js environment with Response global
  if (typeof Response !== 'undefined') {
    return new Response(
      typeof data === 'string' ? data : JSON.stringify(data),
      {
        status,
        headers: {
          'Content-Type': typeof data === 'string' ? 'text/plain' : 'application/json'
        }
      }
    );
  }
  
  // Fallback for environments without Response global
  return {
    status,
    body: data,
    headers: {
      'Content-Type': typeof data === 'string' ? 'text/plain' : 'application/json'
    }
  };
}

/**
 * Map Evia Sign event ID to status string
 */
function mapEventToStatus(eventId) {
  switch (eventId) {
    case 1: return 'pending';
    case 2: return 'in_progress';
    case 3: return 'completed';
    default: return 'unknown';
  }
}

/**
 * Store webhook event in the database
 */
async function storeWebhookEvent(payload) {
  try {
    // First check if the webhook_events table exists and has expected columns
    try {
      // Check if the table has a text column for request_id
      const { data: columns, error: columnsError } = await supabase
        .from('webhook_events')
        .select('request_id')
        .limit(1);
      
      if (columnsError) {
        console.log('⚠️ Column check failed, will try to use request_id as text');
        
        // Attempt to create the table with the right schema if needed
        await supabase.rpc('exec_sql', {
          query: `
            DO $$
            BEGIN
              -- Check if the webhook_events table exists
              IF NOT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'webhook_events'
              ) THEN
                -- Create the table with proper columns if it doesn't exist
                CREATE TABLE webhook_events (
                  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                  event_type text,
                  request_id text, -- Use text instead of UUID for flexibility
                  user_name text,
                  user_email text,
                  subject text,
                  event_id integer,
                  event_time timestamp with time zone,
                  raw_data jsonb,
                  createdat timestamp with time zone DEFAULT NOW(),
                  updatedat timestamp with time zone DEFAULT NOW(),
                  processed boolean DEFAULT false
                );
                
                RAISE NOTICE 'Created webhook_events table with text request_id';
              ELSE
                -- Check if request_id is UUID type and needs to be changed to text
                IF EXISTS (
                  SELECT FROM information_schema.columns 
                  WHERE table_schema = 'public' 
                  AND table_name = 'webhook_events'
                  AND column_name = 'request_id'
                  AND data_type = 'uuid'
                ) THEN
                  -- Alter the column type
                  ALTER TABLE webhook_events 
                  ALTER COLUMN request_id TYPE text;
                  
                  RAISE NOTICE 'Altered request_id column to text type';
                END IF;
              END IF;
            END
            $$;
          `
        });
      }
    } catch (schemaError) {
      console.error('⚠️ Error checking schema:', schemaError);
      // Continue anyway, we'll handle errors later
    }
    
    // Normalize request_id to ensure it's treated consistently
    let requestId = payload.RequestId;
    
    // Validate the request ID format
    if (!requestId) {
      console.error('❌ Invalid webhook: missing RequestId');
      return;
    }
    
    // Log the request for debugging
    console.log('📝 Storing webhook event:', {
      RequestId: requestId,
      EventId: payload.EventId,
      EventDescription: payload.EventDescription,
      UserEmail: payload.Email,
      hasDocuments: !!payload.Documents
    });
    
    // Store the webhook event
    const { data, error } = await supabase
      .from('webhook_events')
      .insert([{
        event_type: payload.EventDescription || 'unknown',
        request_id: requestId.toString(), // Ensure it's a string
        user_name: payload.UserName || null,
        user_email: payload.Email || null,
        subject: payload.Subject || null,
        event_id: payload.EventId || null,
        event_time: payload.EventTime || new Date().toISOString(),
        raw_data: payload
      }])
      .select();

    if (error) {
      console.error('❌ Error storing webhook event:', error);
      
      // Try with a more flexible approach if the first attempt fails
      console.log('⚠️ Trying alternative storage approach...');
      
      const { data: altData, error: altError } = await supabase
        .from('webhook_events')
        .insert([{
          event_type: payload.EventDescription || 'unknown',
          // Include RequestId in subject field as a fallback
          subject: `${payload.Subject || ''} (RequestId: ${requestId})`,
          user_name: payload.UserName || null,
          user_email: payload.Email || null,
          event_id: payload.EventId || null,
          event_time: payload.EventTime || new Date().toISOString(),
          raw_data: payload
        }])
        .select();
        
      if (altError) {
        console.error('❌ Alternative storage also failed:', altError);
      } else {
        console.log('✅ Webhook stored with alternative approach:', altData[0]?.id);
      }
    } else {
      console.log('✅ Webhook event stored in database:', data[0]?.id);
    }
  } catch (err) {
    console.error('❌ Failed to store webhook event:', err);
    // Continue execution even if storage fails
  }
}

/**
 * Find agreement by Evia Sign reference ID
 */
async function findAgreement(requestId) {
  // Find the agreement with this reference ID
  const { data: agreement, error } = await supabase
    .from('agreements')
    .select('*')
    .eq('eviasignreference', requestId)
    .single();

  if (error) {
    console.error('Error finding agreement:', error);
    throw new Error(`Agreement not found for RequestId: ${requestId}`);
  }
    
  if (!agreement) {
    console.error('No agreement found for RequestId:', requestId);
    throw new Error(`No agreement found for RequestId: ${requestId}`);
  }

  console.log('Found agreement:', {
    id: agreement.id,
    status: agreement.status,
    signature_status: agreement.signature_status
  });

  return agreement;
}

/**
 * Update agreement status in the database
 */
async function updateAgreementStatus(agreementId, updates) {
  try {
    console.log(`Updating agreement ${agreementId} with:`, updates);
    
    // Ensure JSON data is valid for Postgres
    const sanitizedUpdates = { ...updates };
    
    // If there's a signatories_status array, make sure it's valid JSON
    if (sanitizedUpdates.signatories_status && !Array.isArray(sanitizedUpdates.signatories_status)) {
      sanitizedUpdates.signatories_status = [];
    }
    
    const { data, error } = await supabase
      .from('agreements')
      .update({
        ...sanitizedUpdates,
        updatedat: new Date().toISOString()
      })
      .eq('id', agreementId)
      .select();

    if (error) {
      console.error('Error updating agreement:', error);
      throw error;
    }
    
    console.log('Agreement updated successfully:', data);
    return data;
  } catch (err) {
    console.error('Error in updateAgreementStatus:', err);
    throw err;
  }
}

/**
 * Handle the SignRequestReceived event (EventId: 1)
 */
async function handleSignRequestReceived(agreement) {
  console.log('Processing SignRequestReceived event');
  
  await updateAgreementStatus(agreement.id, {
    signature_status: 'pending',
    signatories_status: []
  });
  
  return { 
    success: true, 
    message: 'Processed SignRequestReceived event' 
  };
}

/**
 * Handle the SignatoryCompleted event (EventId: 2)
 */
async function handleSignatoryCompleted(agreement, userName, email, eventTime) {
  console.log('Processing SignatoryCompleted event for:', email);
  
  // Get current signatories status
  const { data: currentAgreement } = await supabase
    .from('agreements')
    .select('signatories_status')
    .eq('id', agreement.id)
    .single();

  // Create signatories_status array if it doesn't exist
  const currentSignatories = currentAgreement?.signatories_status || [];
  const updatedSignatories = Array.isArray(currentSignatories) 
    ? [...currentSignatories] 
    : [];
  
  // Update or add signatory
  const signatoryIndex = updatedSignatories.findIndex(s => s.email === email);
  
  if (signatoryIndex >= 0) {
    updatedSignatories[signatoryIndex] = {
      ...updatedSignatories[signatoryIndex],
      status: 'completed',
      signedAt: eventTime
    };
  } else {
    updatedSignatories.push({
      name: userName,
      email: email,
      status: 'completed',
      signedAt: eventTime
    });
  }

  console.log('Updating signatory status:', updatedSignatories);
  
  await updateAgreementStatus(agreement.id, {
    signature_status: 'in_progress',
    signatories_status: updatedSignatories
  });
  
  return { 
    success: true, 
    message: 'Processed SignatoryCompleted event' 
  };
}

/**
 * Handle the RequestCompleted event (EventId: 3)
 */
async function handleRequestCompleted(agreement, eventTime, documents) {
  console.log('Processing RequestCompleted event');
  
  let signedPdfUrl = null;
  
  if (documents && documents.length > 0) {
    console.log('Signed document received in webhook');
    try {
      signedPdfUrl = await uploadSignedDocument(documents[0], agreement.id);
      console.log('Uploaded signed document:', signedPdfUrl);
    } catch (error) {
      console.error('Error uploading signed document:', error);
      // Continue even if document upload fails
    }
  } else {
    console.log('No documents attached to webhook - agreement will be marked as completed without document');
  }

  console.log('Updating agreement to signed status');
  
  await updateAgreementStatus(agreement.id, {
    status: 'signed',
    signature_status: 'completed',
    signeddate: new Date(eventTime).toISOString(),
    signatureurl: signedPdfUrl
  });
  
  return { 
    success: true, 
    message: 'Processed RequestCompleted event',
    documentUrl: signedPdfUrl
  };
}

/**
 * Upload signed document to Supabase storage
 */
async function uploadSignedDocument(signedDoc, agreementId) {
  try {
    if (!signedDoc || !signedDoc.DocumentContent) {
      throw new Error('Invalid document data: DocumentContent is missing');
    }
    
    // Get document name or create one
    const documentName = signedDoc.DocumentName || `signed_agreement_${agreementId}.pdf`;
    
    console.log(`Preparing to upload signed document: ${documentName}`);
    
    // Convert base64 to blob
    const byteCharacters = atob(signedDoc.DocumentContent);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'application/pdf' });
    
    // Upload to Supabase Storage
    const fileName = `signed_${agreementId}_${Date.now()}.pdf`;
    const filePath = `agreements/${fileName}`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('files')
      .upload(filePath, blob, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw uploadError;
    }
    
    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('files')
      .getPublicUrl(filePath);
    
    if (!urlData || !urlData.publicUrl) {
      throw new Error('Failed to get public URL for signed document');
    }
    
    return urlData.publicUrl;
  } catch (error) {
    console.error('Error uploading signed document:', error);
    throw error;
  }
}

/**
 * Get signature status from webhook events
 * This function is used as a fallback when the Evia Sign API fails
 * 
 * @param {string} requestId - The Evia Sign request ID
 * @returns {Promise<Object>} - Status information from stored webhook events
 */
export async function getSignatureStatusFromWebhooks(requestId) {
  try {
    console.log('[webhookHandler] Getting signature status from stored webhook events for:', requestId);
    
    // Get all webhook events for this request ID
    let { data: webhookEvents, error } = await supabase
      .from('webhook_events')
      .select('*')
      .eq('request_id', requestId)
      .order('event_time', { ascending: false })
      .limit(20);
      
    if (error) throw error;
    
    if (!webhookEvents || webhookEvents.length === 0) {
      console.log('[webhookHandler] No webhook events found for request ID:', requestId);
      
      // Check if this is a UUID format issue by trying it as a string
      // Some systems might store it as UUID, while others as string
      const { data: stringEvents } = await supabase
        .from('webhook_events')
        .select('*')
        .ilike('request_id', `%${requestId}%`)
        .order('event_time', { ascending: false })
        .limit(5);
        
      if (stringEvents && stringEvents.length > 0) {
        console.log(`[webhookHandler] Found events using substring match: ${stringEvents.length}`);
        webhookEvents = stringEvents;
      } else {
        return { 
          success: false, 
          error: 'No webhook events found for this request ID',
          notFound: true
        };
      }
    }
    
    console.log(`[webhookHandler] Found ${webhookEvents.length} webhook events for request ID:`, requestId);
    
    // Get latest event by type (priority: RequestCompleted > SignatoryCompleted > SignRequestReceived)
    const completedEvent = webhookEvents.find(event => event.event_id === 3);
    if (completedEvent) {
      console.log('[webhookHandler] Found completed event (EventId: 3)');
      
      // Check for document content in the raw data
      let documentUrl = null;
      try {
        const rawData = completedEvent.raw_data || {};
        if (rawData.Documents && rawData.Documents.length > 0) {
          // Found document content - we could process/store it here if needed
          console.log('[webhookHandler] Completed event includes document content');
        }
      } catch (docError) {
        console.error('[webhookHandler] Error processing document from webhook:', docError);
      }
      
      // Get signatories information from other events
      const signatoryEvents = webhookEvents.filter(event => event.event_id === 2);
      const signatories = signatoryEvents.map(event => ({
        name: event.user_name || '',
        email: event.user_email || '',
        status: 'completed',
        completedAt: event.event_time
      }));
      
      return {
        success: true,
        status: 'completed',
        signatories: signatories,
        completed: true,
        fromWebhook: true,
        webhookEvent: completedEvent,
        webhookTimestamp: completedEvent.event_time || completedEvent.createdat
      };
    }
    
    const signatoryEvents = webhookEvents.filter(event => event.event_id === 2);
    if (signatoryEvents.length > 0) {
      console.log(`[webhookHandler] Found ${signatoryEvents.length} signatory completed events (EventId: 2)`);
      
      // Extract signatory information from events
      const signatories = signatoryEvents.map(event => ({
        name: event.user_name || '',
        email: event.user_email || '',
        status: 'completed',
        completedAt: event.event_time
      }));
      
      return {
        success: true,
        status: 'in_progress',
        signatories,
        completed: false,
        fromWebhook: true,
        webhookEvent: signatoryEvents[0],
        latestEventTime: signatoryEvents[0].event_time || signatoryEvents[0].createdat
      };
    }
    
    const requestEvent = webhookEvents.find(event => event.event_id === 1);
    if (requestEvent) {
      console.log('[webhookHandler] Found sign request received event (EventId: 1)');
      return {
        success: true,
        status: 'pending',
        signatories: [],
        completed: false,
        fromWebhook: true,
        webhookEvent: requestEvent,
        requestTimestamp: requestEvent.event_time || requestEvent.createdat
      };
    }
    
    // If we reach here, we have webhook events but none of the expected types
    console.log('[webhookHandler] Found webhook events but none of the expected types');
    const latestEvent = webhookEvents[0];
    return {
      success: true,
      status: 'unknown',
      fromWebhook: true,
      events: webhookEvents.map(e => ({ id: e.id, type: e.event_type, eventId: e.event_id, time: e.event_time })),
      latestEvent: latestEvent
    };
    
  } catch (error) {
    console.error('[webhookHandler] Error getting status from webhook events:', error);
    return {
      success: false,
      error: `Error retrieving webhook events: ${error.message}`
    };
  }
} 