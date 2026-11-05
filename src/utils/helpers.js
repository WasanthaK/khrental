// Date formatting functions
export const formatDate = (dateString) => {
  if (!dateString) {
    return '';
  }
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export const formatDateTime = (dateString) => {
  if (!dateString) {
    return '';
  }
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Currency formatting
export const formatCurrency = (amount, currency) => {
  if (currency === undefined && (amount === undefined || amount === null)) return 'LKR 0.00';
  const value = amount === undefined || amount === null ? 0 : Number(amount);
  const code = currency === undefined ? 'LKR'
    : typeof currency === 'string' && /^[A-Z]{3}$/.test(currency) ? currency : null;

  try {
    return new Intl.NumberFormat('en-LK', {
      ...(code ? { style: 'currency', currency: code, ...(currency === undefined ? {} : { currencyDisplay: 'code' }) } : { style: 'decimal' }),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  } catch (e) {
    return `${code ? `${code} ` : ''}${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  }
};

// The accepted terms own the denomination. Never infer it from today's market,
// account settings or browser locale, or rewrite a historical agreement.
export const getAgreementCurrency = (agreement) => {
  try {
    const terms = typeof agreement?.terms === 'string' ? JSON.parse(agreement.terms) : agreement?.terms;
    const currency = terms?.currency;
    return typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency.trim())
      ? currency.trim().toUpperCase() : null;
  } catch {
    return null;
  }
};

export const formatAgreementRent = (agreement) => {
  let terms;
  try { terms = typeof agreement?.terms === 'string' ? JSON.parse(agreement.terms) : agreement?.terms; }
  catch { terms = null; }
  const amount = agreement?.rentamount ?? terms?.monthlyRent;
  if (amount === undefined || amount === null || amount === '' || !Number.isFinite(Number(amount))) {
    return 'Rent not recorded';
  }
  const currency = getAgreementCurrency(agreement);
  return formatCurrency(amount, currency) + (currency ? '' : ' (currency not recorded)');
};

// Validation functions
export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
};

export const validatePhone = (phone) => {
  // Basic validation for Sri Lankan phone numbers
  const re = /^(?:\+94|0)?[0-9]{9}$/;
  return re.test(String(phone).replace(/\s/g, ''));
};

// File size formatting
export const formatFileSize = (bytes) => {
  if (bytes === 0) {
    return '0 Bytes';
  }
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Generate a random ID (for temporary use before DB insertion)
export const generateTempId = () => {
  return 'temp_' + Math.random().toString(36).substring(2, 15);
};

// Calculate utility bill based on readings
export const calculateUtilityBill = (previousReading, currentReading, rate) => {
  if (previousReading === null || currentReading === null || rate === null) {
    return 0;
  }
  
  const consumption = Math.max(0, currentReading - previousReading);
  return consumption * rate;
};

// Deep clone an object
export const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};

// Check if an object is empty
export const isEmptyObject = (obj) => {
  return obj && Object.keys(obj).length === 0 && obj.constructor === Object;
};

// Truncate text with ellipsis
export const truncateText = (text, maxLength) => {
  if (!text) {
    return '';
  }
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + '...';
};

// Convert object to query string
export const objectToQueryString = (obj) => {
  return Object.keys(obj)
    .filter(key => obj[key] !== undefined && obj[key] !== null && obj[key] !== '')
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}`)
    .join('&');
};

// Parse query string to object
export const queryStringToObject = (queryString) => {
  if (!queryString || queryString === '') {
    return {};
  }
  const params = new URLSearchParams(queryString.startsWith('?') ? queryString.substring(1) : queryString);
  const result = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
};

// Get status badge color based on status
export const getStatusBadgeColor = (status) => {
  switch (status?.toLowerCase()) {
    case 'active':
    case 'available':
    case 'paid':
    case 'completed':
      return 'bg-green-100 text-green-800';
    case 'pending':
    case 'in_progress':
    case 'verification_pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'inactive':
    case 'unavailable':
    case 'overdue':
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    case 'draft':
    case 'expired':
    case 'terminated':
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-blue-100 text-blue-800';
  }
};

// Sanitize filename to prevent issues with special characters
export const sanitizeFilename = (filename) => {
  return filename.replace(/[^a-zA-Z0-9.]/g, '_');
};

// Extract filename from URL
export const getFilenameFromUrl = (url) => {
  try {
    const { pathname } = new URL(url);
    return pathname.split('/').pop();
  } catch (error) {
    console.error('Error parsing URL:', error);
    return url;
  }
};

/**
 * Ensures an object has valid timestamp fields (both formats)
 * @param {Object} record - The record to validate
 * @returns {Object} - The record with valid timestamp fields
 */
export const ensureValidTimestamps = (record) => {
  if (!record) {
    return record;
  }
  
  const now = new Date().toISOString();
  const result = { ...record };
  
  // Handle snake_case format (created_at, updated_at)
  if ('created_at' in record || 'updated_at' in record) {
    result.created_at = record.created_at || now;
    result.updated_at = record.updated_at || record.created_at || now;
  }
  
  // Handle camelCase format (createdAt, updatedAt)
  if ('createdAt' in record || 'updatedAt' in record) {
    result.createdAt = record.createdAt || now;
    result.updatedAt = record.updatedAt || record.createdAt || now;
  }
  
  // Handle no-underscore format (createdat, updatedat)
  if ('createdat' in record || 'updatedat' in record) {
    result.createdat = record.createdat || now;
    result.updatedat = record.updatedat || record.createdat || now;
  }
  
  return result;
};
