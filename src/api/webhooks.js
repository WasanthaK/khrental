import { handleSignatureWebhook } from '../services/eviaSignService';
import { supabase } from '../services/supabaseClient';

/**
 * Handle webhook requests from Evia Sign
 * @param {Request} req - The request object
 * @returns {Promise<Response>} - The response object
 */
export async function handleEviaSignWebhook(req) {
  try {
    // Verify request method
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Parse the webhook payload
    const payload = await req.json();
    console.log('Received Evia Sign webhook:', payload);

    // Basic validation
    if (!payload || !payload.RequestId || !payload.EventId) {
      return new Response('Invalid webhook payload', { status: 400 });
    }

    // Process the webhook
    const result = await handleSignatureWebhook(payload);

    // Return success response
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Webhook processing error:', error);
    
    // Return error response
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}

/**
 * Usage example with Express:
 * 
 * import express from 'express';
 * import { eviaSignWebhookHandler } from './webhooks';
 * 
 * const app = express();
 * app.use(express.json());
 * 
 * app.post('/api/evia-webhook', eviaSignWebhookHandler);
 * 
 * app.listen(3000, () => {
 *   console.log('Server listening on port 3000');
 * });
 */ 