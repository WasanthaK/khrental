/**
 * Evia Sign API Integration
 * 
 * This module exports the Evia Sign API integration components
 * Note: Webhook handling is now done via database triggers
 */

// Import document signing methods from the service
import {
  sendDocumentForSignature,
  getSignatureStatus,
  checkSignatureStatus,
  downloadSignedDocument
} from '../../services/eviaSignService';

// Export only signing-related methods
export {
  sendDocumentForSignature,
  getSignatureStatus,
  checkSignatureStatus,
  downloadSignedDocument
};