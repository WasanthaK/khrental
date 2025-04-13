// Script to update the webhook URL for Evia Sign
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create a Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// New webhook URL pointing to Azure
const newWebhookUrl = 'https://khrental.azurewebsites.net/api/webhooks/evia';

async function updateWebhookUrl() {
  try {
    console.log(`Updating webhook URL to: ${newWebhookUrl}`);
    
    // Update the webhook URL in the database
    const { data, error } = await supabase
      .from('evia_sign_config')
      .update({ 
        config_value: newWebhookUrl,
        last_updated: new Date().toISOString()
      })
      .eq('config_key', 'webhook_url');
      
    if (error) {
      console.error('❌ Error updating webhook URL:', error);
    } else {
      console.log('✅ Webhook URL updated successfully!');
      
      // Read the updated config to confirm
      const { data: configData, error: readError } = await supabase
        .from('evia_sign_config')
        .select('*')
        .eq('config_key', 'webhook_url')
        .single();
        
      if (readError) {
        console.error('❌ Error reading updated config:', readError);
      } else {
        console.log('Current webhook configuration:', configData);
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the update
updateWebhookUrl(); 