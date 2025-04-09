// Follow this setup guide to integrate the Deno runtime:
// https://deno.com/manual/examples/supabase_functions

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.26.0';

// Create a Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(supabaseUrl, supabaseKey);

// Table name for storing webhook events
const WEBHOOK_TABLE = 'webhook_events';

// Event types from Evia Sign API
const EVIA_EVENTS = {
  SIGN_REQUEST_RECEIVED: 1,
  SIGNATORY_COMPLETED: 2,
  REQUEST_COMPLETED: 3
};

// CORS headers for preflight requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization'
};

// Simplified serve function - NO AUTH CHECKS
serve(async (req) => {
  try {
    // Log all request details for debugging
    console.log('==== WEBHOOK REQUEST RECEIVED ====');
    console.log('Method:', req.method);
    console.log('Headers:', JSON.stringify(Array.from(req.headers.entries())));
    console.log('URL:', req.url);
    
    // Always handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }
    
    // Always log the full request body
    let requestBody = await req.text();
    console.log('Raw request body:', requestBody);
    
    let payload;
    try {
      // Try to parse as JSON
      payload = JSON.parse(requestBody);
      console.log('Parsed payload:', payload);
    } catch (e) {
      console.error('Error parsing webhook payload as JSON:', e);
      // Continue anyway to save the raw data
      payload = { raw_content: requestBody };
    }

    // Insert the webhook event into the database - SIMPLE VERSION
    const insertData = {
      event_type: payload.EventDescription || 'unknown',
      request_id: payload.RequestId || null,
      user_name: payload.UserName || null, 
      user_email: payload.Email || null,
      subject: payload.Subject || null,
      event_id: payload.EventId || null,
      event_time: payload.EventTime || new Date().toISOString(),
      raw_data: payload,
      processed: false // Include processed field, we can handle if it doesn't exist
    };
    
    console.log('Attempting to store webhook event...');
    let storedEvent = null;
    
    try {
      // Try to insert the data
      const { data, error } = await supabase
        .from(WEBHOOK_TABLE)
        .insert([insertData])
        .select();
        
      if (error) {
        // If the error is about processed column, try without it
        if (error.message?.includes('column "processed" does not exist')) {
          delete insertData.processed;
          console.log('Retrying without processed column');
          
          const retryResult = await supabase
            .from(WEBHOOK_TABLE)
            .insert([insertData])
            .select();
            
          if (retryResult.error) {
            throw new Error(`Retry insert failed: ${retryResult.error.message}`);
          }
          
          storedEvent = retryResult.data && retryResult.data[0];
          console.log('Event stored successfully without processed column');
        } else {
          throw error;
        }
      } else {
        storedEvent = data && data[0];
        console.log('Event stored successfully with processed column');
      }
    } catch (error) {
      console.error('Failed to store webhook event:', error);
      // Even if DB storage fails, don't fail the webhook - just log it
      console.log('Continuing with webhook processing despite database error');
    }
    
    // Process the event if possible
    try {
      if (payload.RequestId) {
        await processEviaSignEvent(payload);
      }
    } catch (error) {
      console.error('Error processing event (non-critical):', error);
    }
    
    // Always return success to prevent retries
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Webhook received and processed',
        id: storedEvent?.id || 'unknown'
      }),
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'application/json', 
          ...corsHeaders 
        } 
      }
    );
  } catch (error) {
    console.error('Unhandled webhook error:', error);
    // Always return a 200 success even if there's an error, to prevent retries
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Webhook received but encountered processing error',
        error: error.message
      }),
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        } 
      }
    );
  }
});

/**
 * Process an Evia Sign webhook event and update the corresponding agreement
 * @param {Object} payload - The webhook payload
 */
async function processEviaSignEvent(payload) {
  try {
    const { RequestId, EventId, UserName, Email, EventDescription, EventTime, Documents } = payload;
    
    if (!RequestId) {
      console.error('Missing RequestId in webhook payload');
      return;
    }

    // Find the agreement with this eviasignreference
    const { data: agreement, error: fetchError } = await supabase
      .from('agreements')
      .select('*')
      .eq('eviasignreference', RequestId)
      .single();

    if (fetchError) {
      console.error('Error fetching agreement:', fetchError);
      return;
    }

    if (!agreement) {
      console.error(`No agreement found with Evia Sign reference: ${RequestId}`);
      return;
    }

    // Handle different event types
    switch (EventId) {
      case EVIA_EVENTS.SIGN_REQUEST_RECEIVED:
        await updateAgreement(agreement.id, {
          signature_status: 'pending',
          signatories_status: []
        });
        break;

      case EVIA_EVENTS.SIGNATORY_COMPLETED:
        // Get current signatories status
        const { data: currentAgreement } = await supabase
          .from('agreements')
          .select('signatories_status')
          .eq('id', agreement.id)
          .single();

        // Update the signatory status
        // Make sure signatories_status is an array to avoid issues
        const currentSignatories = Array.isArray(currentAgreement?.signatories_status) 
          ? [...currentAgreement.signatories_status]
          : [];
          
        const updatedSignatories = [...currentSignatories];
        const signatoryIndex = updatedSignatories.findIndex(s => 
          s.email?.toLowerCase() === Email?.toLowerCase()
        );
        
        if (signatoryIndex >= 0) {
          updatedSignatories[signatoryIndex] = {
            ...updatedSignatories[signatoryIndex],
            status: 'completed',
            signedAt: EventTime
          };
        } else {
          updatedSignatories.push({
            name: UserName,
            email: Email,
            status: 'completed',
            signedAt: EventTime
          });
        }

        await updateAgreement(agreement.id, {
          signature_status: 'in_progress',
          signatories_status: updatedSignatories
        });
        break;

      case EVIA_EVENTS.REQUEST_COMPLETED:
        // Handle completed document if included
        let signedPdfUrl = null;
        
        if (Documents && Documents.length > 0) {
          signedPdfUrl = await uploadSignedDocument(Documents[0], agreement.id);
        }

        await updateAgreement(agreement.id, {
          status: 'signed',
          signature_status: 'completed',
          signeddate: EventTime,
          signatureurl: signedPdfUrl
        });
        break;

      default:
        console.warn(`Unknown Evia Sign event type: ${EventId}`);
    }
  } catch (error) {
    console.error('Error processing Evia Sign event:', error);
  }
}

/**
 * Update an agreement in the database
 * @param {string} agreementId - The agreement ID
 * @param {Object} updates - The updates to apply
 */
async function updateAgreement(agreementId, updates) {
  try {
    // For signatories_status, ensure it's a valid array
    if (updates.signatories_status !== undefined) {
      // If it's not already an array, make it one
      if (!Array.isArray(updates.signatories_status)) {
        updates.signatories_status = [];
      }
    }
    
    // Don't try to set signature_status to 'unknown' as this violates a constraint
    if (updates.signature_status === 'unknown') {
      console.log(`[updateAgreement] Skipping update to "unknown" status as it violates database constraints`);
      delete updates.signature_status;
    }
    
    // Skip update if no fields left to update
    if (Object.keys(updates).length === 0) {
      console.log(`[updateAgreement] No fields to update for agreement ${agreementId}`);
      return;
    }
    
    try {
      // First try direct update
      const { error } = await supabase
        .from('agreements')
        .update({
          ...updates,
          updatedat: new Date().toISOString()
        })
        .eq('id', agreementId);
  
      if (error) {
        throw error;
      }
      
      console.log(`[updateAgreement] Successfully updated agreement ${agreementId} with:`, updates);
    } catch (updateError) {
      console.error('[updateAgreement] Error in direct update. Trying RPC fallback:', updateError);
      
      // Try fallback using RPC function if direct update fails
      // This helps especially with JSON validation issues
      if (updates.signature_status) {
        try {
          await supabase.rpc('update_agreement_status', {
            agreement_id: agreementId,
            status_value: updates.signature_status
          });
          console.log('[updateAgreement] Updated status via RPC fallback');
        } catch (rpcError) {
          console.error('[updateAgreement] RPC fallback also failed:', rpcError);
          throw rpcError;
        }
      } else {
        // If no RPC fallback, re-throw the original error
        throw updateError;
      }
    }
  } catch (error) {
    console.error(`[updateAgreement] Error updating agreement ${agreementId}:`, error);
    throw error;
  }
}

/**
 * Upload a signed document from webhook payload
 * @param {Object} signedDoc - The document from webhook payload
 * @param {string} agreementId - The agreement ID
 * @returns {Promise<string|null>} - The URL of the uploaded document or null
 */
async function uploadSignedDocument(signedDoc, agreementId) {
  try {
    if (!signedDoc || !signedDoc.DocumentContent) {
      console.error('Invalid document data:', signedDoc);
      return null;
    }
    
    // Convert base64 to Uint8Array for Deno's Supabase client
    const binaryData = Uint8Array.from(atob(signedDoc.DocumentContent), c => c.charCodeAt(0));
    
    // Set a meaningful file name with timestamp
    const fileName = `signed_${agreementId}_${Date.now()}.pdf`;
    const filePath = `agreements/${fileName}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('agreements')
      .upload(filePath, binaryData, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      console.error('Error uploading signed document:', uploadError);
      return null;
    }

    // Get the public URL
    const { data: { publicUrl } } = supabase.storage
      .from('agreements')
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (error) {
    console.error('Error uploading signed document:', error);
    return null;
  }
} 