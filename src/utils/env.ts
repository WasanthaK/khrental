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

export const ENV = {
  SUPABASE_URL: getEnvVar('VITE_SUPABASE_URL'),
  SUPABASE_ANON_KEY: getEnvVar('VITE_SUPABASE_ANON_KEY'),
  EVIA_SIGN_CLIENT_ID: getEnvVar('VITE_EVIA_SIGN_CLIENT_ID'),
  EVIA_SIGN_CLIENT_SECRET: getEnvVar('VITE_EVIA_SIGN_CLIENT_SECRET'),
  API_ENDPOINT: getEnvVar('VITE_API_ENDPOINT'),
  WEBHOOK_URL: getEnvVar('VITE_WEBHOOK_URL'),
} as const; 