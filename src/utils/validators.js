/**
 * Validates that a value is a valid UUID format
 * @param {string} value - The value to check
 * @returns {boolean} - Whether the value appears to be a valid UUID
 */
export const isValidUUID = (value) => {
  if (!value) {
    return false;
  }
  if (value === 'undefined' || value === 'null') {
    return false;
  }
  
  // Regex for UUID format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
 * Validates a parameter and returns a result object
 * @param {any} value - The value to validate
 * @param {string} paramName - The name of the parameter (for error messages)
 * @param {function} validationFn - The validation function to apply
 * @returns {{isValid: boolean, error: string|null}} - Validation result
 */
export const validateParam = (value, paramName, validationFn) => {
  if (!validationFn(value)) {
    return {
      isValid: false,
      error: `Invalid ${paramName}: ${value}`
    };
  }
  return {
    isValid: true,
    error: null
  };
};

/**
 * Validates a maintenance request ID
 * @param {string} id - The ID to validate
 * @returns {{isValid: boolean, error: string|null}} - Validation result and error message
 */
export const validateMaintenanceRequestId = (id) => {
  if (!id || id === 'undefined' || !isValidUUID(id)) {
    return {
      isValid: false,
      error: `Invalid maintenance request ID: ${id}`
    };
  }
  return {
    isValid: true,
    error: null
  };
};

/**
 * Validates staff assignment data
 * @param {object} assignmentData - The assignment data to validate
 * @returns {{isValid: boolean, error: string|null}} - Validation result and error message
 */
export const validateStaffAssignment = (assignmentData) => {
  if (!assignmentData) {
    return {
      isValid: false,
      error: 'Missing staff assignment data'
    };
  }

  if (!assignmentData.staffId) {
    return {
      isValid: false,
      error: 'Missing staff ID in assignment data'
    };
  }

  if (!isValidUUID(assignmentData.staffId)) {
    return {
      isValid: false,
      error: 'Invalid staff ID format'
    };
  }

  return {
    isValid: true,
    error: null
  };
};