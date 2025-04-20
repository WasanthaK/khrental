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
const defaultEnv = `# Supabase Configuration
VITE_SUPABASE_URL=https://vcorwfilylgtvzktszvi.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# API Endpoints
VITE_API_ENDPOINT=https://khrentals.kubeira.com/api

# Email Configuration
VITE_SENDGRID_API_KEY=your_sendgrid_api_key_here
VITE_EMAIL_FROM=noreply@khrentals.kubeira.com
VITE_EMAIL_FROM_NAME=KH Rentals

# evia Sign Configuration (if used)
VITE_EVIA_SIGN_CLIENT_ID=
VITE_EVIA_SIGN_CLIENT_SECRET=
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
  
  // Get Supabase URL
  const supabaseUrl = await question(`Enter your Supabase URL [${envContent.match(/VITE_SUPABASE_URL=(.+)/)?.[1] || ''}]: `);
  if (supabaseUrl) {
    envContent = envContent.replace(/VITE_SUPABASE_URL=.+/, `VITE_SUPABASE_URL=${supabaseUrl}`);
  }
  
  // Get Supabase Anon Key
  const supabaseAnonKey = await question('Enter your Supabase Anon Key: ');
  if (supabaseAnonKey) {
    envContent = envContent.replace(/VITE_SUPABASE_ANON_KEY=.+/, `VITE_SUPABASE_ANON_KEY=${supabaseAnonKey}`);
  }
  
  // Write the .env file
  fs.writeFileSync(envPath, envContent);
  console.log('.env file has been created successfully!');
  console.log('\nTo start the development server with these settings, run:');
  console.log('npm run dev');
  
  rl.close();
}

setupEnv().catch(err => {
  console.error('Error setting up environment:', err);
  rl.close();
  process.exit(1);
}); 