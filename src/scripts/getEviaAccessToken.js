// Script to obtain an Evia Sign access token
// Run with: node src/scripts/getEviaAccessToken.js

const dotenv = require('dotenv');
const fetch = require('node-fetch');
const readline = require('readline');

// Load environment variables
dotenv.config();

const CLIENT_ID = process.env.VITE_EVIA_SIGN_CLIENT_ID;
const CLIENT_SECRET = process.env.VITE_EVIA_SIGN_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: Client ID or Client Secret not found in .env file');
  console.log('Please ensure VITE_EVIA_SIGN_CLIENT_ID and VITE_EVIA_SIGN_CLIENT_SECRET are set in your .env file');
  process.exit(1);
}

// Step 1: Generate the authorization URL - this will be used in a browser
const authUrl = `https://evia.enadocapp.com/_apis/falcon/auth/oauth2/authorize?application_state=external&resource=RESOURCE_APPLICATION&client_id=${CLIENT_ID}&response_type=code&redirect_uri=http://localhost:5174/auth/callback`;

console.log('\n=== Evia Sign Authentication Process ===\n');
console.log('1. Open this URL in your browser:');
console.log(authUrl);
console.log('\n2. Log in and authorize the application');
console.log('3. You will be redirected to a callback URL with a code parameter');
console.log('4. Copy the "code" parameter from the URL');
console.log('\nExample: http://localhost:5174/auth/callback?code=ABCDEF123456');
console.log('The code would be: ABCDEF123456\n');

// Prompt for the code
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter the authorization code from the callback URL: ', async (code) => {
  try {
    // Step 2: Exchange the authorization code for an access token
    const tokenResponse = await fetch('https://evia.enadocapp.com/_apis/falcon/auth/api/v1/Token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Failed to obtain token: ${tokenResponse.status} ${tokenResponse.statusText}\n${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    
    console.log('\n=== Success! ===\n');
    console.log('Access Token:', tokenData.authToken);
    console.log('Refresh Token:', tokenData.refreshToken);
    console.log('\nAdd this to your .env file:');
    console.log(`VITE_EVIA_ACCESS_TOKEN=${tokenData.authToken}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    rl.close();
  }
}); 