import { nextApiHandler } from '../../api/evia-sign';

/**
 * Webhook handler for Evia Sign callbacks
 * This endpoint receives webhook events from Evia Sign API
 * 
 * The endpoint URL must be configured in the Evia Sign admin panel:
 * 1. When sending a document for signature, include the CallbackUrl parameter
 * 2. Set CompletedDocumentsAttached=true to get signed documents in the webhook
 */

// Debugging for webhook troubleshooting
console.log("[evia-webhook] Webhook handler loaded and ready to receive events");

// Use the centralized handler from our API module
export default nextApiHandler; 