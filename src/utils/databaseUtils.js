/**
 * Utility functions for database operations
 */

import { supabase } from '../services/supabaseClient';

export async function executeSql(sql) {
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    if (error) {
      throw error;
    }
    return data;
  } catch (error) {
    console.error('Error executing SQL:', error);
    throw error;
  }
}

export default {
  supabase,
  executeSql
};

/**
 * Converts camelCase to lowercase without underscores
 * @param {string} str - The string to convert
 * @returns {string} - The lowercase string
 */
export const toDatabaseCase = (str) => {
  return str.toLowerCase();
};

/**
 * Converts lowercase to camelCase
 * @param {string} str - The string to convert
 * @returns {string} - The camelCase string
 */
export const fromDatabaseCase = (str) => {
  return str.replace(/[a-z][A-Z]/g, (match) => 
    `${match[0]}${match[1].toUpperCase()}`
  );
};

/**
 * Converts object keys from camelCase to lowercase
 * @param {Object} obj - The object to convert
 * @returns {Object} - The object with lowercase keys
 */
export const toDatabaseFormat = (obj) => {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => toDatabaseFormat(item));
  }
  
  const result = {};
  
  Object.entries(obj).forEach(([key, value]) => {
    const dbKey = toDatabaseCase(key);
    
    if (value && typeof value === 'object') {
      result[dbKey] = toDatabaseFormat(value);
    } else {
      result[dbKey] = value;
    }
  });
  
  return result;
};

/**
 * Converts object keys from lowercase to camelCase
 * @param {Object} obj - The object to convert
 * @returns {Object} - The object with camelCase keys
 */
export const fromDatabaseFormat = (obj) => {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => fromDatabaseFormat(item));
  }
  
  const result = {};
  
  Object.entries(obj).forEach(([key, value]) => {
    // Special handling for known nested objects
    if (key === 'rentalvalues' && typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch (e) {
        console.warn('Failed to parse rentalvalues:', e);
      }
    }
    
    const camelKey = key === 'id' ? 'id' : fromDatabaseCase(key);
    
    if (value && typeof value === 'object') {
      result[camelKey] = fromDatabaseFormat(value);
    } else {
      result[camelKey] = value;
    }
  });
  
  return result;
}; 