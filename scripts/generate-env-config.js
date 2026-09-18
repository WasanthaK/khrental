// This script generates env-config.js from .env variables
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Get directory name in ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from .env file
dotenv.config();

// The variables to expose to the browser
const envVars = [
  'VITE_EVIA_SIGN_CLIENT_ID',
  'VITE_API_ENDPOINT',
  'VITE_USE_MSSQL_API',
  'VITE_ENABLE_DEV_BYPASS',
  'VITE_EMAIL_FROM',
  'VITE_EMAIL_FROM_NAME',
  'VITE_APP_BASE_URL'
];

// Create the window._env_ object content
let envConfigContent = 'window._env_ = {\n';

envVars.forEach(varName => {
  // Get the value from process.env, or use an empty string as default
  const value = process.env[varName] || '';
  
  // Add to the config file with proper escaping
  envConfigContent += `  ${varName}: '${value.replace(/'/g, "\\'")}',\n`;
});

envConfigContent += '};\n\n';

// Add the debugging code
envConfigContent += `
// Debug function to verify environment variables are loaded correctly
(function() {
  console.log("Environment Variables Loaded:", {
    VITE_EVIA_SIGN_CLIENT_ID: window._env_.VITE_EVIA_SIGN_CLIENT_ID ? "Present" : "Missing",
    VITE_USE_MSSQL_API: window._env_.VITE_USE_MSSQL_API,
    VITE_ENABLE_DEV_BYPASS: window._env_.VITE_ENABLE_DEV_BYPASS,
    VITE_EMAIL_FROM: window._env_.VITE_EMAIL_FROM
  });
  
  // Log the fixed URL configuration for debugging
  console.log("Fixed URL environment variables:", {
    VITE_API_ENDPOINT: window._env_.VITE_API_ENDPOINT,
    VITE_APP_BASE_URL: window._env_.VITE_APP_BASE_URL
  });
})();
`;

// Write the file to public/env-config.js
const outputPath = path.resolve(__dirname, '../public/env-config.js');
fs.writeFileSync(outputPath, envConfigContent);

console.log(`Generated ${outputPath} with environment variables from .env`); 