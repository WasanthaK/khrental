// Example environment configuration
// Copy to env-config.js and add your real values
window._env_ = {
  VITE_SUPABASE_URL: 'https://your-project.supabase.co',
  VITE_SUPABASE_ANON_KEY: '', // Add your Supabase anon key here
  VITE_EVIA_SIGN_CLIENT_ID: '', // Add your Evia Sign client ID
  VITE_EVIA_SIGN_CLIENT_SECRET: '', // Add your Evia Sign client secret
  VITE_API_ENDPOINT: '', // Add your API endpoint URL
  VITE_SENDGRID_API_KEY: '', // Add your SendGrid API key (local development only)
  VITE_EMAIL_FROM: '', // Add sender email address
  VITE_EMAIL_FROM_NAME: '', // Add sender name
  VITE_EMAIL_FUNCTION_KEY: '', // Add function key for Azure Functions (if using)
  VITE_EMAIL_FUNCTION_URL: '', // Add Azure function URL (if using)
  VITE_APP_BASE_URL: '', // Base URL for the application
};

// Debug function to verify environment variables are loaded correctly
(function() {
  console.log("Environment Variables Loaded:", {
    VITE_SUPABASE_URL: window._env_.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: window._env_.VITE_SUPABASE_ANON_KEY ? "Present (hidden for security)" : "Missing",
    VITE_EVIA_SIGN_CLIENT_ID: window._env_.VITE_EVIA_SIGN_CLIENT_ID ? "Present" : "Missing",
    VITE_EVIA_SIGN_CLIENT_SECRET: window._env_.VITE_EVIA_SIGN_CLIENT_SECRET ? "Present" : "Missing",
    VITE_SENDGRID_API_KEY: window._env_.VITE_SENDGRID_API_KEY ? "Present (hidden for security)" : "Missing",
    VITE_EMAIL_FROM: window._env_.VITE_EMAIL_FROM
  });
  
  // Log the fixed URL configuration for debugging
  console.log("Fixed URL environment variables:", {
    VITE_SUPABASE_URL: window._env_.VITE_SUPABASE_URL,
    VITE_API_ENDPOINT: window._env_.VITE_API_ENDPOINT,
    VITE_APP_BASE_URL: window._env_.VITE_APP_BASE_URL
  });
})(); 