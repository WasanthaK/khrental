/**
 * Token Utilities for KH Rentals
 *
 * This module provides functions for generating and verifying secure tokens
 * using browser-compatible Web Crypto API for JWT operations
 */

// Get token secret from environment variables

/**
 * Token Utilities
 *
 * Simple token generation and verification for secure links
 */

// Generate a simple token by encoding data as base64 with expiration
export const generateToken = (data, expiryDays = 1) => {
  try {
    // Add expiration timestamp
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    const payload = {
      ...data,
      exp: expiresAt.getTime()
    };

    // Convert to JSON and encode as base64
    const tokenData = JSON.stringify(payload);
    const encodedToken = btoa(tokenData);

    return encodedToken;
  } catch (error) {
    console.error('Error generating token:', error);
    return null;
  }
};

// Verify a token and return the decoded data
export const verifyToken = (token) => {
  try {
    // Decode from base64
    const decodedData = atob(token);
    const payload = JSON.parse(decodedData);

    // Check if token is expired
    const now = new Date().getTime();
    if (payload.exp < now) {
      throw new Error('Token has expired');
    }

    return payload;
  } catch (error) {
    console.error('Error verifying token:', error);
    throw new Error('Invalid token');
  }
};

/**
 * Decode a token without verification
 * This is useful for debugging or extracting token info without validation
 *
 * @param {string} token - The token to decode
 * @returns {Object|null} - Decoded token payload or null if invalid
 */
export const decodeToken = (token) => {
  try {
    // Split the token and decode the payload (middle part)
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }

    // Base64 decode and parse as JSON
    const payload = JSON.parse(atob(parts[1]));

    return payload;
  } catch (error) {
    console.error('[TokenUtils] Token decoding failed:', error);
    return null;
  }
};

/**
 * Parse expiration time from string format (like '7d', '24h', '30m') to seconds
 *
 * @param {string} expiresIn - Expiration string in format like '7d', '24h', '30m'
 * @returns {number} - Expiration time in seconds
 */
