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

// Export environment variables directly
export const ENV = {
  SUPABASE_URL: getEnvVar('VITE_SUPABASE_URL'),
  SUPABASE_ANON_KEY: getEnvVar('VITE_SUPABASE_ANON_KEY'),
  EVIA_SIGN_CLIENT_ID: getEnvVar('VITE_EVIA_SIGN_CLIENT_ID'),
  EVIA_SIGN_CLIENT_SECRET: getEnvVar('VITE_EVIA_SIGN_CLIENT_SECRET'),
  API_ENDPOINT: getEnvVar('VITE_API_ENDPOINT'),
}; 