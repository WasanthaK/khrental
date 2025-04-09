import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { MAINTENANCE_STATUS, MAINTENANCE_PRIORITY, MAINTENANCE_TYPES } from '../../utils/constants';
import { formatDate } from '../../utils/helpers';
import { toast } from 'react-hot-toast';
import { addMaintenanceComment, cancelMaintenanceRequest } from '../../services/maintenanceService';

// Components
import CommentSection from '../../components/maintenance/CommentSection';

const RenteeMaintenanceDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userData } = useAuth();
  
  // State
  const [request, setRequest] = useState(null);
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState('');
  
  // Fetch request data
  useEffect(() => {
    const fetchRequestData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Get the app_users ID first
        const { data: appUser, error: userError } = await supabase
          .from('app_users')
          .select('id')
          .eq('auth_id', userData.id)
          .single();

        if (userError) throw userError;
        if (!appUser) throw new Error('User not found');
        
        // Fetch maintenance request with all related data
        const { data: requestData, error: requestError } = await supabase
          .from('maintenance_requests')
          .select(`
            *,
            property:properties!maintenance_requests_propertyid_fkey(
              id,
              name,
              address,
              propertytype,
              status
            ),
            rentee:app_users!maintenance_requests_renteeid_fkey(
              id,
              name,
              email,
              contact_details
            ),
            assigned_staff:app_users!maintenance_requests_assignedto_fkey(
              id,
              name,
              email,
              contact_details
            ),
            maintenance_request_images(
              id,
              image_url,
              image_type,
              uploaded_at
            )
          `)
          .eq('id', id)
          .eq('renteeid', appUser.id)
          .single();
        
        if (requestError) throw requestError;
        if (!requestData) throw new Error('Maintenance request not found');
        
        console.log('Fetched request data:', requestData);
        setRequest(requestData);
        setProperty(requestData.property);
      } catch (error) {
        console.error('Error fetching maintenance request:', error);
        setError('Failed to load maintenance request details');
        toast.error('Failed to load maintenance request details');
      } finally {
        setLoading(false);
      }
    };
    
    if (id && userData?.id) {
      fetchRequestData();
    }
  }, [id, userData?.id]);
  
  // Handle request cancellation
  const handleCancelRequest = async () => {
    if (!cancellationReason.trim()) {
      toast.error('Please provide a reason for cancellation');
      return;
    }
    
    try {
      setActionLoading(true);
      console.log('Starting cancellation process for request:', id);
      console.log('Current request state:', request);
      
      const result = await cancelMaintenanceRequest(id, cancellationReason);
      console.log('Raw cancellation result:', result);
      
      if (!result.success) {
        console.error('Cancellation failed:', result.error);
        throw new Error(result.error || 'Failed to cancel request');
      }
      
      // Update the local state with the cancelled request
      if (result.data) {
        console.log('Updating local state with cancelled request:', result.data);
        setRequest(result.data);
        setProperty(result.data.property);
        
        // Verify the update
        console.log('Updated request state:', result.data);
        console.log('Updated property state:', result.data.property);
      } else {
        console.error('No data returned from cancellation');
        throw new Error('No data returned from cancellation');
      }
      
      toast.success('Maintenance request cancelled successfully');
      setShowCancelDialog(false);
      
    } catch (error) {
      console.error('Error cancelling request:', error);
      console.error('Error stack:', error.stack);
      toast.error('Failed to cancel request: ' + error.message);
    } finally {
      setActionLoading(false);
    }
  };
  
  // Handle adding a comment
  const handleAddComment = async (commentData) => {
    try {
      const result = await addMaintenanceComment(id, commentData);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to add comment');
      }
      
      // Refresh request data to get updated comments
      const { data: updatedRequest, error: requestError } = await supabase
        .from('maintenance_requests')
        .select(`
          *,
          property:properties!maintenance_requests_propertyid_fkey(
            id,
            name,
            address,
            propertytype,
            status
          ),
          rentee:app_users!maintenance_requests_renteeid_fkey(
            id,
            name,
            email,
            contact_details
          ),
          assigned_staff:app_users!maintenance_requests_assignedto_fkey(
            id,
            name,
            email,
            contact_details
          ),
          maintenance_request_images(
            id,
            image_url,
            image_type,
            uploaded_at
          )
        `)
        .eq('id', id)
        .single();
      
      if (requestError) {
        console.error('Error fetching updated request:', requestError);
        throw requestError;
      }
      
      if (!updatedRequest) {
        throw new Error('Updated request not found');
      }
      
      console.log('Updated request after adding comment:', updatedRequest);
      setRequest(updatedRequest);
      setProperty(updatedRequest.property);
      return true;
      
    } catch (error) {
      console.error('Error adding comment:', error);
      toast.error('Failed to add comment: ' + error.message);
      return false;
    }
  };
  
  // Parse notes from string to array of comments
  const parseNotes = (notes) => {
    if (!notes) return [];
    
    try {
      // If it's already a string that looks like JSON, parse it
      if (typeof notes === 'string' && (notes.startsWith('[') || notes.startsWith('{'))) {
        const parsedNotes = JSON.parse(notes);
        // If it's already an array, return it
        if (Array.isArray(parsedNotes)) {
          return parsedNotes;
        }
        // If it's a single object, wrap it in an array
        if (typeof parsedNotes === 'object') {
          return [parsedNotes];
        }
      }
      
      // If it's a plain string, treat it as a single comment
      if (typeof notes === 'string') {
        return [{
          content: notes,
          createdat: new Date().toISOString(),
          isInternal: false,
          isAdminMessage: false
        }];
      }
      
      // If it's already an array, return it
      if (Array.isArray(notes)) {
        return notes;
      }
      
      // If it's an object, wrap it in an array
      if (typeof notes === 'object') {
        return [notes];
      }
      
      return [];
    } catch (e) {
      console.error('Error parsing notes:', e);
      // If parsing fails, treat it as a single comment
      if (typeof notes === 'string') {
        return [{
          content: notes,
          createdat: new Date().toISOString(),
          isInternal: false,
          isAdminMessage: false
        }];
      }
      return [];
    }
  };
  
  // Format comment for display
  const formatComment = (comment) => {
    if (!comment) return '';
    
    if (typeof comment === 'string') {
      return comment;
    }
    
    if (typeof comment === 'object') {
      return comment.content || JSON.stringify(comment, null, 2);
    }
    
    return String(comment);
  };
  
  // Add debug logging for notes
  useEffect(() => {
    if (request?.notes) {
      console.log('Raw notes:', request.notes);
      const parsed = parseNotes(request.notes);
      console.log('Parsed notes:', parsed);
    }
  }, [request?.notes]);
  
  // Get priority info (color and label)
  const getPriorityInfo = (priority) => {
    switch (priority) {
      case MAINTENANCE_PRIORITY.LOW:
        return { color: 'bg-green-100 text-green-800', label: 'Low' };
      case MAINTENANCE_PRIORITY.MEDIUM:
        return { color: 'bg-yellow-100 text-yellow-800', label: 'Medium' };
      case MAINTENANCE_PRIORITY.HIGH:
        return { color: 'bg-orange-100 text-orange-800', label: 'High' };
      case MAINTENANCE_PRIORITY.EMERGENCY:
        return { color: 'bg-red-100 text-red-800', label: 'Emergency' };
      default:
        return { color: 'bg-gray-100 text-gray-800', label: 'Unknown' };
    }
  };
  
  // Get request type label
  const getRequestTypeLabel = (type) => {
    switch (type) {
      case MAINTENANCE_TYPES.AIR_CONDITIONING:
        return 'Air Conditioning';
      case MAINTENANCE_TYPES.PLUMBING:
        return 'Plumbing';
      case MAINTENANCE_TYPES.ELECTRICAL:
        return 'Electrical';
      case MAINTENANCE_TYPES.CLEANING:
        return 'Cleaning';
      case MAINTENANCE_TYPES.GARDENING:
        return 'Gardening';
      case MAINTENANCE_TYPES.PEST_CONTROL:
        return 'Pest Control';
      case MAINTENANCE_TYPES.EMERGENCY:
        return 'Emergency';
      case MAINTENANCE_TYPES.OTHER:
        return 'Other';
      default:
        return type || 'Unknown';
    }
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading maintenance request details...</div>
      </div>
    );
  }
  
  if (error || !request) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
        <strong className="font-bold">Error!</strong>
        <span className="block sm:inline"> {error || 'Maintenance request not found'}</span>
      </div>
    );
  }
  
  const priorityInfo = getPriorityInfo(request.priority);
  
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/rentee/maintenance')}
          className="text-blue-600 hover:text-blue-800 flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Back to Maintenance Requests
        </button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Request Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Request Card */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-semibold">{request.title}</h2>
                  <p className="text-gray-600">Request #{request.id} • {formatDate(request.createdat)}</p>
                </div>
                <div className="flex space-x-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityInfo.color}`}>
                    {priorityInfo.label}
                  </span>
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    {request.status}
                  </span>
                </div>
              </div>
              
              <div className="mb-6">
                <h3 className="text-md font-medium mb-2">Description</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{request.description}</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <h3 className="text-md font-medium mb-2">Property</h3>
                  <p className="text-gray-700">{property?.name || 'Unknown property'}</p>
                  {property && (
                    <p className="text-gray-600 text-sm">{property.address}</p>
                  )}
                </div>
                
                <div>
                  <h3 className="text-md font-medium mb-2">Request Type</h3>
                  <p className="text-gray-700">{getRequestTypeLabel(request.requesttype)}</p>
                </div>
              </div>
              
              {/* Images Timeline */}
              {request.images && request.images.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-md font-medium mb-2">Images Timeline</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {request.images.map((image, index) => (
                      <div key={index} className="relative group">
                        <div className="relative aspect-square">
                          <img
                            src={image}
                            alt={`Request image ${index + 1}`}
                            className="w-full h-full object-cover rounded-lg cursor-pointer"
                            onClick={() => {
                              setSelectedImage(image);
                              setShowImageModal(true);
                            }}
                          />
                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity duration-200 rounded-lg flex items-center justify-center">
                            <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              Click to view
                            </span>
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Image {index + 1} of {request.images.length}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Action Buttons */}
              {request.status === MAINTENANCE_STATUS.PENDING && (
                <div className="flex justify-end">
                  <button
                    onClick={() => setShowCancelDialog(true)}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                    disabled={actionLoading}
                  >
                    {actionLoading ? 'Cancelling...' : 'Cancel Request'}
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Comments Section */}
          <CommentSection
            comments={parseNotes(request?.notes || [])}
            onAddComment={handleAddComment}
            userRole="rentee"
            userName={userData?.name || 'Rentee'}
          />
        </div>
        
        {/* Right Column - Status Timeline */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-medium mb-4">Request Timeline</h3>
            
            <div className="space-y-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <div className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center">
                    <svg className="h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-900">Request Created</p>
                  <p className="text-sm text-gray-500">{formatDate(request.createdat)}</p>
                </div>
              </div>
              
              {request.assignedto && (
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center">
                      <svg className="h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-900">Staff Assigned</p>
                    <p className="text-sm text-gray-500">{formatDate(request.updatedat)}</p>
                  </div>
                </div>
              )}
              
              {request.status === MAINTENANCE_STATUS.IN_PROGRESS && (
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-yellow-500 flex items-center justify-center">
                      <svg className="h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-900">Work Started</p>
                    <p className="text-sm text-gray-500">{formatDate(request.updatedat)}</p>
                  </div>
                </div>
              )}
              
              {request.status === MAINTENANCE_STATUS.COMPLETED && (
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center">
                      <svg className="h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-900">Work Completed</p>
                    <p className="text-sm text-gray-500">{formatDate(request.completeddate)}</p>
                  </div>
                </div>
              )}
              
              {request.status === MAINTENANCE_STATUS.CANCELLED && (
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-red-500 flex items-center justify-center">
                      <svg className="h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-900">Request Cancelled</p>
                    <p className="text-sm text-gray-500">{formatDate(request.updatedat)}</p>
                    {request.cancellationreason && (
                      <p className="text-sm text-gray-700 mt-1">{request.cancellationreason}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Cancel Dialog */}
      {showCancelDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium mb-4">Cancel Maintenance Request</h3>
            <p className="text-gray-600 mb-4">Please provide a reason for cancelling this request:</p>
            
            <textarea
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 mb-4"
              rows="3"
              placeholder="Enter cancellation reason..."
            />
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowCancelDialog(false)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900"
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleCancelRequest}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                disabled={actionLoading || !cancellationReason.trim()}
              >
                {actionLoading ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Image Modal */}
      {showImageModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Image View</h3>
              <button
                onClick={() => setShowImageModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="relative">
              <img
                src={selectedImage}
                alt="Full size"
                className="max-h-[80vh] mx-auto rounded-lg"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <button
                  onClick={() => setShowImageModal(false)}
                  className="absolute top-4 right-4 text-white bg-black bg-opacity-50 rounded-full p-2 hover:bg-opacity-75"
                >
                  <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RenteeMaintenanceDetails; 