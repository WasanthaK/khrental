/**
 * Utility functions index - centralizing common utility exports
 * This file makes importing utilities simpler by providing a single import point
 * 
 * Example usage:
 * import { isValidUUID, formatDate, handleApiError } from '../utils';
 */

// Validators
export { 
  isValidUUID, 
  isValidEmail, 
  isDefinedValue, 
  isValidDate
} from './validators';

// Formatters and helpers
export {
  formatDate,
  formatCurrency,
  formatFileSize,
  truncateText,
  sleep,
  getInitials
} from './helpers';

// Error handling
export {
  handleApiError,
  formatErrorMessage,
  parseErrorResponse
} from './errorFormatting';

// Constants (commonly used values)
export {
  DEFAULT_PAGE_SIZE,
  DATE_FORMAT,
  STORAGE_BUCKETS,
  ROLES
} from './constants';

// Database utilities
export {
  toDbFormat,
  fromDbFormat,
  prepareDataForInsert,
  prepareDataForUpdate
} from './databaseUtils';

// Document utilities
export {
  generateDocumentFromTemplate
} from './documentUtils';

// Navigation helpers
export {
  getNextPath,
  getPreviousPath
} from './navigationHelpers'; 