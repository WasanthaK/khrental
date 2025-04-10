import { createClient } from '@supabase/supabase-js';

// Log environment variables for debugging
console.log('Initializing Supabase client with environment variables:');
console.log('VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL);
console.log('VITE_SUPABASE_ANON_KEY:', import.meta.env.VITE_SUPABASE_ANON_KEY ? '***' : 'undefined');

// Validate environment variables
if (!import.meta.env.VITE_SUPABASE_URL) {
  console.error('Error: VITE_SUPABASE_URL is not defined');
  throw new Error('VITE_SUPABASE_URL is not defined');
}

if (!import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.error('Error: VITE_SUPABASE_ANON_KEY is not defined');
  throw new Error('VITE_SUPABASE_ANON_KEY is not defined');
}

// Create Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('Creating Supabase client with URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// Test the connection
supabase.auth.getSession()
  .then(({ data: { session }, error }) => {
    if (error) {
      console.error('Error testing Supabase connection:', error);
    } else {
      console.log('Supabase connection successful');
      if (session) {
        console.log('Active session found');
      } else {
        console.log('No active session');
      }
    }
  })
  .catch(error => {
    console.error('Error testing Supabase connection:', error);
  });

export default supabase; 