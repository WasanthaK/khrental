import { supabase } from '../services/supabaseClient';

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

        const { error: policyError } = await supabase.rpc('create_policy', {
          table_name: 'storage.objects',
          policy_name: policyName,
          definition: policy.definition,
          operation: policy.operation
        });

        if (policyError) {
          console.error(`Error creating policy ${policyName}:`, policyError);
          throw policyError;
        }
      }
    }

    console.log('Storage policy setup completed successfully!');

  } catch (error) {
    console.error('Storage policy setup failed:', error);
    throw error;
  }
}

// Run the setup
setupStoragePolicies().catch(console.error); 