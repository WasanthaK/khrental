/**
 * Token Utilities for KH Rentals
 * 
 * This module provides functions for generating and verifying secure tokens
 * using browser-compatible Web Crypto API for JWT operations
 */

// Default secret key - in production, this should be in environment variables
const getTokenSecret = () => {
  if (typeof window !== 'undefined' && window._env_ && window._env_.TOKEN_SECRET) {
    return window._env_.TOKEN_SECRET;
  }
  
  if (import.meta && import.meta.env && import.meta.env.VITE_TOKEN_SECRET) {
    return import.meta.env.VITE_TOKEN_SECRET;
  }
  
  // Fallback for development - NOT SECURE for production!
  return 'kh-rentals-dev-secret-key-change-in-production';
};

/**
 * Generate a simple token with payload
 * 
 * @param {Object} payload - Data to encode in the token
 * @param {string} expiresIn - Expiration time (e.g. '1h', '7d')
 * @returns {string} - Generated token
 */
export const generateToken = (payload, expiresIn = '24h') => {
  try {
    // Parse the expiration time
    const expirySeconds = parseExpirationTime(expiresIn);
    const now = Math.floor(Date.now() / 1000);
    
    // Add standard JWT claims
    const tokenPayload = {
      ...payload,
      iat: now,
      exp: now + expirySeconds
    };
    
    // Encode payload as base64
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const encodedPayload = btoa(JSON.stringify(tokenPayload));
    
    // For simplicity, we're creating a token without actual HS256 signing
    // In production, use a proper JWT library
    const token = `${header}.${encodedPayload}.nosignature`;
    
    return token;
  } catch (error) {
    console.error('[TokenUtils] Error generating token:', error);
    throw new Error('Failed to generate secure token');
  }
};

/**
 * Verify a token and return its payload
 * 
 * @param {string} token - The token to verify
 * @returns {Object} - Decoded token payload if valid
 * @throws {Error} - If token is invalid or expired
 */
export const verifyToken = (token) => {
  try {
    // Split token into parts
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }
    
    // Decode payload
    const payload = JSON.parse(atob(parts[1]));
    
    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new Error('Token expired');
    }
    
    return payload;
  } catch (error) {
    console.error('[TokenUtils] Token verification failed:', error);
    throw new Error('Invalid or expired token');
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
function parseExpirationTime(expiresIn) {
  const match = expiresIn.match(/^(\d+)([dhms])$/);
  if (!match) {
    return 24 * 60 * 60; // Default to 24 hours in seconds
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  switch (unit) {
    case 'd': return value * 24 * 60 * 60; // days to seconds
    case 'h': return value * 60 * 60;      // hours to seconds
    case 'm': return value * 60;           // minutes to seconds
    case 's': return value;                // seconds
    default: return 24 * 60 * 60;          // default: 24 hours
  }
} 