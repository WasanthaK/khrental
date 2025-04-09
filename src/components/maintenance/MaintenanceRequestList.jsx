import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { MAINTENANCE_STATUS, MAINTENANCE_PRIORITY } from '../../utils/constants';
import { toast } from 'react-hot-toast';
import MaintenanceRequestCard from './MaintenanceRequestCard';

const MaintenanceRequestList = () => {
  const navigate = useNavigate();
  const { userData } = useAuth();
  
  // State management
  const [maintenanceRequests, setMaintenanceRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filter states
  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
    search: ''
  });

  // Fetch maintenance requests with proper joins
  const fetchMaintenanceRequests = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Determine query based on user role
      let query = supabase
        .from('maintenance_requests')
        .select(`
          id,
          title,
          description,
          status,
          priority,
          requesttype,
          createdat,
          updatedat,
          propertyid,
          renteeid,
          assignedto,
          assignedat,
          startedat,
          completedat,
          cancelledat,
          cancellationreason,
          notes,
          property:properties!maintenance_requests_propertyid_fkey (
            id,
            name,
            address,
            property_type,
            status
          ),
          rentee:app_users!maintenance_requests_renteeid_fkey (
            id,
            name,
            email,
            contact_details
          ),
          assigned_staff:app_users!maintenance_requests_assignedto_fkey (
            id,
            name,
            email,
            contact_details
          ),
          maintenance_request_images (
            id,
            image_url,
            image_type,
            uploaded_at
          )
        `)
        .order('createdat', { ascending: false });

      // Add role-based filters
      if (userData.role === 'rentee') {
        query = query.eq('renteeid', userData.id);
      } else if (userData.role === 'maintenance_staff') {
        query = query.eq('assignedto', userData.id);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        throw fetchError;
      }

      console.log('Fetched maintenance requests:', data);
      setMaintenanceRequests(data || []);
    } catch (err) {
      console.error('Error fetching maintenance requests:', err);
      setError('Failed to load maintenance requests');
      toast.error('Failed to load maintenance requests');
    } finally {
      setIsLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchMaintenanceRequests();
  }, [userData.id, userData.role]);

  // Handle filter changes
  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  };

  // Filter maintenance requests
  const filteredRequests = maintenanceRequests.filter(request => {
    const matchesStatus = filters.status === 'all' || request.status === filters.status;
    const matchesPriority = filters.priority === 'all' || request.priority === filters.priority;
    
    const searchTerm = filters.search.toLowerCase();
    const matchesSearch = !filters.search || 
      request.title?.toLowerCase().includes(searchTerm) ||
      request.description?.toLowerCase().includes(searchTerm) ||
      request.property?.name?.toLowerCase().includes(searchTerm) ||
      request.rentee?.name?.toLowerCase().includes(searchTerm);

    return matchesStatus && matchesPriority && matchesSearch;
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading maintenance requests...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
        <strong className="font-bold">Error!</strong>
        <span className="block sm:inline"> {error}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div>
            <input
              type="text"
              placeholder="Search by title, description, property..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              {Object.values(MAINTENANCE_STATUS).map(status => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <select
              value={filters.priority}
              onChange={(e) => handleFilterChange('priority', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Priorities</option>
              {Object.values(MAINTENANCE_PRIORITY).map(priority => (
                <option key={priority} value={priority}>
                  {priority.charAt(0).toUpperCase() + priority.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Requests List */}
      <div className="space-y-4">
        {filteredRequests.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-6 text-center text-gray-500">
            No maintenance requests found.
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
    </div>
  );
};

export default MaintenanceRequestList; 