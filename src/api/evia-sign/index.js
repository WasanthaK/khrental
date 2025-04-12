/**
 * Evia Sign API Integration
 * 
 * This is a transitional module that re-exports from the existing eviaSignService
 * In the future, we'll split this into separate modules like auth.js, documents.js, etc.
 */

// For now, just re-export from the existing service to avoid breaking changes
import {
  sendDocumentForSignature,
  getSignatureStatus,
  checkSignatureStatus,
  downloadSignedDocument,
  handleSignatureWebhook
} from '../../services/eviaSignService';

export {
  sendDocumentForSignature,
  getSignatureStatus,
  checkSignatureStatus,
  downloadSignedDocument,
  handleSignatureWebhook
}; 