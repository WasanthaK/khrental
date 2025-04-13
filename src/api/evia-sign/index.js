/**
 * Evia Sign API Integration
 * 
 * This module exports the Evia Sign API integration components
 */

// Import from the service for now
import {
  sendDocumentForSignature,
  getSignatureStatus,
  checkSignatureStatus,
  downloadSignedDocument
} from '../../services/eviaSignService';

// Import from our consolidated webhook handler
import { 
  handleSignatureWebhook, 
  webhookRequestHandler, 
  nextApiHandler,
  getSignatureStatusFromWebhooks
} from './webhookHandler';

// Export everything
export {
  // Document signing methods
  sendDocumentForSignature,
  getSignatureStatus,
  checkSignatureStatus,
  downloadSignedDocument,
  
  // Webhook handlers
  handleSignatureWebhook,
  webhookRequestHandler,
  nextApiHandler,
  getSignatureStatusFromWebhooks
}; 