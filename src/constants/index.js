/**
 * Application Constants
 * Centralizes all application constants in one place
 */

// Re-export constants from existing utils/constants.js (transitional approach)
export * from '../utils/constants';

// Status constants
export const STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELED: 'canceled'
};

// Agreement status constants (previously defined in AgreementFormContext)
export const AGREEMENT_STATUS = {
  DRAFT: 'draft',
  REVIEW: 'review',
  PENDING: 'pending',
  SIGNED: 'signed',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  CANCELED: 'canceled'
};

// Endpoints (previously hardcoded in services)
export const ENDPOINTS = {
  // Evia Sign endpoints
  EVIA_SIGN: {
    BASE_URL: 'https://evia.enadocapp.com/_apis',
    AUTH_URL: 'https://evia.enadocapp.com/_apis/falcon/auth',
    API_URL: 'https://evia.enadocapp.com/_apis/sign/api'
  }
}; 