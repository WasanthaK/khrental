import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { fetchData, insertData, deleteData } from '../services/databaseService';
import { STORAGE_BUCKETS, BUCKET_FOLDERS, listFiles } from '../services/fileService';
import { toast } from 'react-hot-toast';
// import InvitationStatus from '../components/ui/InvitationStatus';

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
  
  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalUsers, setTotalUsers] = useState(0);
  const [filterStatus, setFilterStatus] = useState('all'); // all, active, inactive
  const [searchTerm, setSearchTerm] = useState('');
  
  // Storage States
  const [selectedBucket, setSelectedBucket] = useState(STORAGE_BUCKETS.IMAGES);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [files, setFiles] = useState([]);
  const [bucketPermissions, setBucketPermissions] = useState(null);

  // Load initial data on mount
  useEffect(() => {
    if (user) {
      loadUsers();
      loadTemplates();
    }
    // We deliberately exclude loadUsers and loadTemplates from dependencies
    // to prevent infinite loops - they are only needed on initial mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Separate effect for pagination/filtering changes
  useEffect(() => {
    if (user) {
      loadUsers();
    }
    // We're including loadUsers as a dependency to distinguish from the above effect
    // but wrapping the function in useCallback would be better
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize, filterStatus, searchTerm]);

  // Handle bucket/folder changes
  useEffect(() => {
    if (selectedBucket) {
      const checkAndLoadBucket = async () => {
        try {
          const { error } = await supabase.storage
            .from(selectedBucket)
            .list('', { limit: 1 });
          
          if (error) {
            console.error(`Error checking bucket ${selectedBucket}:`, error);
            
            if (error.status === 404 || error.message?.includes('not found')) {
              const alternateBucket = selectedBucket === STORAGE_BUCKETS.IMAGES 
                ? STORAGE_BUCKETS.FILES 
                : STORAGE_BUCKETS.IMAGES;
              
              console.log(`Trying alternate bucket: ${alternateBucket}`);
              setSelectedBucket(alternateBucket);
              return;
            }
          }
          
          loadFiles(selectedBucket, selectedFolder);
          loadBucketPermissions(selectedBucket);
        } catch (err) {
          console.error('Error checking bucket:', err);
          loadFiles(selectedBucket, selectedFolder);
          loadBucketPermissions(selectedBucket);
        }
      };
      
      checkAndLoadBucket();
    }
    // loadFiles and loadBucketPermissions are deliberately excluded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBucket, selectedFolder]);

  // User Management Functions
  const loadUsers = async () => {
    try {
      setLoading(true);
      
      let query = supabase.from('app_users');
      
      // Create filter conditions
      let filterConditions = [];
      
      // Apply status filter
      if (filterStatus === 'active') {
        filterConditions.push("is_active.eq.true");
      } else if (filterStatus === 'inactive') {
        filterConditions.push("is_active.eq.false");
      }
      
      // Apply search filter
      if (searchTerm) {
        filterConditions.push(`email.ilike.%${searchTerm}%`);
        filterConditions.push(`name.ilike.%${searchTerm}%`);
      }
      
      // Get total count first with a separate query
      let countQuery = query.select('*', { count: 'exact', head: true });
      
      // Only add OR filters if we have any
      if (filterConditions.length > 0) {
        // For search terms, we want OR between email and name
        if (searchTerm) {
          // The last two conditions are for email and name search
          const searchConditions = filterConditions.slice(-2).join(',');
          filterConditions = filterConditions.slice(0, -2);
          
          // Add status filter if it exists
          if (filterConditions.length > 0) {
            countQuery = countQuery.filter(filterConditions[0]);
          }
          
          // Add search as OR
          countQuery = countQuery.or(searchConditions);
        } else {
          // Just apply the status filter directly
          countQuery = countQuery.filter(filterConditions[0]);
        }
      }
      
      // Execute count query
      const { count, error: countError } = await countQuery;
      
      if (countError) {
        console.error('Error getting count:', countError);
        throw countError;
      }
      
      setTotalUsers(count || 0);
      
      // Then get paginated results with a clean query
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      
      // Start with base data query
      let dataQuery = query.select('*');
      
      // Apply the same filters as the count query
      if (filterConditions.length > 0) {
        // For search terms, we want OR between email and name
        if (searchTerm) {
          // The last two conditions are for email and name search
          const searchConditions = `email.ilike.%${searchTerm}%,name.ilike.%${searchTerm}%`;
          
          // Add status filter if it exists
          if (filterStatus === 'active') {
            dataQuery = dataQuery.filter('is_active.eq.true');
          } else if (filterStatus === 'inactive') {
            dataQuery = dataQuery.filter('is_active.eq.false');
          }
          
          // Add search as OR
          if (searchTerm) {
            dataQuery = dataQuery.or(searchConditions);
          }
        } else {
          // Just apply the status filter directly
          if (filterStatus === 'active') {
            dataQuery = dataQuery.filter('is_active.eq.true');
          } else if (filterStatus === 'inactive') {
            dataQuery = dataQuery.filter('is_active.eq.false');
          }
        }
      }
      
      // Add pagination and ordering
      dataQuery = dataQuery
        .range(from, to)
        .order('createdat', { ascending: false });
      
      // Execute data query
      const { data, error } = await dataQuery;
      
      if (error) {
        console.error('Error fetching users:', error);
        throw error;
      }
      
      console.log('[AdminDashboard] Loaded users:', data);
      setUsers(data || []);
    } catch (err) {
      console.error('Error loading users:', err);
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
      
      if (!newUserEmail) {
        toast.error('Please enter an email address');
        return;
      }
      
      // First check if user already exists
      const { data: existingUsers, error: checkError } = await supabase
        .from('app_users')
        .select('id, email, auth_id')
        .eq('email', newUserEmail)
        .limit(1);
        
      if (checkError) {
        console.error('Error checking existing user:', checkError);
        toast.error(`Error checking if user exists: ${checkError.message}`);
        return;
      }
      
      if (existingUsers && existingUsers.length > 0) {
        toast.error(`A user with email ${newUserEmail} already exists`);
        return;
      }
      
      // Step 1: Create the app_users record FIRST (before auth)
      const newUserId = crypto?.randomUUID?.() || 
        ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
          (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
      const userData = {
        id: newUserId,
        email: newUserEmail,
        role: newUserRole,
        user_type: newUserRole === 'rentee' ? 'rentee' : 'staff',
        name: newUserEmail.split('@')[0],
        invited: true,
        createdat: new Date().toISOString(),
        updatedat: new Date().toISOString()
      };
      
      console.log('Creating app_user record:', userData);
      
      const { data: appUser, error: insertError } = await supabase
        .from('app_users')
        .insert([userData])
        .select()
        .single();
      
      if (insertError) {
        console.error('Error inserting app_user:', insertError);
        toast.error(`Database error: ${insertError.message}`);
        return;
      }
      
      console.log('Created app_user:', appUser);
      
      // Step 2: Send magic link with app_user_id in metadata
      console.log('Sending magic link with app_user_id:', newUserId);
      const { error: magicLinkError } = await supabase.auth.signInWithOtp({
        email: newUserEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?type=invite`,
          data: {
            app_user_id: newUserId,
            role: newUserRole,
            user_type: newUserRole === 'rentee' ? 'rentee' : 'staff'
          }
        }
      });
      
      if (magicLinkError) {
        console.error('Error sending magic link:', magicLinkError);
        toast.error(`Error sending magic link: ${magicLinkError.message}`);
        // Continue anyway as the user record is created and they can be invited again
      }

      setNewUserEmail('');
      setNewUserRole('rentee');
      loadUsers();
      toast.success(`User ${newUserEmail} invited successfully. Magic link email sent.`);
    } catch (err) {
      console.error('Error in inviteUser:', err);
      setError(err.message);
      toast.error(`Failed to create user: ${err.message}`);
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
      if (error) {
        throw error;
      }
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
    <div key={user.id} className={`bg-white rounded-lg shadow p-4 mb-3 ${user.is_active === false ? 'bg-red-50' : ''}`}>
      <div className="mb-2">
        <h3 className="font-medium text-gray-900">{user.name}</h3>
        <p className="text-sm text-gray-600">{user.email}</p>
      </div>
      <div className="flex items-center justify-between">
        <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
          {user.role}
        </span>
        <div className="flex items-center">
          {renderUserStatus(user)}
          <div className="flex ml-2 space-x-2">
            {!user.invited && !user.auth_id && (
              <button 
                onClick={() => sendInvite(user)}
                className="text-xs text-blue-600 hover:text-blue-800"
                disabled={loading}
              >
                Send
              </button>
            )}
            {user.invited && !user.auth_id && (
              <button 
                onClick={() => sendInvite(user)}
                className="text-xs text-blue-600 hover:text-blue-800"
                disabled={loading}
              >
                Resend
              </button>
            )}
            <button
              onClick={() => toggleUserStatus(user.id, user.is_active !== false)}
              className={`text-xs ${
                user.is_active === false
                  ? 'text-green-600 hover:text-green-800'
                  : 'text-red-600 hover:text-red-800'
              }`}
              disabled={loading}
            >
              {user.is_active === false ? 'Activate' : 'Deactivate'}
            </button>
          </div>
        </div>
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

  // Render user status badge
  const renderUserStatus = (user) => {
    // First determine invitation status
    let status = 'not_invited';
    let badgeColor = 'bg-yellow-100 text-yellow-800';
    let statusText = 'Not Invited';
    
    if (user.auth_id) {
      status = 'registered';
      badgeColor = 'bg-green-100 text-green-800';
      statusText = 'Registered';
    } else if (user.invited) {
      status = 'invited';
      badgeColor = 'bg-blue-100 text-blue-800';
      statusText = 'Invited';
    }
    
    // Then check active status
    if (user.is_active === false) {
      badgeColor = 'bg-red-100 text-red-800';
      statusText = `${statusText} (Inactive)`;
    }
    
    return (
      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${badgeColor}`}>
        {statusText}
      </span>
    );
  };

  // Simple method to send an invitation
  const sendInvite = async (user) => {
    try {
      setLoading(true);
      
      if (!user || !user.id || !user.email) {
        toast.error('Invalid user data');
        return;
      }
      
      console.log('Sending invitation to user:', user);
      
      // Update the user record to mark as invited
      const { data, error } = await supabase
        .from('app_users')
        .update({ 
          invited: true,
          updatedat: new Date().toISOString()
        })
        .eq('id', user.id)
        .select()
        .single();
      
      if (error) {
        console.error('Error updating user as invited:', error);
        toast.error(`Failed to update user: ${error.message}`);
        return;
      }
      
      console.log('User marked as invited:', data);
      
      // Send magic link for registration
      const { error: magicLinkError } = await supabase.auth.signInWithOtp({
        email: user.email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?type=invite`,
          data: { 
            app_user_id: user.id,
            role: user.role,
            user_type: user.user_type || (user.role === 'rentee' ? 'rentee' : 'staff')
          }
        }
      });
      
      if (magicLinkError) {
        console.error('Error sending magic link:', magicLinkError);
        toast.error(`Failed to send invitation email: ${magicLinkError.message}`);
        return;
      }
      
      toast.success(`Invitation sent to ${user.email}`);
      loadUsers(); // Refresh the list
    } catch (err) {
      console.error('Error sending invitation:', err);
      toast.error(`Error sending invitation: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Debug function to show invited users
  const debugShowInvited = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .order('createdat', { ascending: false });
        
      if (error) {
        console.error('Error fetching users:', error);
        toast.error('Error fetching users');
        return;
      }
      
      console.log('All users in database:', data);
      console.log('Invited users:', data.filter(user => user.invited === true));
      console.log('Users with auth_id:', data.filter(user => user.auth_id));
      
      // Display to user
      toast.success(`Found ${data.length} users. Check browser console for details.`);
    } catch (err) {
      console.error('Debug error:', err);
      toast.error('Failed to fetch user data');
    } finally {
      setLoading(false);
    }
  };

  // Function to toggle user active status
  const toggleUserStatus = async (userId, currentStatus) => {
    if (!userId) {
      toast.error("Cannot update user: Missing user ID");
      return;
    }
    
    try {
      setLoading(true);
      
      const newStatus = !currentStatus;
      console.log(`Updating user ${userId} active status to ${newStatus}`);
      
      // First step: update the user without selecting the result
      const { error } = await supabase
        .from('app_users')
        .update({ 
          is_active: newStatus,
          updatedat: new Date().toISOString()
        })
        .eq('id', userId);
      
      if (error) {
        console.error('Error updating user status:', error);
        toast.error(`Failed to update user status: ${error.message}`);
        return;
      }
      
      // Update local state first for immediate UI feedback
      setUsers(prevUsers => prevUsers.map(user => 
        user.id === userId ? { ...user, is_active: newStatus } : user
      ));
      
      toast.success(`User ${newStatus ? 'activated' : 'deactivated'} successfully`);
      
      // Optionally refresh the user list
      loadUsers();
    } catch (err) {
      console.error('Error toggling user status:', err);
      toast.error(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Add pagination controls component
  const PaginationControls = () => {
    const totalPages = Math.ceil(totalUsers / pageSize);
    
    return (
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-sm text-gray-700">
            Showing {users.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, totalUsers)} of {totalUsers} users
          </span>
          <div className="ml-4">
            <select 
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1); // Reset to first page when changing page size
              }}
              className="text-sm border rounded px-2 py-1"
            >
              <option value={5}>5 per page</option>
              <option value={10}>10 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
            </select>
          </div>
        </div>
        
        <div className="flex space-x-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className={`px-3 py-1 text-sm rounded ${
              currentPage === 1 
                ? 'bg-gray-100 text-gray-400' 
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            }`}
          >
            Previous
          </button>
          
          {totalPages > 0 && (
            <div className="flex space-x-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                // Show 5 pages at most, centered around current page
                const totalPageButtons = Math.min(5, totalPages);
                const startPage = Math.max(
                  1, 
                  currentPage - Math.floor(totalPageButtons / 2)
                );
                const pageNum = startPage + i;
                
                if (pageNum > totalPages) return null;
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-8 h-8 text-sm rounded ${
                      currentPage === pageNum 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              
              {totalPages > 5 && currentPage < totalPages - 2 && (
                <>
                  <span className="self-center">...</span>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    className="w-8 h-8 text-sm rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    {totalPages}
                  </button>
                </>
              )}
            </div>
          )}
          
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages || totalPages === 0}
            className={`px-3 py-1 text-sm rounded ${
              currentPage === totalPages || totalPages === 0
                ? 'bg-gray-100 text-gray-400' 
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            }`}
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  // Add filter and search UI
  const UserFilters = () => (
    <div className="mb-4 flex flex-col sm:flex-row gap-3">
      <div className="flex-1">
        <input
          type="text"
          value={searchTerm}
          onChange={e => {
            setSearchTerm(e.target.value);
            setCurrentPage(1); // Reset to first page when searching
          }}
          placeholder="Search by name or email"
          className="w-full px-3 py-2 border rounded text-sm"
        />
      </div>
      
      <div className="flex space-x-2">
        <select
          value={filterStatus}
          onChange={e => {
            setFilterStatus(e.target.value);
            setCurrentPage(1); // Reset to first page when filtering
          }}
          className="px-3 py-2 border rounded text-sm"
        >
          <option value="all">All Users</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>
        
        <button
          onClick={() => {
            setSearchTerm('');
            setFilterStatus('all');
            setCurrentPage(1);
          }}
          className="px-3 py-2 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
        >
          Reset
        </button>
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
          <div className="mb-4">
            <button 
              onClick={debugShowInvited}
              className="mb-3 px-3 py-1.5 bg-blue-100 text-blue-700 text-xs rounded"
            >
              Debug: Show All Users in Console
            </button>
          </div>
          
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

          {/* Debug display of invitation status */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg text-xs">
            <h3 className="font-bold mb-2">Debug: User Status</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-300 text-left">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-2 border">Email</th>
                    <th className="p-2 border">Role</th>
                    <th className="p-2 border">Auth ID</th>
                    <th className="p-2 border">Invited</th>
                    <th className="p-2 border">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b">
                      <td className="p-2 border">{user.email}</td>
                      <td className="p-2 border">{user.role}</td>
                      <td className="p-2 border">{user.auth_id ? '✅' : '❌'}</td>
                      <td className="p-2 border">{user.invited ? '✅' : '❌'}</td>
                      <td className="p-2 border">{new Date(user.createdat || user.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3">User List</h2>
            
            <UserFilters />
            
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map(user => (
                      <tr key={user.id} className={user.is_active === false ? 'bg-red-50' : ''}>
                        <td className="px-4 py-3 text-sm">{user.name}</td>
                        <td className="px-4 py-3 text-sm">{user.email}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                            {user.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {renderUserStatus(user)}
                        </td>
                        <td className="px-4 py-3 text-sm flex space-x-2">
                          {!user.invited && !user.auth_id && (
                            <button 
                              onClick={() => sendInvite(user)}
                              className="text-xs text-blue-600 hover:text-blue-800"
                              disabled={loading}
                            >
                              Send
                            </button>
                          )}
                          {user.invited && !user.auth_id && (
                            <button 
                              onClick={() => sendInvite(user)}
                              className="text-xs text-blue-600 hover:text-blue-800"
                              disabled={loading}
                            >
                              Resend
                            </button>
                          )}
                          <button
                            onClick={() => toggleUserStatus(user.id, user.is_active !== false)}
                            className={`text-xs ${
                              user.is_active === false
                                ? 'text-green-600 hover:text-green-800'
                                : 'text-red-600 hover:text-red-800'
                            }`}
                            disabled={loading}
                          >
                            {user.is_active === false ? 'Activate' : 'Deactivate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            <PaginationControls />
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
                className={`
                  py-2 px-3 bg-gray-200 text-gray-700 rounded-md text-sm
                  ${selectedBucket === bucket ? 'bg-gray-300' : 'hover:bg-gray-300'}
                `}
              >
                {bucket}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <h2 className="text-lg font-semibold mb-3">Files</h2>
            <div className="mb-4">
              <input
                type="text"
                value={selectedFolder}
                onChange={(e) => setSelectedFolder(e.target.value)}
                placeholder="Folder path"
                className="w-full px-3 py-2 border rounded text-sm"
              />
            </div>
            <button
              onClick={() => loadFiles(selectedBucket, selectedFolder)}
              className="bg-blue-500 text-white px-3 py-1.5 rounded hover:bg-blue-600 text-sm"
            >
              Load Files
            </button>
          </div>

          <div className="mt-4">
            <h2 className="text-lg font-semibold mb-3">Bucket Permissions</h2>
            {bucketPermissions && (
              <div className="mb-4">
                <p>Name: {bucketPermissions.name}</p>
                <p>Public: {bucketPermissions.public ? 'Yes' : 'No'}</p>
                <p>File Size Limit: {formatBytes(bucketPermissions.fileSizeLimit)}</p>
                <p>Allowed MIME Types: {bucketPermissions.allowedMimeTypes.join(', ')}</p>
                <p>Owner: {bucketPermissions.owner}</p>
                <p>Created At: {bucketPermissions.created_at ? new Date(bucketPermissions.created_at).toLocaleString() : 'N/A'}</p>
                <p>Updated At: {bucketPermissions.updated_at ? new Date(bucketPermissions.updated_at).toLocaleString() : 'N/A'}</p>
              </div>
            )}
          </div>

          <div className="mt-4">
            <h2 className="text-lg font-semibold mb-3">Files</h2>
            <div className="overflow-x-auto">
              {files.length > 0 ? (
                files.map((file) => (
                  <div key={file.id} className="mb-2">
                    <span>{file.name}</span>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-4">No files found</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div>
          <div className="mb-4">
            <button 
              onClick={debugShowInvited}
              className="mb-3 px-3 py-1.5 bg-blue-100 text-blue-700 text-xs rounded"
            >
              Debug: Show All Users in Console
            </button>
          </div>
          
          <div className="mb-4 sm:mb-6">
            <h2 className="text-lg font-semibold mb-3">Templates</h2>
            <div className="overflow-x-auto">
              {templates.length > 0 ? (
                templates.map(renderTemplateCard)
              ) : (
                <p className="text-gray-500 text-center py-4">No templates found</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;