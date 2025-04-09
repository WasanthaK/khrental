import { supabase } from '../../services/supabaseClient';

/**
 * Webhook handler for Evia Sign callbacks
 * This endpoint receives webhook events from Evia Sign API
 */
export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Received webhook from Evia Sign:', req.body);
    
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
    } = req.body;

    // Log the webhook event to console
    console.log(`Webhook received: ${EventDescription} for request ${RequestId}`);
    
    // Store the webhook event in the database
    const { data: eventData, error: eventError } = await supabase
      .from('webhook_events')
      .insert([{
        event_type: EventDescription || 'unknown',
        request_id: RequestId || null,
        user_name: UserName || null,
        user_email: Email || null,
        subject: Subject || null,
        event_id: EventId || null,
        event_time: EventTime || new Date().toISOString(),
        raw_data: req.body
      }])
      .select();

    if (eventError) {
      console.error('Error storing webhook event:', eventError);
      // Continue even if there's an error storing the event
    }

    // Find the agreement with this reference ID
    const { data: agreement, error: findError } = await supabase
      .from('agreements')
      .select('*')
      .eq('eviasignreference', RequestId)
      .single();

    if (findError) {
      console.error('Error finding agreement:', findError);
      return res.status(404).json({ error: 'Agreement not found', details: findError });
    }

    if (!agreement) {
      console.error('No agreement found with reference ID:', RequestId);
      return res.status(404).json({ error: 'No agreement found with this reference ID' });
    }

    // Process the webhook based on event type
    switch (EventId) {
      case 1: // SignRequestReceived
        await updateAgreement(agreement.id, {
          signature_status: 'pending',
          signatories_status: []
        });
        break;

      case 2: // SignatoryCompleted
        // Get current status
        const { data: currentAgreement } = await supabase
          .from('agreements')
          .select('signatories_status')
          .eq('id', agreement.id)
          .single();

        // Update the signatory status
        const updatedSignatories = [...(currentAgreement?.signatories_status || [])];
        const signatoryIndex = updatedSignatories.findIndex(s => s.email === Email);
        
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

      case 3: // RequestCompleted
        // Handle completed document if included
        let signedPdfUrl = null;
        
        if (Documents && Documents.length > 0) {
          try {
            const signedDoc = Documents[0];
            
            // Convert base64 to blob
            const byteCharacters = atob(signedDoc.DocumentContent);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/pdf' });

            // Upload to Supabase Storage
            const fileName = `signed_${agreement.id}_${Date.now()}.pdf`;
            const filePath = `agreements/${fileName}`;
            
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('files')
              .upload(filePath, blob, {
                contentType: 'application/pdf',
                upsert: true
              });

            if (uploadError) { 
              console.error('Storage upload error:', uploadError);
              // Continue even if upload fails
            } else {
              // Get the public URL
              const { data: urlData } = supabase.storage
                .from('files')
                .getPublicUrl(filePath);

              signedPdfUrl = urlData?.publicUrl;
            }
          } catch (docError) {
            console.error('Error processing signed document:', docError);
            // Continue even if document processing fails
          }
        }

        await updateAgreement(agreement.id, {
          status: 'signed',
          signature_status: 'completed',
          signeddate: EventTime || new Date().toISOString(),
          signatureurl: signedPdfUrl
        });
        break;

      default:
        console.warn(`Unknown event type: ${EventId}`);
    }

    // Return success response
    return res.status(200).json({ 
      success: true, 
      message: `Processed ${EventDescription} event` 
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}

/**
 * Helper function to update an agreement
 */
async function updateAgreement(agreementId, updates) {
  try {
    const { error } = await supabase
      .from('agreements')
      .update({
        ...updates,
        updatedat: new Date().toISOString()
      })
      .eq('id', agreementId);

    if (error) {
      console.error('Error updating agreement:', error);
      throw error;
    }
  } catch (error) {
    console.error(`Error updating agreement ${agreementId}:`, error);
    throw error;
  }
} 