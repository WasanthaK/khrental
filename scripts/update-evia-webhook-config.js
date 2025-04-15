/**
 * Updates the Evia webhook configuration in the database
 * 
 * This script:
 * 1. Updates the webhook URL in the evia_sign_config table
 * 2. Ensures the webhook_event_trigger is installed
 * 
 * Run with: node scripts/update-evia-webhook-config.js
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Supabase URL and key are required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// The main webhook server URL
const WEBHOOK_URL = 'https://kh-reantals-webhook.azurewebsites.net/webhook/evia-sign';

async function updateWebhookConfig() {
  try {
    console.log('Updating Evia Sign webhook configuration...');
    
    // 1. Update the webhook URL in the evia_sign_config table
    const { data: configData, error: configError } = await supabase
      .from('evia_sign_config')
      .update({ 
        config_value: WEBHOOK_URL,
        last_updated: new Date().toISOString()
      })
      .eq('config_key', 'webhook_url')
      .select();
    
    if (configError) {
      console.error('Error updating webhook URL in evia_sign_config:', configError);
    } else if (configData && configData.length > 0) {
      console.log(`✅ Updated webhook URL to: ${WEBHOOK_URL}`);
    } else {
      console.log('⚠️ No rows updated. Checking if config exists...');
      
      // Check if the config row exists
      const { data: checkData, error: checkError } = await supabase
        .from('evia_sign_config')
        .select('*')
        .eq('config_key', 'webhook_url');
      
      if (checkError) {
        console.error('Error checking evia_sign_config:', checkError);
      } else if (checkData && checkData.length === 0) {
        // Need to insert the config
        const { data: insertData, error: insertError } = await supabase
          .from('evia_sign_config')
          .insert([{
            config_key: 'webhook_url',
            config_value: WEBHOOK_URL,
            is_secret: false,
            description: 'Webhook URL to receive Evia Sign events'
          }])
          .select();
        
        if (insertError) {
          console.error('Error inserting webhook URL config:', insertError);
        } else {
          console.log(`✅ Inserted new webhook URL: ${WEBHOOK_URL}`);
        }
      }
    }
    
    // 2. Check if the webhook_event_trigger is installed
    // Execute SQL to check if trigger exists
    const { data: triggerCheck, error: triggerCheckError } = await supabase.rpc('exec_sql', {
      query: `
        SELECT EXISTS (
          SELECT 1 
          FROM pg_trigger 
          WHERE tgname = 'webhook_event_trigger'
        );
      `
    });
    
    if (triggerCheckError) {
      console.error('Error checking for webhook trigger:', triggerCheckError);
    } else {
      const triggerExists = triggerCheck && triggerCheck[0] && triggerCheck[0].exists;
      
      if (triggerExists) {
        console.log('✅ webhook_event_trigger is already installed');
      } else {
        console.log('⚠️ webhook_event_trigger is not installed. Installing...');
        
        // Read the SQL file with the trigger definition
        const sqlPath = path.join(process.cwd(), 'scripts', 'createWebhookEventsTable.sql');
        let sql;
        
        try {
          sql = fs.readFileSync(sqlPath, 'utf8');
        } catch (readError) {
          console.error('Error reading SQL file:', readError);
          console.log('Creating trigger from hardcoded definition...');
          
          // Use hardcoded SQL as fallback
          sql = `
          -- Add a function to automatically update agreement status when a webhook is received
          CREATE OR REPLACE FUNCTION public.update_agreement_from_webhook()
          RETURNS TRIGGER AS $$
          DECLARE
              status_map TEXT;
              signatory_data JSONB;
              current_signatories JSONB;
          BEGIN
              -- Map event_id to signature_status
              CASE NEW.event_id
                  WHEN 1 THEN status_map := 'pending';
                  WHEN 2 THEN status_map := 'in_progress';
                  WHEN 3 THEN status_map := 'completed';
                  ELSE status_map := NULL;
              END CASE;
              
              -- Only proceed if we have a valid status map and request_id
              IF status_map IS NULL OR NEW.request_id IS NULL THEN
                  RETURN NEW;
              END IF;
              
              -- Handle signatory data for EventId 2 (SignatoryCompleted)
              IF NEW.event_id = 2 AND NEW.user_email IS NOT NULL THEN
                  -- Create signatory info
                  signatory_data := jsonb_build_object(
                      'name', COALESCE(NEW.user_name, 'Unknown'),
                      'email', NEW.user_email,
                      'status', 'completed',
                      'signedAt', COALESCE(NEW.event_time, NOW())
                  );
                  
                  -- Get current signatories if any
                  SELECT signatories_status INTO current_signatories
                  FROM agreements
                  WHERE eviasignreference = NEW.request_id;
                  
                  -- Initialize if null
                  IF current_signatories IS NULL THEN
                      current_signatories := '[]'::jsonb;
                  END IF;
                  
                  -- Add or update signatory
                  -- Check if signatory already exists
                  WITH existing_signatory AS (
                      SELECT jsonb_array_elements(current_signatories) ->> 'email' as email
                  )
                  SELECT 
                      CASE 
                          WHEN EXISTS (SELECT 1 FROM existing_signatory WHERE email = NEW.user_email) THEN
                              (
                                  SELECT jsonb_agg(
                                      CASE 
                                          WHEN (x ->> 'email') = NEW.user_email THEN signatory_data
                                          ELSE x
                                      END
                                  )
                                  FROM jsonb_array_elements(current_signatories) x
                              )
                          ELSE
                              jsonb_insert(current_signatories, '{0}', signatory_data)
                      END INTO current_signatories;
              END IF;
              
              -- Update agreement based on event type
              IF NEW.event_id = 3 THEN
                  -- For completed events (signed)
                  UPDATE agreements
                  SET 
                      signature_status = status_map,
                      status = 'signed',
                      signature_completed_at = COALESCE(NEW.event_time, NOW()),
                      updatedat = NOW()
                  WHERE 
                      eviasignreference = NEW.request_id;
              ELSIF NEW.event_id = 2 THEN
                  -- For signatory completed events (partially signed)
                  UPDATE agreements
                  SET 
                      signature_status = status_map,
                      status = 'partially_signed',
                      signatories_status = current_signatories,
                      updatedat = NOW()
                  WHERE 
                      eviasignreference = NEW.request_id;
              ELSIF NEW.event_id = 1 THEN
                  -- For sign request received events (pending signature)
                  UPDATE agreements
                  SET 
                      signature_status = status_map,
                      status = 'pending_signature',
                      signature_sent_at = COALESCE(NEW.event_time, NOW()),
                      updatedat = NOW()
                  WHERE 
                      eviasignreference = NEW.request_id;
              END IF;
              
              RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;

          -- Create the trigger to automatically update agreements when webhooks are received
          DROP TRIGGER IF EXISTS webhook_event_trigger ON public.webhook_events;
          CREATE TRIGGER webhook_event_trigger
          AFTER INSERT ON public.webhook_events
          FOR EACH ROW
          EXECUTE FUNCTION public.update_agreement_from_webhook();
          `;
        }
        
        // Execute the SQL to create the trigger
        const { error: createTriggerError } = await supabase.rpc('exec_sql', {
          query: sql
        });
        
        if (createTriggerError) {
          console.error('Error creating webhook trigger:', createTriggerError);
        } else {
          console.log('✅ webhook_event_trigger installed successfully');
        }
      }
    }
    
    console.log('Webhook configuration update completed');
  } catch (error) {
    console.error('Error updating webhook configuration:', error);
  }
}

// Run the update function
updateWebhookConfig(); 