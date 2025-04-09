import { createClient } from '@supabase/supabase-js';
import { isValidUUID } from '../utils/validators.js';

// Initialize the Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL or Anon Key is missing. Please check your environment variables.');
}

// Create a single Supabase client instance
let supabaseInstance = null;

export const getSupabaseClient = () => {
  if (!supabaseInstance) {
    const isBrowser = typeof window !== 'undefined';
    
    const config = {
      auth: {
        autoRefreshToken: true,
        persistSession: isBrowser,
        detectSessionInUrl: isBrowser
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      },
      db: {
        schema: 'public'
      }
    };

    // Only add storage configuration in browser environment
    if (isBrowser) {
      config.auth.storage = localStorage;
      config.auth.storageKey = 'supabase.auth.token';
      config.auth.flowType = 'pkce';
    }

    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, config);
  }
  return supabaseInstance;
};

// Export the singleton instance
export const supabase = getSupabaseClient();

// Authentication helpers
export const signUp = async (email, password) => {
  console.log('[Supabase] Signing up user:', email);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  console.log('[Supabase] Sign up result:', { success: !error, data, error });
  return { data, error };
};

// Enhanced sign in with debug logging
export const signIn = async (email, password) => {
  console.log('[Supabase] Attempting sign in for:', email);
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('[Supabase] Sign in error:', error);
      return { error };
    }

    if (!data?.session) {
      console.error('[Supabase] Sign in succeeded but no session returned');
      return { error: new Error('No session returned after sign in') };
    }

    console.log('[Supabase] Sign in successful:', {
      userId: data.user?.id,
      sessionExpiry: data.session?.expires_at
    });

    return { data };
  } catch (error) {
    console.error('[Supabase] Unexpected error during sign in:', error);
    return { error };
  }
};

export const signOut = async () => {
  console.log('[Supabase] Signing out user');
  const { error } = await supabase.auth.signOut();
  console.log('[Supabase] Sign out result:', { success: !error, error });
  return { error };
};

export const getCurrentUser = async () => {
  console.log('[Supabase] Getting current user');
  const { data, error } = await supabase.auth.getUser();
  console.log('[Supabase] Get current user result:', { 
    success: !error, 
    hasUser: !!data?.user,
    userId: data?.user?.id,
    error 
  });
  return { data, error };
};

// Password reset functions
export const resetPassword = async (email) => {
  console.log('[Supabase] Sending password reset email to:', email);
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  });
  console.log('[Supabase] Password reset email result:', { success: !error, error });
  return { data, error };
};

export const updatePassword = async (newPassword) => {
  console.log('[Supabase] Updating password');
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword
  });
  console.log('[Supabase] Password update result:', { success: !error, error });
  return { data, error };
};

// Database helpers
export const fetchData = async (tableOrOptions, columns = null, filters = null) => {
  try {
    let table, query = {};
    
    // Handle new format (single object parameter)
    if (tableOrOptions !== null && typeof tableOrOptions === 'object' && !Array.isArray(tableOrOptions)) {
      // New format: { table: 'tableName', filters: [...], ... }
      table = tableOrOptions.table;
      query = tableOrOptions;
    } else {
      // Old format: fetchData('tableName', columns, filters)
      table = tableOrOptions;
      
      // If columns is an object, it's actually the query/filters
      if (columns !== null && typeof columns === 'object' && !Array.isArray(columns)) {
        query = columns;
      } 
      // If filters is provided as a simple object (e.g., { id: 123 })
      else if (filters !== null && typeof filters === 'object') {
        query = {
          filters: Object.entries(filters).map(([column, value]) => ({
            column,
            operator: 'eq',
            value
          }))
        };
      }
      
      // Add columns to query if provided as array
      if (Array.isArray(columns)) {
        query.columns = columns;
      }
    }
    
    // For count queries
    if (query.count) {
      try {
        // Create a simple count query
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
        
        if (error) {
          console.error('Count query error:', error);
          return { error };
        }
        
        return { count, error: null };
      } catch (countError) {
        console.error(`[Count Query] Error in count query for ${table}:`, countError);
        return { error: countError };
      }
    }
    
    // Start building the query
    let queryBuilder = supabase.from(table);
    
    // Handle select statement
    if (query.select) {
      queryBuilder = queryBuilder.select(query.select);
    } else if (table === 'maintenance_requests') {
      queryBuilder = queryBuilder.select(`
        *,
        maintenance_request_images (
          id,
          maintenance_request_id,
          image_url,
          image_type,
          uploaded_by,
          uploaded_at,
          description
        )
      `);
    } else if (Array.isArray(query.columns)) {
      queryBuilder = queryBuilder.select(query.columns.join(','));
    } else {
      queryBuilder = queryBuilder.select();
    }
    
    // Apply filters if provided
    if (query.filters && Array.isArray(query.filters)) {
      for (const filter of query.filters) {
        // Ensure we're using lowercase column names for the database
        const column = filter.column.toLowerCase();
        
        // Special validation for UUID fields
        if ((column === 'id' || column.endsWith('id')) && !isValidUUID(filter.value)) {
          console.error(`Invalid UUID value for ${column} filter:`, filter.value);
          return { 
            error: { 
              message: `Invalid UUID value for ${column} filter: ${filter.value}`,
              code: 'INVALID_UUID' 
            },
            data: null 
          };
        }
        
        if (filter.operator === 'eq') {
          queryBuilder = queryBuilder.eq(column, filter.value);
        } else if (filter.operator === 'neq') {
          queryBuilder = queryBuilder.neq(column, filter.value);
        } else if (filter.operator === 'gt') {
          queryBuilder = queryBuilder.gt(column, filter.value);
        } else if (filter.operator === 'gte') {
          queryBuilder = queryBuilder.gte(column, filter.value);
        } else if (filter.operator === 'lt') {
          queryBuilder = queryBuilder.lt(column, filter.value);
        } else if (filter.operator === 'lte') {
          queryBuilder = queryBuilder.lte(column, filter.value);
        } else if (filter.operator === 'like') {
          queryBuilder = queryBuilder.like(column, `%${filter.value}%`);
        } else if (filter.operator === 'ilike') {
          queryBuilder = queryBuilder.ilike(column, `%${filter.value}%`);
        } else if (filter.operator === 'in' && Array.isArray(filter.value)) {
          queryBuilder = queryBuilder.in(column, filter.value);
        } else {
          // Default to equality for unrecognized operators
          queryBuilder = queryBuilder.eq(column, filter.value);
        }
      }
    }
    
    // Apply ordering if specified
    if (query.order && query.order.column) {
      const column = query.order.column.toLowerCase();
      queryBuilder = queryBuilder.order(column, { 
        ascending: query.order.ascending !== false 
      });
    }
    
    // Apply limit if specified
    if (query.limit && !isNaN(query.limit)) {
      queryBuilder = queryBuilder.limit(parseInt(query.limit));
    }
    
    // Execute the query
    const { data, error } = await queryBuilder;
    
    return await queryBuilder;
  } catch (error) {
    console.error('[Supabase] Error in fetchData:', error);
    return { error };
  }
};

// Helper function to convert camelCase to lowercase for database
export const toDatabaseFormat = (data) => {
  if (!data) {
    return data;
  }
  
  const formatted = {};
  Object.entries(data).forEach(([key, value]) => {
    // Convert key to lowercase
    const dbKey = key.toLowerCase();
    
    // Handle nested objects and arrays
    if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        // If it's an array, format each object in the array
        formatted[dbKey] = value.map(item => 
          typeof item === 'object' && item !== null 
            ? toDatabaseFormat(item) 
            : item
        );
      } else {
        // If it's an object, recursively format it
        formatted[dbKey] = toDatabaseFormat(value);
      }
    } else {
      formatted[dbKey] = value;
    }
  });
  
  return formatted;
};

export const insertData = async (table, data) => {
  // Convert any camelCase keys to lowercase for database
  const dbData = toDatabaseFormat(data);
  
  // Clean data to prevent database errors
  const cleanedData = cleanDataForDatabase(dbData);
  
  // Add timestamps
  const now = new Date().toISOString();
  
  // Insert data with timestamps and select the result
  return supabase.from(table).insert({
    ...cleanedData,
    createdat: now,
    updatedat: now
  }).select();
};

export const updateData = async (table, id, data) => {
  if (!table || !id || !data) {
    return { error: new Error('Table, ID, and data are required for update'), data: null };
  }

  try {
    // Convert any camelCase keys to lowercase for database
    const dbData = toDatabaseFormat(data);
    
    // Clean data to prevent database errors
    const cleanedData = cleanDataForDatabase(dbData);
    
    // Add updatedat timestamp
    const now = new Date().toISOString();
    const dataWithTimestamp = {
      ...cleanedData,
      updatedat: now
    };
    
    console.log('Updating data:', {
      table,
      id,
      data: dataWithTimestamp
    });

    const { data: result, error } = await supabase
      .from(table)
      .update(dataWithTimestamp)
      .eq('id', id)
      .select('*');
    
    if (error) {
      console.error(`Error updating ${table}:`, error);
      return { error, data: null };
    }

    if (!result || result.length === 0) {
      return { 
        error: new Error(`No ${table} record found with id ${id}`),
        data: null 
      };
    }
    
    return { data: result[0], error: null };
  } catch (error) {
    console.error(`Error updating ${table}:`, error);
    return { error, data: null };
  }
};

export const deleteData = async (table, id) => 
  supabase.from(table).delete().eq('id', id);

// Storage helpers
export const uploadFile = async (bucket, path, file) => 
  supabase.storage.from(bucket).upload(path, file);

export const getFileUrl = (bucket, path) => 
  supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

export const deleteFile = async (bucket, path) => 
  supabase.storage.from(bucket).remove([path]);

// Helper function to clean data before sending to the database
const cleanDataForDatabase = (data) => {
  const cleanedData = { ...data };
  
  // Handle numeric fields
  Object.keys(cleanedData).forEach(key => {
    // If the field is a numeric type but has an empty string value, set it to null
    if (cleanedData[key] === '' && (
      key === 'squarefeet' || 
      key === 'yearbuilt' || 
      key.includes('amount') || 
      key.includes('reading') || 
      key.includes('rate') || 
      key.includes('fee')
    )) {
      cleanedData[key] = null;
    }
  });
  
  return cleanedData;
};

// Function to invite a user via email
export const inviteUser = async (email, role = 'rentee') => {
  try {
    // Use magic link authentication instead of RPC
    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        data: {
          role: role
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      }
    });

    if (error) {
      console.error('Error inviting user:', error);
      return { success: false, data: null, error: error.message };
    }

    console.log('Invitation sent successfully to:', email);
    return { success: true, data, error: null };
  } catch (error) {
    console.error('Error inviting user:', error.message);
    return { success: false, data: null, error: error.message };
  }
}; 