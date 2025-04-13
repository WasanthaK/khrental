import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { fetchData, insertData, deleteData } from '../services/databaseService';
import { STORAGE_BUCKETS, BUCKET_FOLDERS, listFiles } from '../services/fileService';
import { toast } from 'react-hot-toast';

const AdminDashboard = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // User Management States
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('rentee');
  
  // Storage States
  const [selectedBucket, setSelectedBucket] = useState(STORAGE_BUCKETS.IMAGES);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [files, setFiles] = useState([]);
  const [bucketPermissions, setBucketPermissions] = useState(null);

  useEffect(() => {
    if (user) {
      loadUsers();
      loadTemplates();
    }
  }, [user]);

  useEffect(() => {
    if (selectedBucket) {
      // First try to check if the bucket exists using the direct method
      const checkBucket = async () => {
        try {
          const { data, error } = await supabase.storage
            .from(selectedBucket)
            .list('', { limit: 1 });
          
          if (error) {
            console.error(`Error checking if bucket ${selectedBucket} exists:`, error);
            
            // If we can't find the bucket, try the alternative bucket
            if (error.status === 404 || error.message?.includes('not found')) {
              // If IMAGES fails, try FILES and vice versa
              const alternateBucket = selectedBucket === STORAGE_BUCKETS.IMAGES 
                ? STORAGE_BUCKETS.FILES 
                : STORAGE_BUCKETS.IMAGES;
              
              console.log(`Trying alternate bucket: ${alternateBucket}`);
              setSelectedBucket(alternateBucket);
              return;
            }
          }
          
          // Continue with loading files and permissions
          loadFiles(selectedBucket, selectedFolder);
          loadBucketPermissions(selectedBucket);
        } catch (err) {
          console.error('Error in bucket check:', err);
          // Fall back to just trying the regular functions
          loadFiles(selectedBucket, selectedFolder);
          loadBucketPermissions(selectedBucket);
        }
      };
      
      checkBucket();
    }
  }, [selectedBucket, selectedFolder]);

  // User Management Functions
  const loadUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await fetchData('app_users');
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      setError(err.message);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const inviteUser = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      
      // First create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(newUserEmail);
      if (authError) throw authError;

      // Then create app user profile
      await insertData('app_users', {
        auth_id: authData.user.id,
        email: newUserEmail,
        role: newUserRole,
        name: newUserEmail.split('@')[0]
      });

      setNewUserEmail('');
      setNewUserRole('rentee');
      loadUsers();
      toast.success('User invited successfully');
    } catch (err) {
      setError(err.message);
      toast.error('Failed to invite user');
    } finally {
      setLoading(false);
    }
  };

  // Storage Management Functions
  const loadFiles = async (bucketName, folderPath = '') => {
    try {
      setLoading(true);
      const { data, error } = await listFiles(bucketName, folderPath);
      
      if (error) {
        console.error('Error loading files:', error);
        
        // Handle common error cases
        if (error.message?.includes('does not have permission') || 
            error.status === 403 || error.code === 'PGRST301') {
          // Permission issue
          setError('You do not have permissions to list files in this bucket');
          setFiles([]);
          return;
        }
        
        if (error.message?.includes('not found') || error.status === 404) {
          // Bucket not found
          setError(`Bucket ${bucketName} does not exist`);
          setFiles([]);
          return;
        }
        
        throw error;
      }
      
      setFiles(data?.filter(file => !file.name.endsWith('.keep')) || []);
    } catch (err) {
      console.error('Error loading files:', err);
      setError(err.message);
      setFiles([]);
      toast.error('Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  const loadBucketPermissions = async (bucketName) => {
    try {
      setLoading(true);
      
      // First check if the bucket exists
      const { data: buckets, error: listError } = await supabase.storage.listBuckets();
      
      if (listError) {
        console.error('Error listing buckets:', listError);
        
        // Special handling for permission errors
        if (listError.message?.includes('does not have permission') || 
            listError.code === 'PGRST301' || listError.status === 403) {
          setBucketPermissions({
            name: bucketName,
            public: false,
            fileSizeLimit: 10 * 1024 * 1024, // Default 10MB
            allowedMimeTypes: ['*/*'],
            owner: 'Unknown (limited permissions)',
            created_at: null,
            updated_at: null
          });
          
          // We'll still try to list files to see if we can access the bucket directly
          return;
        }
        
        throw listError;
      }
      
      // If buckets is null or empty, try to access the bucket directly
      if (!buckets || buckets.length === 0) {
        console.warn('No buckets returned from API, attempting direct bucket access');
        
        // Try to list files in the bucket to see if it exists
        const { data: filesCheck, error: filesError } = await supabase.storage
          .from(bucketName)
          .list('', { limit: 1 });
        
        if (!filesError) {
          // Bucket might exist but we don't have permission to list buckets
          setBucketPermissions({
            name: bucketName,
            public: false, // Default assumption
            fileSizeLimit: 10 * 1024 * 1024, // Default 10MB
            allowedMimeTypes: ['*/*'],
            owner: 'Unknown (limited permissions)',
            created_at: null,
            updated_at: null
          });
          return;
        } else {
          throw new Error(`Bucket ${bucketName} may not exist or you don't have access to it`);
        }
      }
      
      const bucket = buckets.find(b => b.name === bucketName);
      if (!bucket) {
        // Check if we can still access the bucket directly
        const { data: filesCheck, error: filesError } = await supabase.storage
          .from(bucketName)
          .list('', { limit: 1 });
        
        if (!filesError) {
          // Bucket exists but might have a different name in the API
          setBucketPermissions({
            name: bucketName,
            public: false, // Default assumption
            fileSizeLimit: 10 * 1024 * 1024, // Default 10MB
            allowedMimeTypes: ['*/*'],
            owner: 'Unknown (limited permissions)',
            created_at: null,
            updated_at: null
          });
          return;
        }
        
        throw new Error(`Bucket ${bucketName} not found`);
      }

      setBucketPermissions({
        name: bucket.name,
        public: bucket.public,
        fileSizeLimit: bucket.file_size_limit,
        allowedMimeTypes: bucket.allowed_mime_types || ['*/*'],
        owner: bucket.owner,
        created_at: bucket.created_at,
        updated_at: bucket.updated_at
      });
    } catch (err) {
      console.error('Error loading bucket permissions:', err);
      setBucketPermissions(null);
      toast.error('Failed to load bucket permissions');
    } finally {
      setLoading(false);
    }
  };

  // Agreement Template Functions
  const loadTemplates = async () => {
    try {
      setLoading(true);
      const { data, error } = await fetchData('agreement_templates');
      if (error) throw error;
      setTemplates(data || []);
    } catch (err) {
      setError(err.message);
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to format bytes
  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Render user card for mobile view
  const renderUserCard = (user) => (
    <div key={user.id} className="bg-white rounded-lg shadow p-4 mb-3">
      <div className="mb-2">
        <h3 className="font-medium text-gray-900">{user.name}</h3>
        <p className="text-sm text-gray-600">{user.email}</p>
      </div>
      <div>
        <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
          {user.role}
        </span>
      </div>
    </div>
  );

  // Render template card for mobile view
  const renderTemplateCard = (template) => (
    <div key={template.id} className="bg-white rounded-lg shadow p-4 mb-3">
      <div className="mb-2">
        <h3 className="font-medium text-gray-900">{template.name}</h3>
        <p className="text-sm text-gray-600">
          {template.language} • v{template.version}
        </p>
      </div>
      <div className="flex space-x-4 mt-3">
        <a
          href={`/dashboard/agreements/templates/${template.id}`}
          className="text-blue-600 hover:text-blue-900 text-sm"
        >
          View
        </a>
        <a
          href={`/dashboard/agreements/templates/${template.id}/edit`}
          className="text-green-600 hover:text-green-900 text-sm"
        >
          Edit
        </a>
      </div>
    </div>
  );

  return (
    <div className="p-3 sm:p-6">
      <h1 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Admin Dashboard</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 sm:px-4 sm:py-3 rounded mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="mb-4 sm:mb-6">
        <div className="border-b border-gray-200 overflow-x-auto">
          <nav className="-mb-px flex space-x-4 sm:space-x-8">
            {['users', 'storage', 'templates'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`
                  py-2 px-1 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap
                  ${activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div>
          <div className="mb-4 sm:mb-6">
            <h2 className="text-lg font-semibold mb-3">Invite New User</h2>
            <form onSubmit={inviteUser} className="space-y-3">
              <div>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="Email address"
                  className="w-full px-3 py-2 border rounded text-sm"
                  required
                />
              </div>
              <div>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value)}
                  className="w-full px-3 py-2 border rounded text-sm"
                >
                  <option value="rentee">Rentee</option>
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-500 text-white px-3 py-1.5 rounded hover:bg-blue-600 text-sm"
              >
                {loading ? 'Inviting...' : 'Invite User'}
              </button>
            </form>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3">User List</h2>
            
            {/* Mobile view */}
            <div className="block sm:hidden">
              {users.length > 0 ? (
                users.map(user => renderUserCard(user))
              ) : (
                <p className="text-gray-500 text-center py-4">No users found</p>
              )}
            </div>
            
            {/* Desktop view */}
            <div className="hidden sm:block bg-white shadow overflow-hidden rounded-lg">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map(user => (
                      <tr key={user.id}>
                        <td className="px-4 py-3 text-sm">{user.name}</td>
                        <td className="px-4 py-3 text-sm">{user.email}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                            {user.role}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Storage Tab */}
      {activeTab === 'storage' && (
        <div>
          <div className="mb-4 flex flex-wrap gap-2">
            {Object.values(STORAGE_BUCKETS).map((bucket) => (
              <button
                key={bucket}
                onClick={() => setSelectedBucket(bucket)}
                className={`px-3 py-1.5 rounded text-sm ${
                  selectedBucket === bucket
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 hover:bg-gray-300'
                }`}
              >
                {bucket}
              </button>
            ))}
          </div>

          {bucketPermissions && (
            <div className="mb-4 p-3 sm:p-4 bg-gray-50 rounded text-sm">
              <h3 className="font-semibold mb-2">Bucket Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-600">Access</p>
                  <p className="font-medium">{bucketPermissions.public ? 'Public' : 'Private'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">File Size Limit</p>
                  <p className="font-medium">{formatBytes(bucketPermissions.fileSizeLimit)}</p>
                </div>
                {bucketPermissions.allowedMimeTypes && (
                  <div className="col-span-1 sm:col-span-2">
                    <p className="text-xs text-gray-600">Allowed File Types</p>
                    <p className="font-medium break-words">{bucketPermissions.allowedMimeTypes.join(', ')}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mb-4">
            <h3 className="font-semibold mb-2 text-sm">Folders</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedFolder('')}
                className={`px-2 py-1 rounded text-xs ${
                  selectedFolder === ''
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 hover:bg-gray-300'
                }`}
              >
                Root
              </button>
              
              {/* Use the array-based folder structure */}
              {Array.isArray(BUCKET_FOLDERS[selectedBucket]) && BUCKET_FOLDERS[selectedBucket].map((folder) => (
                <button
                  key={folder}
                  onClick={() => setSelectedFolder(folder)}
                  className={`px-2 py-1 rounded text-xs ${
                    selectedFolder === folder
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 hover:bg-gray-300'
                  }`}
                >
                  {folder}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-4">Loading...</div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {files.length > 0 ? (
                files.map((file) => (
                  <div
                    key={file.name}
                    className="flex items-center justify-between p-3 bg-white rounded shadow"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{file.name}</p>
                      <p className="text-xs text-gray-500">
                        {formatBytes(file.metadata?.size)} • {new Date(file.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => window.open(file.signedUrl, '_blank')}
                      className="ml-2 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-xs whitespace-nowrap"
                    >
                      View
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-center text-gray-500 py-4">No files found</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div>
          <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 sm:mb-6 gap-3">
            <h2 className="text-lg font-semibold">Agreement Templates</h2>
            <a
              href="/dashboard/agreements/templates/new"
              className="bg-blue-500 text-white px-3 py-1.5 rounded hover:bg-blue-600 text-sm text-center"
            >
              Create New Template
            </a>
          </div>

          {/* Mobile view */}
          <div className="block sm:hidden">
            {templates.length > 0 ? (
              templates.map(template => renderTemplateCard(template))
            ) : (
              <p className="text-gray-500 text-center py-4">No templates found</p>
            )}
          </div>

          {/* Desktop view */}
          <div className="hidden sm:block bg-white shadow overflow-hidden rounded-lg">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Language</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Version</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {templates.map(template => (
                    <tr key={template.id}>
                      <td className="px-4 py-3 text-sm">{template.name}</td>
                      <td className="px-4 py-3 text-sm">{template.language}</td>
                      <td className="px-4 py-3 text-sm">{template.version}</td>
                      <td className="px-4 py-3 text-sm space-x-2">
                        <a
                          href={`/dashboard/agreements/templates/${template.id}`}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          View
                        </a>
                        <a
                          href={`/dashboard/agreements/templates/${template.id}/edit`}
                          className="text-green-600 hover:text-green-900"
                        >
                          Edit
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard; 