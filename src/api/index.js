/**
 * API services index
 * Centralizes all API-related exports for easier imports
 */

// Export Evia Sign API functions
export {
  sendDocumentForSignature,
  getSignatureStatus,
  checkSignatureStatus,
  downloadSignedDocument,
  handleSignatureWebhook
} from './evia-sign';

// Add other API exports here as they're migrated
// export { someFunction } from './other-api'; 