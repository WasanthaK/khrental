/**
 * Environment variable utility
 * Reads from Azure environment or local .env files
 */

const getEnvVar = (key) => {
  const browserWindow = typeof window !== 'undefined' ? window : undefined;
  const processEnv = globalThis.process?.env;

  // Try window._env_ first (for Azure)
  if (browserWindow?._env_ && browserWindow._env_[key]) {
    return browserWindow._env_[key];
  }
  // Then try import.meta.env (for local .env)
  if (typeof import.meta !== 'undefined' && import.meta.env?.[key]) {
    return import.meta.env[key] || '';
  }

  return processEnv?.[key] || '';
};

export const getApiBaseUrl = () => {
  const configuredApiUrl = getEnvVar('VITE_API_ENDPOINT');

  if (configuredApiUrl) {
    return configuredApiUrl.endsWith('/')
      ? configuredApiUrl.slice(0, -1)
      : configuredApiUrl;
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return '';
};

export const isMssqlApiEnabled = () => getEnvVar('VITE_USE_MSSQL_API') === 'true';

export const isDevBypassEnabled = () => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    return true;
  }

  return getEnvVar('VITE_ENABLE_DEV_BYPASS') === 'true';
};

// Get the application base URL consistently
export const getAppBaseUrl = () => {
  const browserWindow = typeof window !== 'undefined' ? window : undefined;

  // Check for a configured base URL from environment variables first
  const configuredBaseUrl = browserWindow?._env_?.VITE_APP_BASE_URL || 
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
  EVIA_SIGN_CLIENT_ID: getEnvVar('VITE_EVIA_SIGN_CLIENT_ID'),
  API_ENDPOINT: getEnvVar('VITE_API_ENDPOINT'),
  APP_BASE_URL: getEnvVar('VITE_APP_BASE_URL'),
  USE_MSSQL_API: getEnvVar('VITE_USE_MSSQL_API'),
  ENABLE_DEV_BYPASS: getEnvVar('VITE_ENABLE_DEV_BYPASS'),
}; 