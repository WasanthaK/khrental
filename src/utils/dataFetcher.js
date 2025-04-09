import { supabase } from '../config/supabaseClient';
import { ensureValidTimestamps } from './helpers';

/**
 * Fetches data from a specified table with optional filters and relationship data
 * @param {string} table - The table to fetch data from
 * @param {Object} options - Optional configuration for the fetch operation
 * @returns {Promise<Object>} - The fetch result with data and error properties
 */
export const fetchData = async (table, options = {}) => {
  try {
    const {
      select = '*',
      filters = [],
      orderBy = { column: 'created_at', ascending: false },
      limit = 1000,
      page = 1,
      relationships = []
    } = options;

    // Start building the query
    let query = supabase
      .from(table)
      .select(select);

    // Apply filters if provided
    filters.forEach(filter => {
      if (filter.value !== undefined && filter.value !== null) {
        if (filter.operator === 'in') {
          query = query.in(filter.column, filter.value);
        } else if (filter.operator === 'like') {
          query = query.like(filter.column, `%${filter.value}%`);
        } else if (filter.operator === 'gte') {
          query = query.gte(filter.column, filter.value);
        } else if (filter.operator === 'lte') {
          query = query.lte(filter.column, filter.value);
        } else {
          query = query.eq(filter.column, filter.value);
        }
      }
    });

    // Apply order by
    if (orderBy) {
      query = query.order(orderBy.column, { ascending: orderBy.ascending });
    }

    // Apply pagination
    if (limit) {
      const startIndex = (page - 1) * limit;
      query = query.range(startIndex, startIndex + limit - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Error fetching data from ${table}:`, error);
      return { data: null, error };
    }

    // Apply timestamp validation to all records
    const validatedData = data ? data.map(record => ensureValidTimestamps(record)) : [];
    
    // Fetch related data if relationships were specified
    if (relationships.length > 0 && validatedData.length > 0) {
      for (const relationship of relationships) {
        const { table: relatedTable, foreignKey, primaryKey = 'id' } = relationship;
        
        // Get all unique IDs from the primary records
        const primaryIds = [...new Set(validatedData.map(item => item[primaryKey]).filter(Boolean))];
        
        if (primaryIds.length > 0) {
          const { data: relatedData, error: relatedError } = await supabase
            .from(relatedTable)
            .select('*')
            .in(foreignKey, primaryIds);
          
          if (relatedError) {
            console.error(`Error fetching related data from ${relatedTable}:`, relatedError);
            continue;
          }
          
          // Apply timestamp validation to related records
          const validatedRelatedData = relatedData ? relatedData.map(record => ensureValidTimestamps(record)) : [];
          
          // Add related data to each primary record
          validatedData.forEach(item => {
            item[relatedTable] = validatedRelatedData.filter(
              relatedItem => relatedItem[foreignKey] === item[primaryKey]
            );
          });
        }
      }
    }
    
    return { data: validatedData, error: null };
  } catch (error) {
    console.error(`Unexpected error in fetchData for ${table}:`, error);
    return { data: null, error };
  }
}; 