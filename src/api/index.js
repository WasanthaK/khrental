/**
 * API services index
 * Centralizes all API-related exports for easier imports
 */

// Export Evia Sign API functions
export {
  // Document signing methods
  sendDocumentForSignature,
  getSignatureStatus,
  checkSignatureStatus,
  downloadSignedDocument,
  
  // Webhook handlers
  handleSignatureWebhook,
  webhookRequestHandler,
  nextApiHandler
} from './evia-sign';

// Add other API exports here as they're migrated
// export { someFunction } from './other-api'; 