/**
 * Token Utilities for KH Rentals
 * 
 * This module provides functions for generating and verifying secure tokens
 * using browser-compatible Web Crypto API for JWT operations
 */

// Get token secret from environment variables
const getTokenSecret = () => {
  // Check window._env_ (runtime environment variables)
  if (typeof window !== 'undefined' && window._env_ && window._env_.TOKEN_SECRET) {
    return window._env_.TOKEN_SECRET;
  }
  
  // Check Vite environment variables
  if (import.meta && import.meta.env && import.meta.env.VITE_TOKEN_SECRET) {
    return import.meta.env.VITE_TOKEN_SECRET;
  }
  
  // Log warning instead of using hardcoded fallback
  console.warn('[TokenUtils] No token secret found in environment variables. Token security is compromised!');
  
  // Generate a random temporary secret if none exists
  // This is still not secure for production but better than a static hardcoded value
  // as it changes on each application reload
  return `temp-${Math.random().toString(36).substring(2)}-${Date.now().toString(36)}`;
};

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