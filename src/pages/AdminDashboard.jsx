import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { fetchData, insertData, deleteData } from '../services/databaseService';
import { STORAGE_BUCKETS, BUCKET_FOLDERS, listFiles } from '../services/fileService';
import { toast } from 'react-hot-toast';
import { inviteUser, resendInvitation, checkInvitationStatus } from '../services/invitationService';
import { Outlet, useLocation } from 'react-router-dom';
// import InvitationStatus from '../components/ui/InvitationStatus';
import EmailDiagnostic from '../components/diagnostics/EmailDiagnostic';

const AdminDashboard = () => {
  const { user } = useAuth();
  const location = useLocation();
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

  // Add state for real email flag
  const [sendRealEmail, setSendRealEmail] = useState(false);
  // Add state for invitation testing
  const [testingMode, setTestingMode] = useState(false);
  const [newUserName, setNewUserName] = useState('');

  // Check if we're at the exact /admin-dashboard route
  const isExactPath = location.pathname === '/dashboard/admin-dashboard' || location.pathname === '/admin-dashboard';
  
  // If we're in a nested route, render the Outlet component
  if (!isExactPath) {
    return <Outlet />;
  }

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
        filterConditions.push("active.eq.true");
      } else if (filterStatus === 'inactive') {
        filterConditions.push("active.eq.false");
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
            dataQuery = dataQuery.filter('active.eq.true');
          } else if (filterStatus === 'inactive') {
            dataQuery = dataQuery.filter('active.eq.false');
          }
          
          // Add search as OR
          if (searchTerm) {
            dataQuery = dataQuery.or(searchConditions);
          }
        } else if (filterStatus === 'active') {
          dataQuery = dataQuery.filter('active.eq.true');
        } else if (filterStatus === 'inactive') {
          dataQuery = dataQuery.filter('active.eq.false');
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

  const handleUserInvite = async (e) => {
    e.preventDefault();
    
    if (!newUserEmail) {
      toast.error('Email is required');
      return;
    }
    
    try {
      setLoading(true);
      
      // First, create the user in the app_users table
      const userData = {
        email: newUserEmail.toLowerCase(),
        name: testingMode && newUserName ? newUserName : newUserEmail.split('@')[0], // Use specified name or default from email
        role: newUserRole,
        user_type: newUserRole === 'rentee' ? 'rentee' : 'staff'
      };
      
      // Insert user into app_users table
      const { data: newUser, error: createError } = await supabase
        .from('app_users')
        .insert(userData)
        .select()
        .single();
      
      if (createError) {
        console.error('Error creating user:', createError);
        toast.error(`Failed to create user: ${createError.message}`);
        return;
      }
      
      // Now invite the user using our new invitation service
      const result = await inviteUser({
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role || newUser.user_type
      }, !sendRealEmail); // Pass simulated=false if sendRealEmail is true
      
      if (!result.success) {
        console.error('Error sending invitation:', result.error);
        toast.error(`User created but invitation failed: ${result.error}`);
        return;
      }
      
      // Show appropriate message based on email status
      if (!result.simulated) {
        toast.success(`User created and real invitation email sent to ${newUserEmail}`);
      } else {
        toast.success(`User created and simulated invitation email sent to ${newUserEmail}`);
      }
      
      // Reset the form
      setNewUserEmail('');
      
      // Refresh the user list
      setTimeout(() => loadUsers(), 1000);
    } catch (err) {
      console.error('Error creating user:', err);
      toast.error(`Error: ${err.message}`);
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
    if (!bytes) {
      return '0 B';
    }
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Render user card for mobile view with improved UX
  const renderUserCard = (user) => (
    <div
      key={user.id}
      className="bg-white shadow-md rounded-xl overflow-hidden mb-4"
    >
      <div className="p-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 truncate">
              {user.name || 'Unnamed User'}
            </h3>
            <p className="text-sm text-gray-600 truncate">{user.email}</p>
            <div className="mt-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {user.role} ({user.user_type})
              </span>
            </div>
          </div>
          
          <div className="flex flex-col space-y-2">
            {renderUserStatus(user)}
          </div>
        </div>
        
        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs text-gray-500">
              Created: {new Date(user.createdat).toLocaleString()}
            </span>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => toggleUserStatus(user.id, user.active)}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg ${
                user.active
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-green-500 text-white hover:bg-green-600'
              }`}
            >
              {user.active ? 'Deactivate' : 'Activate'}
            </button>
            
            {!user.auth_id && (
              <button
                onClick={() => sendInvite(user, sendRealEmail)}
                className="flex-1 px-3 py-2 text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 rounded-lg"
              >
                {user.invited ? 'Re-invite' : 'Invite'}
              </button>
            )}
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
    if (user.active === false) {
      badgeColor = 'bg-red-100 text-red-800';
      statusText = `${statusText} (Inactive)`;
    }
    
    return (
      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${badgeColor}`}>
        {statusText}
      </span>
    );
  };

  // Update the sendInvite function
  const sendInvite = async (user, sendReal = false) => {
    try {
      setLoading(true);
      
      if (!user || !user.id || !user.email) {
        toast.error('Invalid user data');
        return;
      }
      
      console.log(`Sending invitation to user:`, user, `sending real email: ${sendReal}`);
      
      // Use the resendInvitation function from our new service
      // Pass simulated=false when sendReal=true
      const result = await resendInvitation(user.id, !sendReal);
      
      console.log('Invitation result:', result);
      
      if (!result.success) {
        console.error('Error sending invitation:', result.error);
        toast.error(`Failed to send invitation: ${result.error}`);
        return;
      }
      
      // Show appropriate message based on simulation status
      if (!result.simulated) {
        toast.success(`Real invitation email sent to ${user.email}`);
      } else {
        toast.success(`Simulated invitation email sent to ${user.email}`);
      }
      
      // Refresh the user list to show updated status
      setTimeout(() => loadUsers(), 1000);
    } catch (err) {
      console.error('Error sending invitation:', err);
      toast.error(`Error sending invitation: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Check invitation status
  const checkStatus = async (userId) => {
    try {
      const result = await checkInvitationStatus(userId);
      
      if (!result.success) {
        toast.error(`Status check failed: ${result.error}`);
        return;
      }
      
      toast.success(`Status: ${result.status}`);
      return result;
    } catch (error) {
      console.error('Error checking invitation status:', error);
      toast.error(`Error: ${error.message}`);
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
          active: newStatus,
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
        user.id === userId ? { ...user, active: newStatus } : user
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

  // Improved pagination control for mobile
  const PaginationControls = () => {
    // Calculate page range
    const totalPages = Math.ceil(totalUsers / pageSize);
    const pageRange = [];
    
    // Calculate which pages to show
    let startPage = Math.max(1, currentPage - 1);
    let endPage = Math.min(totalPages, currentPage + 1);
    
    // If we're showing fewer than 3 pages, adjust to show 3 where possible
    if (endPage - startPage + 1 < 3) {
      if (startPage === 1) {
        endPage = Math.min(3, totalPages);
      } else if (endPage === totalPages) {
        startPage = Math.max(1, totalPages - 2);
      }
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pageRange.push(i);
    }
    
    return (
      <div className="mt-4 flex flex-col sm:flex-row items-center justify-between">
        <div className="mb-3 sm:mb-0 text-sm text-gray-700">
          Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalUsers)} of {totalUsers} results
        </div>
        
        <div className="flex flex-wrap justify-center gap-1">
          <button
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            className={`px-3 py-2 sm:px-4 rounded-lg text-sm ${
              currentPage === 1
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            First
          </button>
          
          <button
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={currentPage === 1}
            className={`px-3 py-2 sm:px-4 rounded-lg text-sm ${
              currentPage === 1
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Prev
          </button>
          
          {pageRange.map(page => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={`px-3 py-2 rounded-lg text-sm ${
                currentPage === page
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {page}
            </button>
          ))}
          
          <button
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className={`px-3 py-2 sm:px-4 rounded-lg text-sm ${
              currentPage === totalPages || totalPages === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Next
          </button>
          
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages}
            className={`px-3 py-2 sm:px-4 rounded-lg text-sm ${
              currentPage === totalPages || totalPages === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Last
          </button>
        </div>
        
        <div className="mt-3 sm:mt-0 text-sm text-gray-700 hidden sm:block">
          Page {currentPage} of {totalPages}
        </div>
      </div>
    );
  };

  // Improved filter UI for mobile
  const UserFilters = () => (
    <div className="mb-6 flex flex-col">
      <div className="mb-3">
        <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
          Search Users
        </label>
        <input
          id="search"
          type="text"
          value={searchTerm}
          onChange={e => {
            setSearchTerm(e.target.value);
            setCurrentPage(1); // Reset to first page when searching
          }}
          placeholder="Search by name or email"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-sm focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="w-full sm:w-auto">
          <label htmlFor="filter" className="block text-sm font-medium text-gray-700 mb-1">
            Status Filter
          </label>
          <select
            id="filter"
            value={filterStatus}
            onChange={e => {
              setFilterStatus(e.target.value);
              setCurrentPage(1); // Reset to first page when filtering
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Users</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
        
        <div className="w-full sm:w-auto sm:self-end">
          <button
            onClick={() => {
              setSearchTerm('');
              setFilterStatus('all');
              setCurrentPage(1);
            }}
            className="w-full px-4 py-2 bg-gray-500 text-white rounded-lg text-sm font-medium hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Reset Filters
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="px-4 pb-20 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold pt-6 pb-6 text-center">Admin Dashboard</h1>

      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-md shadow-sm">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Mobile-friendly tabs - Improved */}
      <div className="mb-6 bg-white rounded-2xl shadow p-1.5 mx-auto max-w-md">
        <div className="flex">
          {['users', 'storage', 'templates', 'email-diagnostics'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`
                py-2.5 px-3 rounded-xl text-sm font-medium flex-1 transition-all
                ${activeTab === tab
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
                }
              `}
            >
              {tab === 'email-diagnostics' ? 'Email' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div>
          <div className="mb-6 bg-white rounded-2xl shadow p-5">
            <h2 className="text-xl font-semibold mb-5">Invite New User</h2>
            <form onSubmit={handleUserInvite} className="space-y-5">
              <div className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                
                <div>
                  <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-2">
                    User Role
                  </label>
                  <select
                    id="role"
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base bg-white focus:ring-blue-500 focus:border-blue-500 appearance-none"
                    style={{ backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundPosition: "right 0.5rem center", backgroundRepeat: "no-repeat", backgroundSize: "1.5em 1.5em", paddingRight: "2.5rem" }}
                  >
                    <option value="rentee">Rentee</option>
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
                
                <div className="flex items-center py-2">
                  <div className="bg-gray-100 p-2 rounded-lg">
                    <input
                      id="sendRealEmail"
                      type="checkbox"
                      checked={sendRealEmail}
                      onChange={(e) => setSendRealEmail(e.target.checked)}
                      className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="sendRealEmail" className="ml-2 text-sm text-gray-700">
                      Send real email (not simulated)
                    </label>
                  </div>
                </div>

                <div className="flex items-center py-2">
                  <div className="bg-gray-100 p-2 rounded-lg">
                    <input
                      id="testingMode"
                      type="checkbox"
                      checked={testingMode}
                      onChange={(e) => setTestingMode(e.target.checked)}
                      className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="testingMode" className="ml-2 text-sm text-gray-700">
                      Invitation Testing Mode
                    </label>
                  </div>
                </div>

                {testingMode && (
                  <div>
                    <label htmlFor="newUserName" className="block text-sm font-medium text-gray-700 mb-2">
                      User Name
                    </label>
                    <input
                      type="text"
                      id="newUserName"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter name for testing"
                    />
                  </div>
                )}
              </div>

              <div>
                <button
                  type="submit"
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl text-base font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-sm"
                  disabled={loading}
                >
                  {loading ? 'Adding...' : 'Add User'}
                </button>
              </div>
            </form>
          </div>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-4 px-2">
              <h2 className="text-xl font-semibold">User List</h2>
              <button 
                onClick={debugShowInvited}
                className="px-3 py-2 bg-blue-100 text-blue-700 text-xs rounded-lg"
              >
                Debug Info
              </button>
            </div>
            
            <UserFilters />
            
            {/* Mobile view */}
            <div className="space-y-4">
              {users.length > 0 ? (
                users.map(user => renderUserCard(user))
              ) : (
                <div className="bg-white p-8 rounded-xl text-center shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <p className="text-gray-500">No users found</p>
                </div>
              )}
            </div>
            
            <PaginationControls />
          </div>
        </div>
      )}

      {/* Storage Tab */}
      {activeTab === 'storage' && (
        <div className="bg-white rounded-2xl shadow p-5 mb-6">
          <h2 className="text-xl font-semibold mb-4">Storage Management</h2>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Bucket</label>
            <div className="flex flex-wrap gap-2">
              {Object.values(STORAGE_BUCKETS).map((bucket) => (
                <button
                  key={bucket}
                  onClick={() => setSelectedBucket(bucket)}
                  className={`
                    py-2 px-4 rounded-lg text-sm font-medium
                    ${selectedBucket === bucket 
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}
                  `}
                >
                  {bucket}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="folderPath" className="block text-sm font-medium text-gray-700 mb-1">
              Folder Path
            </label>
            <div className="flex">
              <input
                id="folderPath"
                type="text"
                value={selectedFolder}
                onChange={(e) => setSelectedFolder(e.target.value)}
                placeholder="e.g. images/"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-l-lg shadow-sm text-sm focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={() => loadFiles(selectedBucket, selectedFolder)}
                className="px-4 py-2 bg-blue-500 text-white rounded-r-lg text-sm font-medium hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Load Files'}
              </button>
            </div>
          </div>

          {bucketPermissions && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-md font-semibold mb-2">Bucket Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div><span className="font-medium">Name:</span> {bucketPermissions.name}</div>
                <div><span className="font-medium">Public:</span> {bucketPermissions.public ? 'Yes' : 'No'}</div>
                <div><span className="font-medium">Size Limit:</span> {formatBytes(bucketPermissions.fileSizeLimit)}</div>
                <div><span className="font-medium">Owner:</span> {bucketPermissions.owner}</div>
              </div>
            </div>
          )}

          <h3 className="text-lg font-semibold mb-3">Files</h3>
          {files.length > 0 ? (
            <div className="space-y-2">
              {files.map((file) => (
                <div key={file.id || file.name} className="p-3 border border-gray-200 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium truncate">{file.name}</span>
                    <span className="text-xs text-gray-500">{formatBytes(file.metadata?.size || file.size)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center bg-gray-50 rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-500">No files found</p>
            </div>
          )}
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div className="bg-white rounded-2xl shadow p-5 mb-6">
          <h2 className="text-xl font-semibold mb-4">Agreement Templates</h2>
          
          {templates.length > 0 ? (
            <div className="space-y-4">
              {templates.map(template => (
                <div key={template.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium text-lg">{template.name}</h3>
                      <p className="text-sm text-gray-600 mt-1">{template.description || 'No description'}</p>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      template.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {template.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">
                      View
                    </button>
                    <button className="px-3 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium">
                      Edit
                    </button>
                    <button className={`px-3 py-2 rounded-lg text-sm font-medium ${
                      template.active 
                        ? 'bg-red-100 text-red-700' 
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {template.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center bg-gray-50 rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-500">No templates found</p>
              <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
                Create Template
              </button>
            </div>
          )}
        </div>
      )}

      {/* Email Diagnostics Tab */}
      {activeTab === 'email-diagnostics' && (
        <div className="bg-white rounded-2xl shadow p-5">
          <h2 className="text-xl font-semibold mb-4">Email System Diagnostics</h2>
          <p className="text-sm text-gray-600 mb-4">
            Test and troubleshoot your email configuration and invitation process.
          </p>
          <EmailDiagnostic />
        </div>
      )}

      {/* Bottom Navigation - Mobile */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-3 px-5 flex justify-around shadow-lg">
        <button 
          onClick={() => setActiveTab('users')} 
          className={`flex flex-col items-center ${activeTab === 'users' ? 'text-blue-600' : 'text-gray-500'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <span className="text-xs mt-1">Users</span>
        </button>
        
        <button 
          onClick={() => setActiveTab('storage')} 
          className={`flex flex-col items-center ${activeTab === 'storage' ? 'text-blue-600' : 'text-gray-500'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
          <span className="text-xs mt-1">Storage</span>
        </button>
        
        <button 
          onClick={() => setActiveTab('templates')} 
          className={`flex flex-col items-center ${activeTab === 'templates' ? 'text-blue-600' : 'text-gray-500'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-xs mt-1">Templates</span>
        </button>
        
        <button 
          onClick={() => setActiveTab('email-diagnostics')} 
          className={`flex flex-col items-center ${activeTab === 'email-diagnostics' ? 'text-blue-600' : 'text-gray-500'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="text-xs mt-1">Email</span>
        </button>
      </div>
    </div>
  );
};

export default AdminDashboard;