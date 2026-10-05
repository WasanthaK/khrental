// This script helps set up the .env file for KH Rentals
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { promisify } from 'util';

// Get directory name in ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const envExamplePath = path.join(rootDir, '.env.example');

// Default values for required environment variables
const defaultEnv = `# API Configuration
VITE_API_ENDPOINT=https://khrentals.kubeira.com
VITE_USE_MSSQL_API=true
VITE_APP_BASE_URL=https://khrentals.kubeira.com

# Server Email Configuration
TWILIO_SENDGRID_API_KEY=your_twilio_sendgrid_api_key_here
VITE_EMAIL_FROM=noreply@khrentals.kubeira.com
VITE_EMAIL_FROM_NAME=KH Rentals

# Evia Sign Configuration
VITE_EVIA_SIGN_CLIENT_ID=
EVIA_SIGN_CLIENT_SECRET=
EVIA_SIGN_API_KEY=
`;

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = promisify(rl.question).bind(rl);

async function setupEnv() {
  console.log('Setting up environment variables for KH Rentals...');
  
  // Check if .env file already exists
  if (fs.existsSync(envPath)) {
    const overwrite = await question('An .env file already exists. Do you want to overwrite it? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('Setup canceled. Existing .env file left unchanged.');
      rl.close();
      return;
    }
  }

  let envContent = '';
  
  // Try to copy from .env.example if it exists
  if (fs.existsSync(envExamplePath)) {
    envContent = fs.readFileSync(envExamplePath, 'utf8');
    console.log('Using .env.example as a template.');
  } else {
    // Use default values
    envContent = defaultEnv;
    console.log('Creating new .env file with default values.');
  }
  
  const apiEndpoint = await question(`Enter your API endpoint [${envContent.match(/VITE_API_ENDPOINT=(.+)/)?.[1] || ''}]: `);
  if (apiEndpoint) {
    envContent = envContent.replace(/VITE_API_ENDPOINT=.+/, `VITE_API_ENDPOINT=${apiEndpoint}`);
  }

  const appBaseUrl = await question(`Enter your app base URL [${envContent.match(/VITE_APP_BASE_URL=(.+)/)?.[1] || ''}]: `);
  if (appBaseUrl) {
    envContent = envContent.replace(/VITE_APP_BASE_URL=.+/, `VITE_APP_BASE_URL=${appBaseUrl}`);
  }
  
  // Get Twilio SendGrid API Key
  const sendgridApiKey = await question('Enter your Twilio SendGrid API Key (server only): ');
  if (sendgridApiKey) {
    if (/TWILIO_SENDGRID_API_KEY=.+/.test(envContent)) {
      envContent = envContent.replace(/TWILIO_SENDGRID_API_KEY=.+/, `TWILIO_SENDGRID_API_KEY=${sendgridApiKey}`);
    } else if (/SENDGRID_API_KEY=.+/.test(envContent)) {
      envContent = envContent.replace(/SENDGRID_API_KEY=.+/, `SENDGRID_API_KEY=${sendgridApiKey}`);
    } else {
      envContent += `\nTWILIO_SENDGRID_API_KEY=${sendgridApiKey}`;
    }
  }

  const eviaClientSecret = await question('Enter your Evia Sign client secret (server only, optional): ');
  if (eviaClientSecret) {
    envContent = envContent.replace(/EVIA_SIGN_CLIENT_SECRET=.*/, `EVIA_SIGN_CLIENT_SECRET=${eviaClientSecret}`);
  }

  const eviaApiKey = await question('Enter your Evia Sign integration API key (server only, optional): ');
  if (eviaApiKey) {
    envContent = envContent.replace(/EVIA_SIGN_API_KEY=.*/, `EVIA_SIGN_API_KEY=${eviaApiKey}`);
  }
  
  // Write the .env file
  fs.writeFileSync(envPath, envContent);
  console.log('.env file has been created successfully!');
  console.log('\nNOTE: Keep TWILIO_SENDGRID_API_KEY, SENDGRID_API_KEY, EVIA_SIGN_CLIENT_SECRET, and EVIA_SIGN_API_KEY on the server only.');
  console.log('\nTo start the development server with these settings, run:');
  console.log('npm run dev:with-proxy');
  
  rl.close();
}

setupEnv().catch(err => {
  console.error('Error setting up environment:', err);
  rl.close();
  process.exit(1);
}); 