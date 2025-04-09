import { supabase } from './supabaseClient';

/**
 * Fetch data from a table with optional filters
 * @param {string} table - The table name to fetch from
 * @param {Array|Object} [filters=[]] - Optional filters as array of {column, operator, value} objects or key-value object
 * @param {string|Array} [columns='*'] - Columns to fetch, defaults to all
 * @param {Object} [options={}] - Additional options like limit, offset, order
 * @returns {Promise<Array>} - The fetched data
 */
export const fetchData = async (table, filters = {}, columns = '*', options = {}) => {
  try {
    let query = supabase.from(table).select(columns);

    // Apply any filters
    if (Array.isArray(filters)) {
      filters.forEach((filter) => {
        query = query.eq(filter.column, filter.value);
      });
    } else if (typeof filters === 'object') {
      Object.entries(filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
    }

    // Apply additional options
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.offset(options.offset);
    }
    if (options.order) {
      query = query.order(options.order);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }
    return { data, error: null };
  } catch (error) {
    console.error(`Error fetching data from ${table}:`, error);
    return { data: null, error };
  }
};

/**
 * Insert data into a table
 * @param {string} table - The table name to insert into
 * @param {Object} data - The data to insert
 * @returns {Promise<{data: Object, error: Error}>}
 */
export const insertData = async (table, data) => {
  try {
    const { data: result, error } = await supabase
      .from(table)
      .insert([data])
      .select()
      .single();

    if (error) {
      throw error;
    }
    return { data: result, error: null };
  } catch (error) {
    console.error(`Error inserting data into ${table}:`, error);
    return { data: null, error };
  }
};

/**
 * Delete data from a table
 * @param {string} table - The table name to delete from
 * @param {Object} filters - Filters to identify the records to delete
 * @returns {Promise<{success: boolean, error: Error}>}
 */
export const deleteData = async (table, filters) => {
  try {
    let query = supabase.from(table).delete();

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    const { error } = await query;
    if (error) {
      throw error;
    }
    return { success: true, error: null };
  } catch (error) {
    console.error(`Error deleting data from ${table}:`, error);
    return { success: false, error };
  }
};

/**
 * Update data in a table
 * @param {string} table - The table name to update
 * @param {Object} filters - Filters to identify the records to update
 * @param {Object} data - The data to update
 * @returns {Promise<{data: Object, error: Error}>}
 */
export const updateData = async (table, filters, data) => {
  try {
    let query = supabase.from(table).update(data);

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    const { data: result, error } = await query.select().single();
    if (error) {
      throw error;
    }
    return { data: result, error: null };
  } catch (error) {
    console.error(`Error updating data in ${table}:`, error);
    return { data: null, error };
  }
};

/**
 * Helper function to directly create a template using SQL
 * @param {Object} templateData - Template data to save
 * @returns {Promise<Object>} - Result of the operation
 */
export const createTemplateDirectly = async (templateData) => {
  try {
    console.log('Creating template directly with data:', templateData);
    
    if (!templateData.id) {
      // Use built-in crypto.randomUUID() for browsers or a fallback
      templateData.id = globalThis.crypto?.randomUUID?.() || 
        ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
          (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
      console.log('Generated new UUID:', templateData.id);
    }
    
    // Ensure we have the required fields
    if (!templateData.name || !templateData.content) {
      return { 
        error: new Error('Template name and content are required'),
        data: null
      };
    }
    
    // Add timestamps if not present
    const now = new Date().toISOString();
    if (!templateData.createdat) {
      templateData.createdat = now;
    }
    if (!templateData.updatedat) {
      templateData.updatedat = now;
    }
    
    // Direct insert to the agreement_templates table
    const insertResult = await supabase
      .from('agreement_templates')
      .insert({
        id: templateData.id,
        name: templateData.name,
        language: templateData.language || 'English',
        content: templateData.content,
        version: templateData.version || '1.0',
        createdat: templateData.createdat,
        updatedat: templateData.updatedat,
        documenturl: templateData.documenturl || null
      })
      .select();
      
    console.log('Template creation result:', insertResult);
    return insertResult;
  } catch (error) {
    console.error('Error creating template directly:', error);
    return { data: null, error };
  }
};

/**
 * Helper function to ensure agreement_templates table exists
 * @returns {Promise<Object>} - Result of the operation
 */
export const ensureTemplateTableExists = async () => {
  try {
    // Check if table exists
    const { data, error } = await supabase
      .from('agreement_templates')
      .select('id')
      .limit(1);
      
    if (error) {
      console.log('Template table may not exist, attempting to create it');
      
      // Table might not exist, try to create it
      return await supabase.rpc('create_template_table_if_not_exists');
    }
    
    return { data, error: null };
  } catch (error) {
    console.error('Error checking template table:', error);
    return { data: null, error };
  }
}; 