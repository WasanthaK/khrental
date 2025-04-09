// Generate a simple webhook configuration for Evia Sign
import fs from 'fs';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup file paths correctly with ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');

// Load environment variables
dotenv.config({ path: envPath });

const apiKey = process.env.VITE_SUPABASE_ANON_KEY;
const webhookUrl = process.env.VITE_EVIA_WEBHOOK_URL;

console.log('\n===== EVIA SIGN WEBHOOK CONFIGURATION =====\n');
console.log('To configure Evia Sign to work with your Supabase webhook:');
console.log('\n1. In your Evia Sign settings, add the following Authorization header to webhook requests:');
console.log(`\nAuthorization: Bearer ${apiKey}\n`);
console.log('2. Set the webhook URL to:');
console.log(`\n${webhookUrl}\n`);

// Save to a file for reference
const configInfo = `
# Evia Sign Webhook Configuration
# Generated on ${new Date().toISOString()}

WEBHOOK_URL=${webhookUrl}
AUTH_HEADER=Authorization: Bearer ${apiKey}
`;

fs.writeFileSync('evia-webhook-config.txt', configInfo);
console.log('This information has been saved to scripts/evia-webhook-config.txt\n');

console.log('Send this information to Evia Sign support to configure their webhook integration.'); 