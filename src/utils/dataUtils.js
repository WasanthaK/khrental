import { supabase } from '../services/supabaseClient';

/**
 * Fetch data from a Supabase table
 * @param {string} table - The name of the table to fetch from
 * @param {object} options - Additional options for the fetch
 * @returns {Promise<Array>} - Array of data objects
 */
export const fetchData = async (table, options = {}) => {
  try {
    console.log(`Fetching data from ${table}`, options);
    
    let query = supabase.from(table).select('*');
    
    // Apply filters if provided
    if (options.filters && Array.isArray(options.filters)) {
      options.filters.forEach(filter => {
        query = query[filter.operator || 'eq'](filter.column, filter.value);
      });
    }
    
    // Apply order if provided
    if (options.order) {
      query = query.order(options.order.column, { 
        ascending: options.order.ascending !== false 
      });
    }
    
    // Apply pagination if provided
    if (options.pagination) {
      query = query.range(
        options.pagination.from || 0, 
        options.pagination.to || 9
      );
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error(`Error fetching ${table}:`, error);
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error(`Exception in fetchData for ${table}:`, error);
    throw error;
  }
};

/**
 * Convert database format to frontend format
 * @param {object} dbData - Data from the database
 * @returns {object} - Formatted data for frontend use
 */
export const fromDatabaseFormat = (dbData) => {
  if (!dbData) {
    return null;
  }
  
  // Clone to avoid mutations
  const data = { ...dbData };
  
  // Parse JSON fields
  if (typeof data.terms === 'string') {
    try {
      data.terms = JSON.parse(data.terms);
    } catch (e) {
      console.error('Error parsing terms JSON:', e);
      data.terms = {
        monthlyRent: '',
        depositAmount: '',
        paymentDueDay: '',
        noticePeriod: '',
        specialConditions: ''
      };
    }
  } else if (!data.terms) {
    data.terms = {
      monthlyRent: '',
      depositAmount: '',
      paymentDueDay: '',
      noticePeriod: '',
      specialConditions: ''
    };
  }
  
  // Ensure date fields are in the correct format for inputs
  if (data.startdate && typeof data.startdate === 'string') {
    // If it's already in ISO format, just take the date part
    if (data.startdate.includes('T')) {
      data.startdate = data.startdate.split('T')[0];
    }
  }
  
  if (data.enddate && typeof data.enddate === 'string') {
    if (data.enddate.includes('T')) {
      data.enddate = data.enddate.split('T')[0];
    }
  }
  
  return data;
};

/**
 * Convert frontend format to database format
 * @param {object} formData - Data from the frontend form
 * @returns {object} - Formatted data for database storage
 */
export const toDatabaseFormat = (formData) => {
  // Clone to avoid mutations
  const data = { ...formData };
  
  // Convert terms object to JSON string
  if (data.terms && typeof data.terms === 'object') {
    data.terms = JSON.stringify(data.terms);
  }
  
  // Ensure fields match database column names
  if (data.document_url) {
    data.documenturl = data.document_url;
    delete data.document_url;
  }
  
  if (data.pdf_url) {
    data.pdfurl = data.pdf_url;
    delete data.pdf_url;
  }
  
  if (data.signature_url) {
    data.signatureurl = data.signature_url;
    delete data.signature_url;
  }
  
  return data;
}; 