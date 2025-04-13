/**
 * API Routes Index
 * 
 * This module exports all API route handlers for the application.
 * Centralizing exports here makes imports cleaner throughout the application
 * and provides a single reference point for all available routes.
 */

// Import core implementation
import { webhookRequestHandler } from '../evia-sign';

/**
 * Route handler for webhook requests
 * @param {Request} req - The request object
 * @returns {Promise<Response>} - The response object
 */
export async function handleWebhookRequest(req) {
  // Extract the webhook type from the URL
  const url = new URL(req.url);
  const webhookType = url.pathname.split('/').pop();

  switch (webhookType) {
    case 'evia-sign':
      return webhookRequestHandler(req);
    default:
      return new Response(`Unsupported webhook type: ${webhookType}`, {
        status: 400
      });
  }
}

// Export POST handler for compatibility
export const POST = handleWebhookRequest;

// Default export for convenience
export default {
  webhook: handleWebhookRequest
}; 