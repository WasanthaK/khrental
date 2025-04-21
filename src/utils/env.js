/**
 * Environment variable utility
 * Reads from Azure environment or local .env files
 */

const getEnvVar = (key) => {
  // Try window._env_ first (for Azure)
  if (window._env_ && window._env_[key]) {
    return window._env_[key];
  }
  // Then try import.meta.env (for local .env)
  return import.meta.env[key] || '';
};

// Get the application base URL consistently
export const getAppBaseUrl = () => {
  // Check for a configured base URL from environment variables first
  const configuredBaseUrl = window._env_?.VITE_APP_BASE_URL || 
                           import.meta.env?.VITE_APP_BASE_URL;
  
  if (configuredBaseUrl) {
    // Log where we got the URL from for debugging
    console.log(`[getAppBaseUrl] Using configured base URL from environment: ${configuredBaseUrl}`);
    
    // Ensure the URL doesn't have a trailing slash
    return configuredBaseUrl.endsWith('/') 
      ? configuredBaseUrl.slice(0, -1) 
      : configuredBaseUrl;
  }
  
  // In a browser context, use the actual origin, but only in production
  if (!import.meta.env.DEV && typeof window !== 'undefined' && window.location) {
    console.log(`[getAppBaseUrl] Using window.location.origin: ${window.location.origin}`);
    return window.location.origin;
  }
  
  // For development or test environments, always use the production URL to avoid localhost links
  console.log('[getAppBaseUrl] Using fallback production URL');
  return 'https://khrentals.kubeira.com';
};

// Export environment variables directly
export const ENV = {
  SUPABASE_URL: getEnvVar('VITE_SUPABASE_URL'),
  SUPABASE_ANON_KEY: getEnvVar('VITE_SUPABASE_ANON_KEY'),
  EVIA_SIGN_CLIENT_ID: getEnvVar('VITE_EVIA_SIGN_CLIENT_ID'),
  EVIA_SIGN_CLIENT_SECRET: getEnvVar('VITE_EVIA_SIGN_CLIENT_SECRET'),
  API_ENDPOINT: getEnvVar('VITE_API_ENDPOINT'),
}; 