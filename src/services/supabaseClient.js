import { createClient } from '@supabase/supabase-js';
import { isValidUUID } from '../utils/validators.js';

// Initialize the Supabase client
const getEnvVar = (key) => {
  let value = null;
  
  // First try window._env_ (for production)
  const windowValue = window?._env_?.[key];
  if (windowValue) {
    value = windowValue;
    console.log(`[Supabase] Using window._env_ for ${key}`);
  }
  
  // Then try Vite's import.meta.env
  if (!value) {
    const viteValue = import.meta.env[key];
    if (viteValue) {
      value = viteValue;
      console.log(`[Supabase] Using import.meta.env for ${key}`);
    }
  }

  // Finally try process.env (for Node.js environment)
  if (!value) {
    const processValue = process.env?.[key];
    if (processValue) {
      value = processValue;
      console.log(`[Supabase] Using process.env for ${key}`);
    }
  }
  
  // Special handling for URL vars
  if (key === 'VITE_SUPABASE_URL' && value) {
    // Check if value is a template string or malformed URL
    if (value === 'VITE_SUPABASE_UR' || value.includes('VITE_SUPABASE_UR/')) {
      console.error(`ENV error: ${key} is using template string instead of actual URL: ${value}`);
      // Hardcode the correct URL as fallback
      return 'https://vcorwfilylgtvzktszvi.supabase.co';
    }
    
    // Ensure URL has http/https protocol
    if (!value.startsWith('http')) {
      return `https://${value}`;
    }
  }

  // If we get here and value is null, the variable is missing
  if (value === null) {
    console.error(`Environment variable ${key} is missing. Check your environment configuration.`);
    
    // Return fallback values for critical variables
    if (key === 'VITE_SUPABASE_URL') {
      return 'https://vcorwfilylgtvzktszvi.supabase.co';
    }
  }
  
  return value;
};

// Log the environment source we're using
console.log("[Supabase] Environment source check:", {
  window_env: window?._env_ ? "Available" : "Not available",
  import_meta: typeof import.meta !== 'undefined' ? "Available" : "Not available",
  process_env: typeof process !== 'undefined' && process.env ? "Available" : "Not available"
});

// Get Supabase URL and key with fallbacks
let supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
let supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

// Make absolutely sure we have a valid URL
if (!supabaseUrl) {
  supabaseUrl = 'https://vcorwfilylgtvzktszvi.supabase.co';
  console.warn("[Supabase] Using hardcoded URL as fallback");
}

// Use CORS proxy in development
if (import.meta.env.DEV && supabaseUrl) {
  // Store the original URL for logging
  const originalUrl = supabaseUrl;
  // Apply the proxy to the URL
  supabaseUrl = `http://localhost:9090/${supabaseUrl}`;
  console.log(`[Supabase] Using CORS proxy for development: ${originalUrl} -> ${supabaseUrl}`);
}

// Last attempt to get the anon key from window._env_
if (!supabaseAnonKey && window?._env_?.VITE_SUPABASE_ANON_KEY) {
  supabaseAnonKey = window._env_.VITE_SUPABASE_ANON_KEY;
  console.warn("[Supabase] Retrieved anon key from window._env_ as final fallback");
}

console.log("[Supabase] Configuration:", {
  url: supabaseUrl || "NOT SET",
  key_available: !!supabaseAnonKey
});

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase configuration error:', {
    url: supabaseUrl ? 'present' : 'missing',
    key: supabaseAnonKey ? 'present' : 'missing',
    env: {
      vite: import.meta.env?.VITE_SUPABASE_URL ? 'present' : 'missing',
      window: window?._env_?.VITE_SUPABASE_URL ? 'present' : 'missing',
      process: process.env?.VITE_SUPABASE_URL ? 'present' : 'missing'
    }
  });
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
      global: {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
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

    console.log("[Supabase] Creating client with URL:", supabaseUrl);
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, config);
  }
  return supabaseInstance;
};

// Export the singleton instance getter
export const supabase = getSupabaseClient();

// Test the connection on initialization
supabase.auth.getSession()
  .then(({ data: { session }, error }) => {
    if (error) {
      console.error('[Supabase] Error testing connection:', error);
    } else {
      console.log('[Supabase] Connection test successful');
      if (session) {
        console.log('[Supabase] Active session found');
      } else {
        console.log('[Supabase] No active session');
      }
    }
  })
  .catch(error => {
    console.error('[Supabase] Error testing connection:', error);
  });

// Authentication helpers
export const signUp = async (email, password) => {
  const client = getSupabaseClient();
  console.log('[Supabase] Signing up user:', email);
  const { data, error } = await client.auth.signUp({
    email,
    password,
  });
  console.log('[Supabase] Sign up result:', { success: !error, data, error });
  return { data, error };
};

// Enhanced sign in with debug logging
export const signIn = async (email, password) => {
  const client = getSupabaseClient();
  console.log('[Supabase] Attempting sign in for:', email);
  
  // Add additional logging to verify authentication payload
  console.log('[Supabase] Auth payload:', { 
    email,
    password_length: password ? password.length : 0
  });
  
  try {
    // Log before the API call
    console.log('[Supabase] Making auth API call to:', `${supabaseUrl}/auth/v1/token?grant_type=password`);
    
    const { data, error } = await client.auth.signInWithPassword({
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
      sessionExpiry: data.session?.expires_at,
      email: data.user?.email
    });

    return { data };
  } catch (error) {
    console.error('[Supabase] Unexpected error during sign in:', error);
    
    // Check for 406 Not Acceptable errors, which are often Accept header related
    if (error.message && error.message.includes('406')) {
      console.error('[Supabase] 406 Not Acceptable error - likely related to Accept header');
      console.log('[Supabase] Attempting to continue despite 406 error');
      
      // Fetch the user directly as a fallback
      try {
        const { data: userData } = await client.auth.getUser();
        if (userData?.user) {
          console.log('[Supabase] Successfully retrieved user after 406 error:', userData.user.id);
          return { 
            data: { 
              user: userData.user, 
              session: { access_token: 'fallback-token', user: userData.user } // Minimal session data
            } 
          };
        }
      } catch (fallbackError) {
        console.error('[Supabase] Failed fallback user fetch:', fallbackError);
      }
    }
    
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
  const client = getSupabaseClient();
  console.log('[Supabase] Getting current user');
  const { data, error } = await client.auth.getUser();
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
    redirectTo: `${window.location.origin}/auth/callback`,
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
    console.log('[Supabase] Sending invitation to user:', email, 'with role:', role);
    
    // First try the admin inviteUserByEmail method
    try {
      console.log('[Supabase] Attempting to use auth.admin.inviteUserByEmail');
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: { role },
        redirectTo: `${window.location.origin}/auth/callback?type=invite&role=${role}`,
      });
      
      if (!error) {
        console.log('[Supabase] Successfully sent invitation via admin API:', data);
        
        // Try to create an app_user record if one doesn't exist
        try {
          // Check if user already exists
          const { data: existingUser } = await supabase
            .from('app_users')
            .select('id, email')
            .eq('email', email)
            .maybeSingle();
          
          if (!existingUser) {
            // Create a placeholder user record that will be updated when they sign in
            const { data: newUser, error: userError } = await supabase
              .from('app_users')
              .insert({
                email: email,
                role: role,
                status: 'invited',
                createdat: new Date().toISOString(),
                updatedat: new Date().toISOString()
              })
              .select();
            
            if (userError) {
              console.error('[Supabase] Error creating placeholder user record:', userError);
            } else {
              console.log('[Supabase] Created placeholder user record:', newUser);
            }
          }
        } catch (userError) {
          console.error('[Supabase] Error checking/creating user record:', userError);
          // Continue with the invitation process even if this fails
        }
        
        return { success: true, data, error: null };
      } else {
        console.warn('[Supabase] Could not use admin invitation API, falling back to OTP:', error);
        // Fall through to OTP method below
      }
    } catch (adminError) {
      console.warn('[Supabase] Admin invitation API not available, falling back to OTP:', adminError);
      // Fall through to OTP method below
    }
    
    // Use magic link authentication as fallback
    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        data: {
          role: role
        },
        emailRedirectTo: `${window.location.origin}/auth/callback?type=invite`,
      }
    });

    if (error) {
      console.error('[Supabase] Error sending invitation:', error);
      return { success: false, data: null, error: error.message };
    }

    console.log('[Supabase] OTP/Magic link sent successfully to:', email);
    
    // Since we successfully sent an email, let's also create an app_user record if one doesn't exist
    try {
      // Check if user already exists
      const { data: existingUser } = await supabase
        .from('app_users')
        .select('id, email')
        .eq('email', email)
        .maybeSingle();
      
      if (!existingUser) {
        // Create a placeholder user record that will be updated when they sign in
        const { data: newUser, error: userError } = await supabase
          .from('app_users')
          .insert({
            email: email,
            role: role,
            status: 'invited',
            createdat: new Date().toISOString(),
            updatedat: new Date().toISOString()
          })
          .select();
        
        if (userError) {
          console.error('[Supabase] Error creating placeholder user record:', userError);
        } else {
          console.log('[Supabase] Created placeholder user record:', newUser);
        }
      }
    } catch (userError) {
      console.error('[Supabase] Error checking/creating user record:', userError);
      // Continue with the invitation process even if this fails
    }

    return { success: true, data, error: null };
  } catch (error) {
    console.error('[Supabase] Exception during user invitation:', error.message);
    return { success: false, data: null, error: error.message };
  }
};

/**
 * Utility to safely check if a user exists by ID
 * Uses filter instead of eq to avoid 406 errors
 * @param {string} userId - The user ID to check
 * @param {boolean} isAuthId - Whether userId is an auth_id (true) or regular id (false)
 * @returns {Promise<{exists: boolean, data: object|null, error: object|null}>}
 */
export const checkUserExists = async (userId, isAuthId = false) => {
  if (!userId) {
    return { exists: false, data: null, error: 'No user ID provided' };
  }
  
  try {
    // Choose the correct field to filter on
    const idField = isAuthId ? 'auth_id' : 'id';
    
    const { data, error } = await supabase
      .from('app_users')
      .select('id, name, email, auth_id')
      .filter(idField, 'eq', userId)
      .maybeSingle();
    
    if (error) {
      console.error(`Error checking if user exists by ${idField}:`, error);
      return { exists: false, data: null, error };
    }
    
    return { exists: !!data, data, error: null };
  } catch (error) {
    console.error('Exception checking if user exists:', error);
    return { exists: false, data: null, error };
  }
};

/**
 * Specialized function to invite team members
 * @param {string} email - Email address to invite
 * @param {string} role - Role to assign (staff, manager, maintenance_staff, etc.)
 * @param {object} userDetails - Additional user details to store
 * @returns {Promise<{success: boolean, message: string, error: string|null}>}
 */
export const inviteTeamMember = async (email, role, userDetails = {}) => {
  try {
    console.log('[Team] Inviting team member:', email, 'with role:', role);
    
    // First check if email exists in the system
    const { data: existingUsers } = await supabase
      .from('app_users')
      .select('id, email, role, status')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    
    if (existingUsers) {
      console.log('[Team] User already exists:', existingUsers);
      return { 
        success: false, 
        message: `User with email ${email} already exists in the system with role: ${existingUsers.role}`,
        error: 'USER_EXISTS'
      };
    }
    
    // Create the user record first
    const { data: newUser, error: insertError } = await supabase
      .from('app_users')
      .insert({
        email: email.toLowerCase(),
        role: role,
        status: 'invited',
        name: userDetails.name || '',
        contact_details: userDetails.contactDetails || {},
        user_type: 'staff',
        createdat: new Date().toISOString(),
        updatedat: new Date().toISOString()
      })
      .select();
    
    if (insertError) {
      console.error('[Team] Error creating user record:', insertError);
      return { 
        success: false, 
        message: `Failed to create user record: ${insertError.message}`,
        error: insertError.message
      };
    }
    
    // First try to use the admin invitation API
    try {
      console.log('[Team] Attempting to use auth.admin.inviteUserByEmail');
      const { data, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: { 
          role,
          app_user_id: newUser[0].id,
          force_password_change: true
        },
        redirectTo: `${window.location.origin}/auth/callback?type=invite&role=${role}`,
      });
      
      if (!inviteError) {
        console.log('[Team] Successfully sent invitation via admin API:', data);
        
        // Update the app_users table to mark as invited and link auth_id if available
        if (data?.user?.id) {
          await supabase
            .from('app_users')
            .update({ 
              invited: true,
              auth_id: data.user.id
            })
            .eq('id', newUser[0].id);
        }
        
        return { 
          success: true, 
          message: `Invitation sent to ${email} via admin API`, 
          error: null,
          userId: newUser[0].id
        };
      } else {
        console.warn('[Team] Could not use admin invitation API, falling back to OTP:', inviteError);
        // Fall through to OTP method below
      }
    } catch (adminError) {
      console.warn('[Team] Admin invitation API not available, falling back to OTP:', adminError);
      // Fall through to OTP method below
    }
    
    // Fall back to magic link if admin API fails
    const { error: magicLinkError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        data: { 
          role,
          app_user_id: newUser[0].id,
          force_password_change: true
        },
        emailRedirectTo: `${window.location.origin}/auth/callback?type=invite&role=${role}`,
      }
    });
    
    if (magicLinkError) {
      console.error('[Team] Error sending invitation email:', magicLinkError);
      
      // Delete the user record since the email failed
      await supabase
        .from('app_users')
        .delete()
        .eq('id', newUser[0].id);
        
      return { 
        success: false, 
        message: `Failed to send invitation email: ${magicLinkError.message}`,
        error: magicLinkError.message
      };
    }
    
    return { 
      success: true, 
      message: `Invitation sent to ${email}`, 
      error: null,
      userId: newUser[0].id
    };
  } catch (error) {
    console.error('[Team] Exception inviting team member:', error);
    return { 
      success: false, 
      message: `An unexpected error occurred: ${error.message}`,
      error: error.message
    };
  }
};