/**
 * Test Supabase Authentication
 * 
 * Tests the connection to Supabase and authentication functionality
 * without the SafeURL wrapper.
 * 
 * Run with: node scripts/test-auth.js
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Use hardcoded values as a fallback
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://vcorwfilylgtvzktszvi.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_KEY) {
  console.error('Error: VITE_SUPABASE_ANON_KEY not found in environment');
  process.exit(1);
}

console.log('Testing Supabase connection with:');
console.log('URL:', SUPABASE_URL);
console.log('Key:', SUPABASE_KEY ? 'Present (hidden)' : 'Missing');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testConnection() {
  try {
    console.log('\nTesting basic connection to Supabase...');
    const { data, error } = await supabase.from('app_users').select('count');
    
    if (error) {
      throw error;
    }
    
    console.log('✅ Connection successful!');
    console.log('Data received:', data);
    
    return true;
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    return false;
  }
}

async function testAuth() {
  try {
    console.log('\nTesting Supabase Auth API...');
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      throw error;
    }
    
    console.log('✅ Auth API working!');
    console.log('Session status:', data.session ? 'Active' : 'No active session');
    
    return true;
  } catch (error) {
    console.error('❌ Auth API test failed:', error.message);
    return false;
  }
}

async function runTests() {
  const connectionSuccess = await testConnection();
  const authSuccess = await testAuth();
  
  console.log('\n--- Test Summary ---');
  console.log('Basic Connection:', connectionSuccess ? '✅ PASS' : '❌ FAIL');
  console.log('Auth API:', authSuccess ? '✅ PASS' : '❌ FAIL');
  
  if (connectionSuccess && authSuccess) {
    console.log('\n✅ All tests passed! Your Supabase configuration is working correctly.');
  } else {
    console.log('\n❌ Some tests failed. Please check your Supabase configuration.');
  }
}

runTests(); 