// Mark a webhook event as processed
const markWebhookEventProcessed = async (eventId, result) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    log('Cannot mark webhook event as processed: Missing Supabase credentials');
    return { success: false, error: 'Missing Supabase credentials' };
  }

  try {
    log(`Marking webhook event ${eventId} as processed using direct HTTP PATCH`);

    // Use direct HTTP PATCH request to bypass all schema cache issues
    const response = await customFetch(
      `${SUPABASE_URL}/rest/v1/webhook_events?id=eq.${encodeURIComponent(eventId)}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          processed: true,
          // Only set processed flag, don't try to set processed_at which may not exist
          // and is causing the schema cache error
        })
      }
    );

    if (response.ok) {
      log(`✅ Successfully marked webhook event ${eventId} as processed (HTTP status ${response.status})`); 
      return { success: true };
    } else {
      const errorText = await response.text().catch(() => 'Failed to read error response');
      log(`Failed to mark webhook event as processed: HTTP ${response.status} - ${errorText}`);

      // Even if this fails, we want to continue processing the webhook
      // Just report the error but treat it as a success for the application flow
      return {
        success: true,
        warning: `HTTP error ${response.status} but ignoring for application continuity`
      };
    }
  } catch (error) {
    log(`Exception marking webhook event as processed: ${error.message}`);

    // Even if this fails, we want to continue processing the webhook
    return {
      success: true,
      warning: `Exception ${error.message} but ignoring for application continuity`
    };
  }
}; 