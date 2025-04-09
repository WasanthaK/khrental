/**
 * Validates that a value is a valid UUID format
 * @param {string} value - The value to check
 * @returns {boolean} - Whether the value appears to be a valid UUID
 */
export const isValidUUID = (value) => {
  if (!value) return false;
  if (value === 'undefined' || value === 'null') return false;
  
  // Regex for UUID format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(String(value));
};

/**
 * Validates a value is not undefined, null, or string versions of those values
 * @param {any} value - The value to check
 * @returns {boolean} - Whether the value is defined and usable
 */
export const isDefinedValue = (value) => {
  return value !== undefined && value !== null && value !== 'undefined' && value !== 'null';
};

/**
 * Checks if a parameter is present and valid for use in API calls
 * @param {string} paramName - Name of the parameter
 * @param {any} paramValue - Value to validate
 * @param {boolean} requireUUID - Whether the parameter should be a valid UUID
 * @returns {{isValid: boolean, error: string|null}} - Validation result and error message if invalid
 */
export const validateParam = (paramName, paramValue, requireUUID = false) => {
  if (!isDefinedValue(paramValue)) {
    return {
      isValid: false,
      error: `Missing or invalid ${paramName} parameter: ${paramValue}`
    };
  }
  
  if (requireUUID && !isValidUUID(paramValue)) {
    return {
      isValid: false,
      error: `Invalid UUID format for ${paramName}: ${paramValue}`
    };
  }
  
  return {
    isValid: true,
    error: null
  };
}; 