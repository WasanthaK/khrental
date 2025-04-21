import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { 
  cleanupPropertyImages, 
  cleanupIdCopyImages, 
  cleanupPaymentProofImages, 
  cleanupUtilityReadingImages,
  cleanupAllImages
} from '../utils/cleanupImages';
import { applyAuthFieldsMigration, applyAppUsersMigration } from '../utils/dbMigration';
import { inviteRentee, inviteTeamMember, linkUserRecord } from '../services/userService';
import { inviteAppUser, linkAppUser, createAppUser } from '../services/appUserService';
import { supabase } from '../services/supabaseClient';
import { toast } from 'react-toastify';
import AuthUserLinking from '../components/AuthUserLinking';
import { useAuth } from '../hooks/useAuth';
import { runCreateAppUsersTableSQL, createTestRentee } from '../utils/dbSetup';
import { Document, Paragraph, TextRun, Packer } from 'docx';
import { testFileUpload, createRequiredBuckets } from '../services/fileUploadTest';
import SqlMigration from '../components/admin/SqlMigration';
import SignatureTestingTools from '../components/admin/SignatureTestingTools';
import EviaSignTesting from '../components/admin/EviaSignTesting';
import WebhookEvents from '../components/admin/WebhookEvents';
import WebhookProvider from '../contexts/WebhookContext';
import EnvVarStatus from '../components/admin/EnvVarStatus';

const AdminTools = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [testEmail, setTestEmail] = useState('');
  const [testInviteType, setTestInviteType] = useState('rentee');
  const [migrationInstructions, setMigrationInstructions] = useState('');
  const [appUsersMigrationInstructions, setAppUsersMigrationInstructions] = useState('');
  const [sqlInstructions, setSqlInstructions] = useState('');
  
  // New state for auth linking
  const [authLinking, setAuthLinking] = useState({
    loading: false,
    authUsers: [],
    teamMembers: [],
    selectedAuthId: '',
    selectedTeamMemberId: '',
    error: null
  });

  // New state for admin user creation
  const [adminUser, setAdminUser] = useState({
    email: '',
    name: '',
    loading: false,
    error: null
  });

  // New state for storage test
  const [storageTest, setStorageTest] = useState({
    loading: false,
    error: null,
    result: null
  });

  // New state for storage management
  const [storageStatus, setStorageStatus] = useState({
    loading: false,
    error: null,
    success: null,
    buckets: []
  });

  // Add a diagnostic section
  const [status, setStatus] = useState({ 
    invoiceServiceTest: { success: false, message: 'Not tested' }
  });

  // Handle tab selection
  const handleTabClick = (path) => {
    navigate(path);
  };
  
  // Check if we're at the main admin tools page or a nested route
  const isRoot = location.pathname === '/admin-dashboard';
  
  // Render nested routes through the Outlet if we're not at the root
  if (!isRoot) {
    return <Outlet />;
  }

  const handleCleanup = async (cleanupFunction, name) => {
    setLoading(true);
    setResults(null);
    setError(null);
    try {
      const result = await cleanupFunction();
      setResults({ ...result, name });
    } catch (err) {
      console.error('Error running cleanup:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRunMigration = async () => {
    try {
      setMigrationLoading(true);
      setError(null);
      setMigrationInstructions('');
      
      const result = await applyAuthFieldsMigration();
      
      if (result.success) {
        toast.success('Database connection verified successfully!');
        
        // Set the SQL instructions to display to the user
        setMigrationInstructions(`
-- Add authid and invited fields to rentees table
ALTER TABLE rentees
ADD COLUMN IF NOT EXISTS authid uuid,
ADD COLUMN IF NOT EXISTS invited boolean DEFAULT false;

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_rentees_authid ON rentees(authid);
        `);
      } else {
        toast.error(`Database check failed: ${result.error}`);
        setError(result.error);
      }
    } catch (error) {
      console.error('Error checking database:', error);
      setError(error.message);
      toast.error(`Error checking database: ${error.message}`);
    } finally {
      setMigrationLoading(false);
    }
  };
  
  const handleTestInvite = async () => {
    try {
      if (!testEmail) {
        toast.error('Please enter an email address');
        return;
      }
      
      setInviteLoading(true);
      setError(null);
      
      let result;
      if (testInviteType === 'rentee') {
        result = await inviteRentee(testEmail, 'Test Rentee', '00000000-0000-0000-0000-000000000000');
      } else {
        result = await inviteTeamMember(testEmail, 'Test Team Member', 'staff', '00000000-0000-0000-0000-000000000000');
      }
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      toast.success(`Invitation sent to ${testEmail}`);
    } catch (error) {
      console.error('Error testing invitation:', error.message);
      setError(error.message);
      toast.error(`Error sending invitation: ${error.message}`);
    } finally {
      setInviteLoading(false);
    }
  };

  // Load auth users and team members for linking
  const handleLoadAuthUsers = async () => {
    try {
      console.log("Starting to load auth users...");
      setAuthLinking(prev => ({ ...prev, loading: true, error: null }));
      
      // Fetch team members
      const { data: teamMembers, error: teamError } = await supabase
        .from('app_users')
        .select('id, name, contact_details, auth_id, role')
        .eq('user_type', 'staff');
      
      console.log("Team members loaded:", teamMembers);
      
      if (teamError) {
        console.error("Team members error:", teamError);
        throw new Error(`Error fetching team members: ${teamError.message}`);
      }
      
      // We can't use admin.listUsers without service role, so we'll manually add users
      const manualAuthUsers = [
        { 
          id: '05ea8a5d-f102-40df-9579-7f7c9c3476a1', 
          email: 'wweerakoone@gmail.com',
          user_metadata: { name: 'Wasantha Weerakoone' } 
        },
        { 
          id: 'b8baac5e-f16b-4cb5-95ef-391bafd67555', 
          email: 'madhu@kubeira.com',
          user_metadata: { name: 'Madhu' } 
        }
      ];
      
      console.log("Manual auth users:", manualAuthUsers);
      
      setAuthLinking(prev => {
        const newState = {
          ...prev,
          authUsers: manualAuthUsers,
          teamMembers: teamMembers || [],
          loading: false
        };
        console.log("New auth linking state:", newState);
        return newState;
      });
      
      toast.success('Users loaded successfully');
    } catch (error) {
      console.error('Error loading users for linking:', error);
      setAuthLinking(prev => ({
        ...prev, 
        loading: false,
        error: error.message
      }));
      toast.error(`Error loading users: ${error.message}`);
    }
  };
  
  // Link an auth user to a team member
  const handleLinkUser = async () => {
    try {
      const { selectedAuthId, selectedTeamMemberId } = authLinking;
      
      if (!selectedAuthId || !selectedTeamMemberId) {
        toast.error('Please select both an auth user and a team member');
        return;
      }
      
      setAuthLinking(prev => ({ ...prev, loading: true, error: null }));
      
      const result = await linkUserRecord(selectedAuthId, selectedTeamMemberId, 'staff');
      
      if (!result.success) {
        throw new Error(`Error linking user: ${result.error}`);
      }
      
      // Update the local state to reflect the change
      setAuthLinking(prev => ({
        ...prev,
        teamMembers: prev.teamMembers.map(tm => 
          tm.id === selectedTeamMemberId 
            ? { ...tm, auth_id: selectedAuthId }
            : tm
        ),
        loading: false
      }));
      
      toast.success('User linked successfully');
    } catch (error) {
      console.error('Error linking user:', error);
      setAuthLinking(prev => ({
        ...prev, 
        loading: false,
        error: error.message
      }));
      toast.error(`Error linking user: ${error.message}`);
    }
  };

  // Run the app_users migration
  const handleRunAppUsersMigration = async () => {
    try {
      setMigrationLoading(true);
      setError(null);
      setAppUsersMigrationInstructions('');
      
      const result = await applyAppUsersMigration();
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      setAppUsersMigrationInstructions(result.instructions);
      toast.success('Migration SQL generated successfully');
    } catch (err) {
      console.error('Error running app_users migration:', err);
      setError(err.message);
      toast.error(`Error: ${err.message}`);
    } finally {
      setMigrationLoading(false);
    }
  };

  // Create admin user
  const handleCreateAdmin = async () => {
    try {
      if (!adminUser.email || !adminUser.name) {
        toast.error('Please enter email and name for the admin user');
        return;
      }
      
      setAdminUser(prev => ({ ...prev, loading: true, error: null }));
      
      // Create the admin user in app_users table
      const userData = {
        name: adminUser.name,
        contactDetails: {
          email: adminUser.email
        }
      };
      
      const result = await createAppUser(userData, 'staff');
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      // Update the created user to have admin role
      const { error: updateError } = await supabase
        .from('app_users')
        .update({ role: 'admin' })
        .eq('id', result.data.id);
      
      if (updateError) {
        throw new Error(`Error updating user role: ${updateError.message}`);
      }
      
      toast.success(`Admin user created successfully: ${adminUser.email}`);
      setAdminUser(prev => ({ 
        ...prev, 
        email: '', 
        name: '', 
        loading: false 
      }));
    } catch (error) {
      console.error('Error creating admin user:', error);
      setAdminUser(prev => ({
        ...prev, 
        loading: false,
        error: error.message
      }));
      toast.error(`Error creating admin user: ${error.message}`);
    }
  };

  // Link current user as admin
  const handleLinkCurrentUserAsAdmin = async () => {
    try {
      if (!user || !user.id) {
        toast.error('You must be logged in to use this feature');
        return;
      }
      
      setLoading(true);
      setError(null);
      
      // First, create an admin user record if it doesn't exist
      const userData = {
        name: user.user_metadata?.name || user.email.split('@')[0],
        contactDetails: {
          email: user.email
        }
      };
      
      const result = await createAppUser(userData, 'staff');
      
      if (!result.success && !result.error.includes('duplicate key')) {
        throw new Error(result.error);
      }
      
      // Get the user ID - either from the creation result or by looking up the email
      let appUserId;
      if (result.success) {
        appUserId = result.data.id;
        
        // Update the role to admin
        const { error: updateError } = await supabase
          .from('app_users')
          .update({ role: 'admin' })
          .eq('id', appUserId);
        
        if (updateError) {
          throw new Error(`Error updating user role: ${updateError.message}`);
        }
      } else {
        // Look up the existing user
        const { data: existingUser, error: lookupError } = await supabase
          .from('app_users')
          .select('id')
          .eq('email', user.email)
          .single();
        
        if (lookupError) {
          throw new Error(`Error finding existing user: ${lookupError.message}`);
        }
        
        appUserId = existingUser.id;
        
        // Update the role to admin
        const { error: updateError } = await supabase
          .from('app_users')
          .update({ role: 'admin' })
          .eq('id', appUserId);
        
        if (updateError) {
          throw new Error(`Error updating user role: ${updateError.message}`);
        }
      }
      
      // Link the auth user to the app user
      const linkResult = await linkAppUser(user.id, appUserId);
      
      if (!linkResult.success) {
        throw new Error(`Error linking user: ${linkResult.error}`);
      }
      
      toast.success('Your account has been linked as an admin user!');
      
      // Reload the page after a short delay to refresh the auth state
      setTimeout(() => {
        window.location.reload();
      }, 2000);
      
    } catch (error) {
      console.error('Error linking current user as admin:', error);
      setError(error.message);
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Check if app_users table exists
  const handleCheckAppUsersTable = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Try to query the app_users table
      const { data, error } = await supabase
        .from('app_users')
        .select('count(*)')
        .limit(1);
      
      if (error) {
        console.error('Error checking app_users table:', error);
        throw new Error(`The app_users table might not exist: ${error.message}`);
      }
      
      // Check if we can query the rentees and team_members tables for comparison
      let message = `✅ app_users table exists and is accessible.`;
      
      try {
        const { data: renteesData, error: renteesError } = await supabase
          .from('rentees')
          .select('count(*)')
          .limit(1);
        
        if (!renteesError) {
          message += ` Found ${renteesData[0].count} rentees in the rentees table.`;
        }
      } catch (error) {
        console.log('Rentees table might not exist:', error.message);
      }
      
      try {
        const { data: teamData, error: teamError } = await supabase
          .from('team_members')
          .select('count(*)')
          .limit(1);
        
        if (!teamError) {
          message += ` Found ${teamData[0].count} members in the team_members table.`;
        }
      } catch (error) {
        console.log('Team members table might not exist:', error.message);
      }
      
      toast.success(message);
      
      // Run the migration to get the SQL
      const migrationResult = await applyAppUsersMigration();
      if (migrationResult.success) {
        setAppUsersMigrationInstructions(`
          <h3>Create Table SQL:</h3>
          <pre>${migrationResult.createTableSQL}</pre>
          
          <h3>Migrate Data SQL:</h3>
          <pre>${migrationResult.migrateDataSQL}</pre>
        `);
      }
    } catch (error) {
      console.error('Error:', error);
      setError(error.message);
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Create test rentee
  const handleCreateTestRentee = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Create a test rentee directly in the app_users table
      const result = await createTestRentee();
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      toast.success(`Test rentee created successfully with ID: ${result.data[0].id}`);
    } catch (error) {
      console.error('Error creating test rentee:', error);
      setError(error.message);
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Generate SQL for app_users table
  const handleGenerateAppUsersSQL = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await runCreateAppUsersTableSQL();
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      setSqlInstructions(result.sql);
      toast.success('SQL generated successfully. Please run it in the Supabase SQL Editor.');
    } catch (error) {
      console.error('Error generating SQL:', error);
      setError(error.message);
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Add the convertToDocx function from AgreementForm
  const convertToDocx = async (htmlContent) => {
    try {
      console.log('Starting document conversion...');
      console.log('Input content length:', htmlContent.length);

      // Strip HTML tags and decode HTML entities
      const textContent = htmlContent
        .replace(/<[^>]*>/g, '\n') // Replace HTML tags with newlines
        .replace(/&nbsp;/g, ' ')   // Replace &nbsp; with spaces
        .replace(/&amp;/g, '&')    // Replace &amp; with &
        .replace(/&lt;/g, '<')     // Replace &lt; with <
        .replace(/&gt;/g, '>')     // Replace &gt; with >
        .replace(/\n\s*\n/g, '\n\n') // Replace multiple newlines with double newlines
        .trim();

      console.log('Processed text content length:', textContent.length);

      // Create a new document with proper styling
      const doc = new Document({
        sections: [{
          properties: {},
          children: textContent.split('\n').map(paragraph => 
            new Paragraph({
              children: [
                new TextRun({
                  text: paragraph.trim(),
                  size: 24, // 12pt font
                }),
              ],
              spacing: {
                after: 200, // Add some spacing after each paragraph
              },
            })
          ),
        }],
      });

      console.log('Document object created, generating blob...');

      // Generate blob
      const buffer = await Packer.toBlob(doc);
      console.log('Blob generated, size:', buffer.size);

      return buffer;
    } catch (error) {
      console.error('Error converting to DOCX:', error);
      throw error;
    }
  };

  // Test storage uploads
  const handleStorageTest = async () => {
    try {
      setStorageTest(prev => ({ ...prev, loading: true, error: null, result: null }));
      
      const result = await testFileUpload();
      
      if (!result.success) {
        throw new Error(result.message || 'Storage test failed');
      }
      
      setStorageTest(prev => ({ ...prev, loading: false, result }));
      toast.success('Storage test completed successfully');
    } catch (error) {
      console.error('Storage test error:', error);
      setStorageTest(prev => ({ 
        ...prev, 
        loading: false, 
        error: error.message 
      }));
      toast.error(`Storage test failed: ${error.message}`);
    }
  };

  const deleteBucket = async (bucketName) => {
    try {
      setStorageStatus(prev => ({ ...prev, loading: true, error: null, success: null }));
      
      // First delete all files in the bucket
      const { data: files, error: listError } = await supabase.storage
        .from(bucketName)
        .list();
      
      if (listError) {
        console.error(`Error listing files in bucket ${bucketName}:`, listError);
      } else if (files && files.length > 0) {
        // Delete each file
        for (const file of files) {
          const { error: deleteError } = await supabase.storage
            .from(bucketName)
            .remove([file.name]);
          
          if (deleteError) {
            console.error(`Error deleting file ${file.name}:`, deleteError);
          }
        }
      }

      // Then delete the bucket
      const { error: deleteError } = await supabase.storage.deleteBucket(bucketName);
      
      if (deleteError) {
        throw deleteError;
      }

      setStorageStatus(prev => ({
        ...prev,
        loading: false,
        success: `Bucket ${bucketName} deleted successfully`
      }));

      // Refresh bucket list
      await listBuckets();
    } catch (error) {
      console.error(`Error deleting bucket ${bucketName}:`, error);
      setStorageStatus(prev => ({
        ...prev,
        loading: false,
        error: `Failed to delete bucket: ${error.message}`
      }));
    }
  };

  const createBucket = async (bucketName, config) => {
    try {
      setStorageStatus(prev => ({ ...prev, loading: true, error: null, success: null }));
      
      // Create the bucket
      const { error: createError } = await supabase.storage.createBucket(bucketName, config);
      
      if (createError) {
        throw createError;
      }

      // Create folder structure
      const folders = bucketName === 'images' 
        ? ['properties', 'maintenance', 'utility-readings']
        : ['agreements', 'id-copies', 'documents', 'payment-proofs'];

      for (const folder of folders) {
        const { error: folderError } = await supabase.storage
          .from(bucketName)
          .upload(`${folder}/.keep`, new Blob([''], { type: 'text/plain' }), {
            cacheControl: '3600',
            upsert: true
          });

        if (folderError) {
          console.error(`Error creating folder ${folder}:`, folderError);
        }
      }

      // Set up storage policies
      const policies = [
        {
          name: `Allow public read access to ${bucketName}`,
          definition: `(bucket_id = '${bucketName}')`,
          operation: 'SELECT'
        },
        {
          name: `Allow authenticated users to upload ${bucketName}`,
          definition: `(bucket_id = '${bucketName}' AND auth.role() = 'authenticated')`,
          operation: 'INSERT'
        },
        {
          name: `Allow authenticated users to update their own ${bucketName}`,
          definition: `(bucket_id = '${bucketName}' AND auth.role() = 'authenticated')`,
          operation: 'UPDATE'
        },
        {
          name: `Allow authenticated users to delete their own ${bucketName}`,
          definition: `(bucket_id = '${bucketName}' AND auth.role() = 'authenticated')`,
          operation: 'DELETE'
        }
      ];

      for (const policy of policies) {
        const { error: policyError } = await supabase.rpc('create_policy', {
          table_name: 'storage.objects',
          policy_name: policy.name,
          definition: policy.definition,
          operation: policy.operation
        });

        if (policyError && !policyError.message?.includes('already exists')) {
          console.error(`Error creating policy ${policy.name}:`, policyError);
        }
      }

      setStorageStatus(prev => ({
        ...prev,
        loading: false,
        success: `Bucket ${bucketName} created successfully`
      }));

      // Refresh bucket list
      await listBuckets();
    } catch (error) {
      console.error(`Error creating bucket ${bucketName}:`, error);
      setStorageStatus(prev => ({
        ...prev,
        loading: false,
        error: `Failed to create bucket: ${error.message}`
      }));
    }
  };

  const listBuckets = async () => {
    try {
      setStorageStatus(prev => ({ ...prev, loading: true, error: null }));
      
      const { data: buckets, error } = await supabase.storage.listBuckets();
      
      if (error) {
        throw error;
      }

      setStorageStatus(prev => ({
        ...prev,
        loading: false,
        buckets: buckets || []
      }));
    } catch (error) {
      console.error('Error listing buckets:', error);
      setStorageStatus(prev => ({
        ...prev,
        loading: false,
        error: `Failed to list buckets: ${error.message}`
      }));
    }
  };

  const resetStorage = async () => {
    try {
      setStorageStatus(prev => ({ ...prev, loading: true, error: null, success: null }));
      
      // Delete existing buckets
      const { data: buckets, error: listError } = await supabase.storage.listBuckets();
      
      if (listError) {
        throw listError;
      }

      for (const bucket of buckets) {
        await deleteBucket(bucket.name);
      }

      // Create new buckets with proper configuration
      await createBucket('images', {
        public: true,
        fileSizeLimit: 52428800,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      });

      await createBucket('files', {
        public: true,
        fileSizeLimit: 52428800,
        allowedMimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
      });

      setStorageStatus(prev => ({
        ...prev,
        loading: false,
        success: 'Storage reset completed successfully'
      }));

      // Refresh bucket list
      await listBuckets();
    } catch (error) {
      console.error('Error resetting storage:', error);
      setStorageStatus(prev => ({
        ...prev,
        loading: false,
        error: `Failed to reset storage: ${error.message}`
      }));
    }
  };

  // Create storage buckets
  const handleCreateBuckets = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await createRequiredBuckets();
      
      if (!result.success) {
        throw new Error(result.error || result.message);
      }
      
      toast.success(result.message);
    } catch (error) {
      console.error('Error creating buckets:', error);
      setError(error.message);
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Add this to your useEffect
  useEffect(() => {
    listBuckets();
  }, []);

  // Test invoice service
  const testInvoiceService = async () => {
    try {
      setStatus(prev => ({
        ...prev,
        invoiceServiceTest: { success: false, message: 'Testing...' }
      }));
      
      // Dynamic import to test if the module can be loaded
      const invoiceServiceModule = await import('../services/invoiceService');
      
      // If we got here, the import worked
      setStatus(prev => ({
        ...prev,
        invoiceServiceTest: { 
          success: true, 
          message: 'Successfully loaded invoiceService module' 
        }
      }));
    } catch (error) {
      console.error('Error testing invoice service:', error);
      setStatus(prev => ({
        ...prev,
        invoiceServiceTest: { 
          success: false, 
          message: `Failed to load invoiceService: ${error.message}` 
        }
      }));
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-8">Admin Tools</h1>
      
      <EnvVarStatus />
      
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold mb-4">Admin Tools</h1>
          <p className="text-gray-600 mb-6">
            Tools for system administration and maintenance tasks.
          </p>
          
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8">
              <button
                className="py-4 px-1 border-b-2 border-blue-500 font-medium text-sm text-blue-600"
                onClick={() => {}}
              >
                Database Tools
              </button>
              <button
                className="py-4 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700 hover:border-gray-300"
                onClick={() => handleTabClick('/admin-dashboard/file-upload-test')}
              >
                File Upload Test
              </button>
              <button
                className="py-4 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700 hover:border-gray-300"
                onClick={() => handleTabClick('/admin-dashboard/storage-explorer')}
              >
                Storage Explorer
              </button>
            </nav>
          </div>
          
          {user?.role === 'authenticated' && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">
                    Your account is not linked to a team member or rentee profile. Please contact an administrator to link your account.
                  </p>
                  <div className="mt-2">
                    <button
                      onClick={handleLinkCurrentUserAsAdmin}
                      disabled={loading}
                      className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      {loading ? 'Linking...' : 'Link Myself as Admin'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-medium mb-4">Create Admin User</h2>
            <p className="mb-4 text-gray-600">
              Create an admin user in the app_users table. This is useful for setting up the initial admin account.
            </p>
            
            {adminUser.error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                <strong className="font-bold">Error!</strong>
                <span className="block sm:inline ml-2">{adminUser.error}</span>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="adminEmail" className="block text-sm font-medium text-gray-700 mb-1">
                  Admin Email
                </label>
                <input
                  type="email"
                  id="adminEmail"
                  value={adminUser.email}
                  onChange={(e) => setAdminUser(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter admin email"
                />
              </div>
              <div>
                <label htmlFor="adminName" className="block text-sm font-medium text-gray-700 mb-1">
                  Admin Name
                </label>
                <input
                  type="text"
                  id="adminName"
                  value={adminUser.name}
                  onChange={(e) => setAdminUser(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter admin name"
                />
              </div>
            </div>
            
            <button
              onClick={handleCreateAdmin}
              disabled={adminUser.loading || !adminUser.email || !adminUser.name}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-purple-300"
            >
              {adminUser.loading ? 'Creating Admin...' : 'Create Admin User'}
            </button>
            
            <div className="mt-4 text-sm text-gray-500">
              <p>Note: After creating the admin user, you'll need to invite them using the Test User Invitation section below.</p>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-medium mb-4">Auth Debug Information</h2>
            <div className="bg-gray-100 p-4 rounded-md overflow-x-auto text-sm">
              <p><strong>User ID:</strong> {user?.id || 'Not found'}</p>
              <p><strong>User Email:</strong> {user?.email || 'Not found'}</p>
              <p><strong>User Role:</strong> {user?.role || 'Not found'}</p>
              <p><strong>Auth Status:</strong> {user ? 'Authenticated' : 'Not Authenticated'}</p>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-medium mb-4">Database Migration</h2>
            <p className="mb-4 text-gray-600">
              Tools for migrating the database to the new structure.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <button
                onClick={handleRunMigration}
                disabled={migrationLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
              >
                {migrationLoading ? 'Running...' : 'Run Auth Fields Migration'}
              </button>
              
              <button
                onClick={handleRunAppUsersMigration}
                disabled={migrationLoading}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-purple-300"
              >
                {migrationLoading ? 'Running...' : 'Run App Users Migration'}
              </button>
              
              <button
                onClick={handleCheckAppUsersTable}
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-green-300"
              >
                {loading ? 'Checking...' : 'Check App Users Table'}
              </button>
              
              <button
                onClick={handleCreateTestRentee}
                disabled={loading}
                className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:bg-yellow-300"
              >
                {loading ? 'Creating...' : 'Create Test Rentee'}
              </button>
              
              <button
                onClick={handleGenerateAppUsersSQL}
                disabled={loading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-300 md:col-span-2"
              >
                {loading ? 'Generating...' : 'Generate App Users Table SQL'}
              </button>
            </div>
            
            {sqlInstructions && (
              <div className="mt-4">
                <h3 className="text-lg font-medium mb-2">SQL Instructions:</h3>
                <div className="bg-gray-100 p-4 rounded-md overflow-auto max-h-96">
                  <pre className="text-sm whitespace-pre-wrap">{sqlInstructions}</pre>
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  Copy this SQL and run it in the Supabase SQL Editor to create the app_users table.
                </p>
              </div>
            )}
            
            {appUsersMigrationInstructions && (
              <div className="mt-4">
                <h4 className="font-medium mb-2">SQL Migration Instructions:</h4>
                <div className="bg-gray-100 p-4 rounded overflow-auto max-h-60">
                  <pre className="text-sm whitespace-pre-wrap">{appUsersMigrationInstructions}</pre>
                </div>
              </div>
            )}
          </div>
          
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-medium mb-4">Test User Invitation</h2>
            <p className="mb-4 text-gray-600">
              Test sending invitations to users. Note: This uses the Supabase built-in email service which has a limit of 2 emails per hour.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="testEmail" className="block text-sm font-medium text-gray-700 mb-1">
                  Test Email Address
                </label>
                <input
                  type="email"
                  id="testEmail"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter email to test"
                />
              </div>
              <div>
                <label htmlFor="testInviteType" className="block text-sm font-medium text-gray-700 mb-1">
                  Invitation Type
                </label>
                <select
                  id="testInviteType"
                  value={testInviteType}
                  onChange={(e) => setTestInviteType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="rentee">Rentee</option>
                  <option value="team_member">Team Member</option>
                </select>
              </div>
            </div>
            
            <button
              onClick={handleTestInvite}
              disabled={inviteLoading || !testEmail}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-green-300"
            >
              {inviteLoading ? 'Sending Invitation...' : 'Send Test Invitation'}
            </button>
          </div>
          
          <AuthUserLinking />
          
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-medium mb-4">Agreement Templates</h2>
            <p className="mb-4 text-gray-600">
              Create and manage agreement templates for rental contracts and other documents.
            </p>
            
            <div className="flex space-x-4">
              <Link
                to="/dashboard/agreements/templates"
                className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors inline-flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                  <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                </svg>
                Manage Agreement Templates
              </Link>
              
              <Link
                to="/dashboard/agreements/templates/new"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors inline-flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Create New Template
              </Link>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-medium mb-4">Image Cleanup Tools</h2>
            <p className="mb-4 text-gray-600">
              These tools help you clean up unused images from the server. They compare the files stored on disk
              with the references in the database and remove any files that are no longer referenced.
            </p>
            
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                <strong className="font-bold">Error!</strong>
                <span className="block sm:inline ml-2">{error}</span>
              </div>
            )}
            
            {results && (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-4" role="alert">
                <strong className="font-bold">{results.name} completed!</strong>
                <p className="mt-2">
                  {results.deleted} files deleted
                  {results.errors > 0 && `, ${results.errors} errors encountered`}
                </p>
                {results.properties && (
                  <div className="mt-2">
                    <p><strong>Details:</strong></p>
                    <ul className="list-disc ml-6">
                      <li>Properties: {results.properties.deleted} deleted, {results.properties.errors} errors</li>
                      <li>ID Copies: {results.idCopies.deleted} deleted, {results.idCopies.errors} errors</li>
                      <li>Payment Proofs: {results.paymentProofs.deleted} deleted, {results.paymentProofs.errors} errors</li>
                      <li>Utility Readings: {results.utilityReadings.deleted} deleted, {results.utilityReadings.errors} errors</li>
                    </ul>
                  </div>
                )}
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => handleCleanup(cleanupPropertyImages, 'Property Images Cleanup')}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
              >
                {loading ? 'Running...' : 'Clean Property Images'}
              </button>
              
              <button
                onClick={() => handleCleanup(cleanupIdCopyImages, 'ID Copy Images Cleanup')}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
              >
                {loading ? 'Running...' : 'Clean ID Copy Images'}
              </button>
              
              <button
                onClick={() => handleCleanup(cleanupPaymentProofImages, 'Payment Proof Images Cleanup')}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
              >
                {loading ? 'Running...' : 'Clean Payment Proof Images'}
              </button>
              
              <button
                onClick={() => handleCleanup(cleanupUtilityReadingImages, 'Utility Reading Images Cleanup')}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
              >
                {loading ? 'Running...' : 'Clean Utility Reading Images'}
              </button>
              
              <button
                onClick={() => handleCleanup(cleanupAllImages, 'All Images Cleanup')}
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-green-300 md:col-span-2"
              >
                {loading ? 'Running...' : 'Clean All Images'}
              </button>
            </div>
            
            <div className="mt-4 text-sm text-gray-500">
              <p>Note: This process may take some time depending on the number of files to check.</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Storage Management</h2>
            <div className="space-y-4">
              <button
                onClick={handleCreateBuckets}
                disabled={loading}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Storage Buckets'}
              </button>
              
              <button
                onClick={() => handleStorageTest()}
                disabled={loading}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50 ml-4"
              >
                {loading ? 'Testing...' : 'Test Storage'}
              </button>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Evia Sign Testing</h2>
            <EviaSignTesting />
          </div>

          <div className="bg-white shadow-md rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">Evia Sign Webhooks</h2>
            <WebhookProvider>
              <WebhookEvents />
            </WebhookProvider>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4">Database Tools</h2>
            <div className="grid grid-cols-1 gap-6">
              <SqlMigration />
              {/* Other database tools */}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">System Diagnostics</h2>
            
            <div className="grid grid-cols-1 gap-4 mb-4">
              <div className="border p-4 rounded">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-medium">Invoice Service Test</h3>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    status.invoiceServiceTest.success 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {status.invoiceServiceTest.success ? 'OK' : 'Error'}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-2">{status.invoiceServiceTest.message}</p>
                <button
                  onClick={testInvoiceService}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                >
                  Test Module Import
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">Email Diagnostics</h2>
            <p className="mb-4">Test and troubleshoot email configurations and invitation process.</p>
            <div className="flex space-x-4">
              <Link 
                to="/admin-dashboard/email-diagnostics"
                className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md"
              >
                Open Email Diagnostics
              </Link>
              <Link
                to="/dashboard/direct-email-test"
                className="bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-md"
              >
                Alternative Email Test
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminTools; 