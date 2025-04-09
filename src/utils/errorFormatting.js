/**
 * Error formatting utilities
 * 
 * This file contains utility functions for formatting error messages
 * from various sources in a consistent way.
 */

/**
 * Format an error message from various error sources
 * @param {Error|Object} error - The error object to format
 * @returns {string} - Formatted error message
 */
export const formatErrorMessage = (error) => {
  if (!error) {
    return 'Unknown error occurred';
  }
  
  // If error is a string, return it directly
  if (typeof error === 'string') {
    return error;
  }
  
  // If error is a Supabase error
  if (error.code && error.message) {
    return `${error.message} (Code: ${error.code})`;
  }
  
  // If error is a standard Error object
  if (error.message) {
    return error.message;
  }
  
  // If error is an HTTP response
  if (error.status && error.statusText) {
    return `${error.statusText} (${error.status})`;
  }
  
  // If error is an object with details
  if (error.details) {
    return error.details;
  }
  
  // Fallback: stringify the error
  try {
    return JSON.stringify(error);
  } catch (e) {
    return 'Error could not be formatted';
  }
};

/**
 * Format a database error specifically from Supabase
 * @param {Object} error - The Supabase error object
 * @returns {string} - User-friendly error message
 */
export const formatDatabaseError = (error) => {
  if (!error) {
    return 'Unknown database error';
  }
  
  // Handle specific Supabase error codes
  switch (error.code) {
    case '23505': // Unique violation
      return 'This record already exists in the database';
    case '23503': // Foreign key violation
      return 'Referenced record does not exist';
    case '23514': // Check constraint violation
      return 'Input validation failed';
    case '42P01': // Undefined table
      return 'Database configuration error: table not found';
    case '42703': // Undefined column
      return 'Database configuration error: column not found';
    default:
      return formatErrorMessage(error);
  }
};

/**
 * Format API error responses
 * @param {Object} response - API response object
 * @returns {string} - Formatted error message
 */
export const formatApiError = (response) => {
  if (!response) {
    return 'Unknown API error';
  }
  
  // If response has an error property
  if (response.error) {
    return formatErrorMessage(response.error);
  }
  
  // If response is a standard HTTP error
  if (response.status >= 400) {
    return `${response.statusText || 'HTTP Error'} (${response.status})`;
  }
  
  return 'Unknown API error occurred';
}; 