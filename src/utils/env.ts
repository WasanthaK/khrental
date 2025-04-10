/// <reference types="vite/client" />

type EnvConfig = {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  VITE_EVIA_SIGN_CLIENT_ID: string;
  VITE_EVIA_SIGN_CLIENT_SECRET: string;
  VITE_API_ENDPOINT: string;
  VITE_WEBHOOK_URL: string;
};

declare global {
  interface Window {
    _env_?: EnvConfig;
  }
}

const getEnvVar = (key: keyof EnvConfig): string => {
  if (window._env_ && window._env_[key]) {
    return window._env_[key];
  }
  return import.meta.env[key] || '';
};

// Ensure URL environment variables have proper protocol
const ensureProtocol = (url: string): string => {
  if (!url) return 'https://example.com'; // Provide a fallback valid URL
  return url.startsWith('http://') || url.startsWith('https://') 
    ? url 
    : `https://${url}`;
};

// Create URL-safe getters for environment variables
const getSafeURL = (key: keyof EnvConfig): string => {
  return ensureProtocol(getEnvVar(key));
};

// Export environment variables with proper handling
export const ENV = {
  SUPABASE_URL: getSafeURL('VITE_SUPABASE_URL'),
  SUPABASE_ANON_KEY: getEnvVar('VITE_SUPABASE_ANON_KEY'),
  EVIA_SIGN_CLIENT_ID: getEnvVar('VITE_EVIA_SIGN_CLIENT_ID'),
  EVIA_SIGN_CLIENT_SECRET: getEnvVar('VITE_EVIA_SIGN_CLIENT_SECRET'),
  API_ENDPOINT: getSafeURL('VITE_API_ENDPOINT'),
  WEBHOOK_URL: getSafeURL('VITE_WEBHOOK_URL'),
} as const; 