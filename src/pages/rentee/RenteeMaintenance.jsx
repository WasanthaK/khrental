import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { MAINTENANCE_STATUS } from '../../utils/constants';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

// Components
import MaintenanceRequestCard from '../../components/maintenance/MaintenanceRequestCard';
import MaintenanceRequestForm from '../../components/maintenance/MaintenanceRequestForm';

const RenteeMaintenance = () => {
  const { userData } = useAuth();
  const navigate = useNavigate();
  
  // State
  const [maintenanceRequests, setMaintenanceRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Function to fetch maintenance requests
  const fetchMaintenanceRequests = async () => {
    try {
      if (!userData?.id) {
        console.error('No user ID available');
        setError('User authentication required');
        return;
      }

      setLoading(true);
      setError(null);
      
      console.log('Getting app_users ID for auth user:', userData.id);

      // First get the app_users record
      const { data: appUser, error: userError } = await supabase
        .from('app_users')
        .select('id')
        .eq('auth_id', userData.id)
        .single();

      if (userError) {
        console.error('Error fetching app_user:', userError);
        throw new Error('Failed to get user information');
      }

      if (!appUser) {
        console.error('No app_user found for auth_id:', userData.id);
        throw new Error('User not found');
      }

      console.log('Found app_user:', appUser);
      console.log('Attempting to fetch maintenance requests for app_user:', appUser.id);

      // Fetch the maintenance requests using the app_users ID
      const { data, error: fetchError } = await supabase
        .from('maintenance_requests')
        .select(`
          id,
          title,
          description,
          status,
          priority,
          requesttype,
          createdat,
          property:properties!maintenance_requests_propertyid_fkey(
            id,
            name,
            address,
            propertytype,
            status
          ),
          maintenance_request_images(
            id,
            image_url,
            image_type,
            uploaded_at
          ),
          assigned_staff:app_users!maintenance_requests_assignedto_fkey(
            id,
            name
          ),
          rentee:app_users!maintenance_requests_renteeid_fkey(
            id,
            name,
            email
          )
        `)
        .eq('renteeid', appUser.id)
        .order('createdat', { ascending: false });

      if (fetchError) {
        console.error('Error fetching maintenance requests:', fetchError);
        throw new Error('Failed to load maintenance requests');
      }

      console.log('Successfully fetched maintenance requests:', data);
      setMaintenanceRequests(data || []);
    } catch (err) {
      console.error('Error in fetchMaintenanceRequests:', err);
      setError(err.message || 'Failed to load maintenance requests');
      toast.error(err.message || 'Failed to load maintenance requests');
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch maintenance requests when component mounts or user data changes
  useEffect(() => {
    if (userData?.id) {
      fetchMaintenanceRequests();
    }
  }, [userData?.id]);
  
  // Handle form submission success
  const handleSubmitSuccess = () => {
    setShowForm(false);
    fetchMaintenanceRequests();
    toast.success('Maintenance request submitted successfully');
  };
  
  // Filter maintenance requests
  const filteredRequests = maintenanceRequests.filter(request => {
    return statusFilter === 'all' || request.status === statusFilter;
  });

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">My Maintenance Requests</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          {showForm ? 'Cancel' : 'New Request'}
        </button>
      </div>
      
      {/* Error message */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      )}
      
      {/* New Request Form */}
      {showForm && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Submit New Request</h2>
          <MaintenanceRequestForm
            onSubmitSuccess={handleSubmitSuccess}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}
      
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex items-center">
          <span className="text-sm font-medium text-gray-700 mr-2">Filter by status:</span>
          <div className="flex space-x-2">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 text-sm rounded-md ${
                statusFilter === 'all' 
                  ? 'bg-blue-100 text-blue-800' 
                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter(MAINTENANCE_STATUS.PENDING)}
              className={`px-3 py-1 text-sm rounded-md ${
                statusFilter === MAINTENANCE_STATUS.PENDING 
                  ? 'bg-yellow-100 text-yellow-800' 
                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setStatusFilter(MAINTENANCE_STATUS.IN_PROGRESS)}
              className={`px-3 py-1 text-sm rounded-md ${
                statusFilter === MAINTENANCE_STATUS.IN_PROGRESS 
                  ? 'bg-blue-100 text-blue-800' 
                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
              }`}
            >
              In Progress
            </button>
          </div>
        </div>
      </div>
      
      {/* Loading state */}
      {loading && (
        <div className="flex justify-center items-center h-32">
          <div className="text-lg text-gray-600">Loading maintenance requests...</div>
        </div>
      )}
      
      {/* Maintenance Requests List */}
      {!loading && (
        <div className="space-y-4">
          {filteredRequests.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-6 text-center text-gray-500">
              {error ? 'Error loading requests' : 'No maintenance requests found.'}
            </div>
          ) : (
            filteredRequests.map(request => (
              <MaintenanceRequestCard
                key={request.id}
                request={request}
                onCancelRequest={fetchMaintenanceRequests}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default RenteeMaintenance; 