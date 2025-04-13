const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Azure Function to handle Evia Sign webhook events
 * This function receives webhook notifications and stores them in the database
 */
module.exports = async function (context, req) {
    context.log('Evia Sign Webhook received');
    
    try {
        // Get the webhook payload
        const payload = req.body;
        
        // Basic validation
        if (!payload || !payload.RequestId || !payload.EventId) {
            context.log.error('Invalid webhook payload: missing required fields');
            context.res = {
                status: 400,
                body: { error: 'Invalid webhook payload' }
            };
            return;
        }
        
        context.log(`Webhook received: ${payload.EventDescription} for request ${payload.RequestId}`);
        
        // Store the webhook event in the database
        const { data, error } = await supabase
            .from('webhook_events')
            .insert([{
                event_type: payload.EventDescription || 'unknown',
                request_id: payload.RequestId,
                user_name: payload.UserName || null,
                user_email: payload.Email || null,
                subject: payload.Subject || null,
                event_id: payload.EventId || null,
                event_time: payload.EventTime || new Date().toISOString(),
                raw_data: payload
            }])
            .select();
            
        if (error) {
            context.log.error('Error storing webhook event:', error);
            // Continue to process the webhook even if storage fails
        } else {
            context.log(`Webhook event stored with ID: ${data[0]?.id}`);
        }
        
        // Process the webhook based on event type
        await processWebhookEvent(payload, context);
        
        // Return success response
        context.res = {
            status: 200,
            body: { success: true, message: 'Webhook processed successfully' }
        };
    } catch (error) {
        context.log.error('Error processing webhook:', error);
        context.res = {
            status: 500,
            body: { error: 'Internal server error' }
        };
    }
};

/**
 * Process the webhook event and update the agreement accordingly
 */
async function processWebhookEvent(payload, context) {
    const { RequestId, EventId, EventTime, Documents } = payload;
    
    try {
        // Find the agreement using the RequestId
        const { data: agreement, error } = await supabase
            .from('agreements')
            .select('*')
            .eq('eviasignreference', RequestId)
            .single();
            
        if (error || !agreement) {
            context.log.error(`Agreement not found for RequestId: ${RequestId}`);
            return;
        }
        
        context.log(`Found agreement ID: ${agreement.id}`);
        
        // Determine the status based on the event type
        let updates = {};
        
        switch (EventId) {
            case 1: // SignRequestReceived
                updates = {
                    signature_status: 'pending',
                    signatories_status: []
                };
                break;
                
            case 2: // SignatoryCompleted
                // Get current signatories if available
                const { data: currentAgreement } = await supabase
                    .from('agreements')
                    .select('signatories_status')
                    .eq('id', agreement.id)
                    .single();
                
                const currentSignatories = currentAgreement?.signatories_status || [];
                const updatedSignatories = Array.isArray(currentSignatories) ? [...currentSignatories] : [];
                
                // Update or add signatory
                const signatoryIndex = updatedSignatories.findIndex(s => s.email === payload.Email);
                if (signatoryIndex >= 0) {
                    updatedSignatories[signatoryIndex] = {
                        ...updatedSignatories[signatoryIndex],
                        status: 'completed',
                        signedAt: EventTime
                    };
                } else {
                    updatedSignatories.push({
                        name: payload.UserName,
                        email: payload.Email,
                        status: 'completed',
                        signedAt: EventTime
                    });
                }
                
                updates = {
                    signature_status: 'in_progress',
                    signatories_status: updatedSignatories
                };
                break;
                
            case 3: // RequestCompleted
                // Upload document if included in webhook
                let signedPdfUrl = null;
                if (Documents && Documents.length > 0) {
                    context.log('Signed document received in webhook');
                    try {
                        // Upload to Supabase storage
                        const documentContent = Documents[0].DocumentContent;
                        const fileName = `signed_${agreement.id}_${Date.now()}.pdf`;
                        const filePath = `agreements/${fileName}`;
                        
                        // Convert base64 to buffer
                        const buffer = Buffer.from(documentContent, 'base64');
                        
                        // Upload to Supabase Storage
                        const { data: fileData, error: fileError } = await supabase.storage
                            .from('files')
                            .upload(filePath, buffer, {
                                contentType: 'application/pdf',
                                upsert: true
                            });
                            
                        if (fileError) {
                            context.log.error('Error uploading signed document:', fileError);
                        } else {
                            // Get public URL
                            const { data: urlData } = supabase.storage
                                .from('files')
                                .getPublicUrl(filePath);
                                
                            signedPdfUrl = urlData.publicUrl;
                            context.log(`Document uploaded: ${signedPdfUrl}`);
                        }
                    } catch (docError) {
                        context.log.error('Error processing document:', docError);
                    }
                }
                
                updates = {
                    status: 'signed',
                    signature_status: 'completed',
                    signeddate: new Date(EventTime).toISOString()
                };
                
                if (signedPdfUrl) {
                    updates.signatureurl = signedPdfUrl;
                }
                break;
                
            default:
                context.log.warn(`Unknown event type: ${EventId}`);
                return;
        }
        
        // Update the agreement
        const { data: updatedAgreement, error: updateError } = await supabase
            .from('agreements')
            .update({
                ...updates,
                updatedat: new Date().toISOString()
            })
            .eq('id', agreement.id)
            .select();
            
        if (updateError) {
            context.log.error('Error updating agreement:', updateError);
        } else {
            context.log(`Agreement ${agreement.id} updated successfully`);
        }
    } catch (error) {
        context.log.error('Error processing webhook event:', error);
    }
} 