import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables manually
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Log available environment variables (without showing sensitive values)
console.log('Environment variables loaded. Available keys:', Object.keys(process.env));

// Set up Supabase client with service role key
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://vcorwfilylgtvzktszvi.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is not set.');
  console.error('Please create a .env file in the root directory with the following content:');
  console.error('SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here');
  process.exit(1);
}

console.log(`Connecting to Supabase at ${supabaseUrl}`);
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const BUCKET_POLICIES = {
  'images': {
    folders: ['properties', 'maintenance', 'utility-readings'],
    policies: [
      {
        name: 'Allow public read access',
        definition: `(bucket_id = 'images')`,
        operation: 'SELECT'
      },
      {
        name: 'Allow authenticated users to upload',
        definition: `(bucket_id = 'images' AND auth.role() = 'authenticated')`,
        operation: 'INSERT'
      },
      {
        name: 'Allow authenticated users to update their files',
        definition: `(bucket_id = 'images' AND auth.role() = 'authenticated')`,
        operation: 'UPDATE'
      },
      {
        name: 'Allow authenticated users to delete their files',
        definition: `(bucket_id = 'images' AND auth.role() = 'authenticated')`,
        operation: 'DELETE'
      }
    ]
  },
  'files': {
    folders: ['agreements', 'id-copies', 'documents', 'payment-proofs'],
    policies: [
      {
        name: 'Allow public read access',
        definition: `(bucket_id = 'files')`,
        operation: 'SELECT'
      },
      {
        name: 'Allow authenticated users to upload',
        definition: `(bucket_id = 'files' AND auth.role() = 'authenticated')`,
        operation: 'INSERT'
      },
      {
        name: 'Allow authenticated users to update their files',
        definition: `(bucket_id = 'files' AND auth.role() = 'authenticated')`,
        operation: 'UPDATE'
      },
      {
        name: 'Allow authenticated users to delete their files',
        definition: `(bucket_id = 'files' AND auth.role() = 'authenticated')`,
        operation: 'DELETE'
      }
    ]
  }
};

async function setupStoragePolicies() {
  console.log('Starting storage policy setup...');

  try {
    // Enable RLS on storage.objects table
    const { error: rlsError } = await supabase.rpc('enable_rls', {
      table_name: 'storage.objects'
    });

    if (rlsError) {
      console.error('Error enabling RLS:', rlsError);
      throw rlsError;
    }

    console.log('RLS enabled on storage.objects table');

    // Create policies for each bucket
    for (const [bucketName, config] of Object.entries(BUCKET_POLICIES)) {
      console.log(`Setting up policies for bucket ${bucketName}...`);

      // Create policies for each operation
      for (const policy of config.policies) {
        const policyName = `${bucketName}_${policy.operation.toLowerCase()}`;
        
        console.log(`Creating policy ${policyName}...`);

        try {
          const { error: policyError } = await supabase.rpc('create_policy', {
            table_name: 'storage.objects',
            policy_name: policyName,
            definition: policy.definition,
            operation: policy.operation
          });

          if (policyError) {
            console.error(`Error creating policy ${policyName}:`, policyError);
          } else {
            console.log(`Policy ${policyName} created successfully`);
          }
        } catch (error) {
          console.error(`Failed to create policy ${policyName}:`, error);
        }
      }
    }

    console.log('Storage policy setup completed successfully!');

  } catch (error) {
    console.error('Storage policy setup failed:', error);
    process.exit(1);
  }
}

// Run the setup
setupStoragePolicies(); 