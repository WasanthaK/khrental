import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchData, supabase } from '../services/supabaseClient';
import { 
  updateMaintenanceRequest, 
  assignMaintenanceRequest, 
  startMaintenanceWork, 
  completeMaintenanceRequest, 
  cancelMaintenanceRequest,
  addMaintenanceComment
} from '../services/maintenanceService';
import { formatDate } from '../utils/helpers';
import { MAINTENANCE_STATUS, MAINTENANCE_PRIORITY, MAINTENANCE_TYPES } from '../utils/constants';
import { useAuth } from '../hooks/useAuth';
import { isValidUUID } from '../utils/validators';
import { toast } from 'react-hot-toast';

// Components
import StatusTracker from '../components/maintenance/StatusTracker';
import StaffAssignment from '../components/maintenance/StaffAssignment';
import CommentSection from '../components/maintenance/CommentSection';
import ImageUpload from '../components/common/ImageUpload';

const MaintenanceDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // State
  const [request, setRequest] = useState({
    id: '',
    title: '',
    description: '',
    requesttype: '',
    priority: '',
    status: MAINTENANCE_STATUS.PENDING,
    images: [],
    notes: '',
    cancellationreason: '',
    completeddate: null,
    assignedat: null,
    assignedto: null,
    createdat: null,
    updatedat: null,
    cancelledat: null,
    propertyid: null,
    renteeid: null
  });
  const [property, setProperty] = useState(null);
  const [rentee, setRentee] = useState(null);
  const [assignedTeamMember, setAssignedTeamMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  
  // UI state
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [completionImages, setCompletionImages] = useState([]);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageCollection, setImageCollection] = useState({ images: [], title: '' });
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState('');
  
  // Define fetchRequestData as a reusable function at component level
  const fetchRequestData = async () => {
    try {
      setLoading(true);
      
      // Fetch maintenance request with all related data
      const { data: requestData, error: requestError } = await supabase
        .from('maintenance_requests')
        .select(`
          *,
          property:properties!maintenance_requests_propertyid_fkey(*),
          rentee:app_users!maintenance_requests_renteeid_fkey(*),
          assigned_staff:app_users!maintenance_requests_assignedto_fkey(*),
          maintenance_request_images(*)
        `)
        .eq('id', id)
        .single();
      
      if (requestError) {
        console.error('Error fetching maintenance request:', requestError);
        setError('Failed to load maintenance request details: ' + (requestError.message || 'Unknown error'));
        setLoading(false);
        return;
      }
      
      if (!requestData) {
        throw new Error('Maintenance request not found');
      }
      
      // Only log in development
      if (process.env.NODE_ENV === 'development') {
        console.log('Maintenance request data:', {
          id: requestData.id,
          status: requestData.status,
          type: requestData.requesttype,
          property: requestData.property,
          rentee: requestData.rentee,
          images: requestData.maintenance_request_images?.length || 0
        });
      }
      
      // Set the request data
      setRequest(requestData);
      
      // Set related data
      setProperty(requestData.property);
      setRentee(requestData.rentee);
      setAssignedTeamMember(requestData.assigned_staff);
      
    } catch (error) {
      console.error('Error fetching request data:', error);
      setError('Failed to load maintenance request details: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };
  
  // Initial data fetch with cleanup
  useEffect(() => {
    let mounted = true;

    if (!id || id === 'undefined' || !isValidUUID(id)) {
      console.error('Invalid maintenance request ID:', id);
      setError('Invalid maintenance request ID. Please check the URL and try again.');
      setLoading(false);
      return;
    }

    fetchRequestData();

    return () => {
      mounted = false;
    };
  }, [id]);
  
  // Handle staff assignment
  const handleAssignStaff = async (assignmentData) => {
    try {
      setActionLoading(true);
      setError(null);
      
      console.log("Assigning staff with data:", assignmentData);
      
      // Validate staffId
      if (!assignmentData?.staffId || !isValidUUID(assignmentData.staffId)) {
        throw new Error('Invalid staff member selected. Please try again.');
      }
      
      const result = await assignMaintenanceRequest(id, assignmentData);
      console.log("Assignment result:", result);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to assign staff');
      }
      
      // Refresh all data after successful assignment
      await fetchRequestData();
    } catch (error) {
      console.error('Error assigning staff:', error.message);
      setError(error.message);
    } finally {
      setActionLoading(false);
    }
  };
  
  // Handle start work
  const handleStartWork = async () => {
    try {
      setActionLoading(true);
      setError(null);
      
      const result = await startMaintenanceWork(id);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to start work');
      }
      
      // Refresh all data
      await fetchRequestData();
    } catch (error) {
      console.error('Error starting work:', error.message);
      setError(error.message);
    } finally {
      setActionLoading(false);
    }
  };
  
  // Handle complete request
  const handleCompleteRequest = async () => {
    if (!completionNotes.trim()) {
      toast.error('Please provide completion notes');
      return;
    }

    try {
      setActionLoading(true);
      
      // Extract file objects from the completionImages array
      const preparedImages = completionImages.map(img => {
        if (typeof img === 'string') {
          return img; // Already a URL
        }
        return img; // File object
      });

      const completionData = {
        notes: completionNotes,
        images: preparedImages
      };

      await completeMaintenanceRequest(id, completionData);
      toast.success('Maintenance request completed successfully');
      navigate('/dashboard/maintenance');
    } catch (error) {
      console.error('Error completing maintenance request:', error);
      toast.error('Failed to complete maintenance request');
    } finally {
      setActionLoading(false);
      setShowCompleteDialog(false);
    }
  };
  
  // Handle cancel request
  const handleCancelRequest = async () => {
    try {
      setActionLoading(true);
      setError(null);
      
      if (!cancellationReason.trim()) {
        throw new Error('Please provide a reason for cancellation');
      }
      
      console.log('Cancelling request with reason:', cancellationReason);
      
      const result = await cancelMaintenanceRequest(id, cancellationReason);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to cancel request');
      }
      
      // Refresh all data
      await fetchRequestData();
      setShowCancelDialog(false);
      toast.success('Maintenance request cancelled successfully');
    } catch (error) {
      console.error('Error cancelling request:', error.message);
      setError(error.message);
      toast.error('Failed to cancel request: ' + error.message);
    } finally {
      setActionLoading(false);
    }
  };
  
  // Handle add comment
  const handleAddComment = async (commentData) => {
    try {
      const result = await addMaintenanceComment(id, commentData);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to add comment');
      }
      
      // Refresh all data instead of just updating the request
      await fetchRequestData();
      return true;
    } catch (error) {
      console.error('Error adding comment:', error.message);
      throw error;
    }
  };
  
  // Handle completion images change
  const handleCompletionImagesChange = (images) => {
    setCompletionImages(images);
  };
  
  // Parse notes from string to array of comments
  const parseNotes = (notes) => {
    if (!notes) return [];
    
    try {
      const parsedNotes = JSON.parse(notes);
      if (Array.isArray(parsedNotes)) {
        return parsedNotes;
      } else {
        // If notes is a JSON object but not an array, wrap it in an array
        return [{ content: notes, createdat: new Date().toISOString() }];
      }
    } catch (e) {
      // If notes is not valid JSON, treat it as a single comment
      return [{ content: notes, createdat: new Date().toISOString() }];
    }
  };
  
  // Get priority label
  const getPriorityLabel = (priority) => {
    switch (priority) {
      case MAINTENANCE_PRIORITY.LOW:
        return 'Low';
      case MAINTENANCE_PRIORITY.MEDIUM:
        return 'Medium';
      case MAINTENANCE_PRIORITY.HIGH:
        return 'High';
      case MAINTENANCE_PRIORITY.EMERGENCY:
        return 'Emergency';
      default:
        return 'Unknown';
    }
  };
  
  // Get priority color
  const getPriorityColor = (priority) => {
    switch (priority) {
      case MAINTENANCE_PRIORITY.LOW:
        return 'bg-green-100 text-green-800';
      case MAINTENANCE_PRIORITY.MEDIUM:
        return 'bg-yellow-100 text-yellow-800';
      case MAINTENANCE_PRIORITY.HIGH:
        return 'bg-orange-100 text-orange-800';
      case MAINTENANCE_PRIORITY.EMERGENCY:
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  
  // Check if user can perform actions
  const canPerformActions = () => {
    return user && (user.role === 'admin' || user.role === 'staff' || user.role === 'maintenance');
  };
  
  // Render loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading maintenance request details...</div>
      </div>
    );
  }
  
  // Render error state
  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
        <strong className="font-bold">Error!</strong>
        <span className="block sm:inline"> {error}</span>
        <div className="mt-4">
          <button
            onClick={() => navigate('/dashboard/maintenance')}
            className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
          >
            Back to Maintenance Requests
          </button>
        </div>
      </div>
    );
  }
  
  // Render if request not found
  if (!request) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-semibold mb-4">Maintenance Request Not Found</h2>
        <p className="mb-6">The maintenance request you are looking for does not exist or has been removed.</p>
        <button
          onClick={() => navigate('/dashboard/maintenance')}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Back to Maintenance Requests
        </button>
      </div>
    );
  }
  
  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Maintenance Request Details</h1>
        <div className="flex space-x-3">
          <button
            onClick={() => navigate('/dashboard/maintenance')}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Back to Maintenance Requests
          </button>
          
          {canPerformActions() && request.status !== MAINTENANCE_STATUS.COMPLETED && request.status !== MAINTENANCE_STATUS.CANCELLED && (
            <Link
              to={`/dashboard/maintenance/${id}/edit`}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Edit Request
            </Link>
          )}
        </div>
      </div>
      
      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Request Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Request Card */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-semibold">{request.title}</h2>
                  <p className="text-gray-600">Request #{request.id} • {formatDate(request.created_at)}</p>
                </div>
                <div className="flex space-x-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(request.priority)}`}>
                    {getPriorityLabel(request.priority)}
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
                  <h3 className="text-md font-medium mb-2">Reported by</h3>
                  <p className="text-gray-700">{rentee?.name || 'Unknown rentee'}</p>
                  {rentee && rentee.contact_details && (
                    <p className="text-gray-600 text-sm">{rentee.contact_details.email || rentee.contact_details.phone}</p>
                  )}
                </div>

                <div>
                  <h3 className="text-md font-medium mb-2">Request Type</h3>
                  <p className="text-gray-700">{request.requesttype || 'Not specified'}</p>
                </div>

                <div>
                  <h3 className="text-md font-medium mb-2">Scheduled Date</h3>
                  <p className="text-gray-700">{request.assignedat ? formatDate(request.assignedat) : 'Not scheduled'}</p>
                </div>
              </div>
              
              {/* Images */}
              {request.maintenance_request_images?.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-md font-medium mb-2">Images</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {request.maintenance_request_images.map((image, index) => (
                      <div 
                        key={index}
                        className="relative group cursor-pointer"
                        onClick={() => {
                          setActiveImageIndex(index);
                          setShowImageViewer(true);
                          setImageCollection({
                            images: request.maintenance_request_images.map(img => img.image_url),
                            title: 'Request Images'
                          });
                        }}
                      >
                        <img 
                          src={image.image_url} 
                          alt={`Request ${request.id} image ${index + 1}`} 
                          className="w-full h-32 object-cover rounded border border-gray-200 transition-all duration-200 group-hover:opacity-90"
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="bg-black bg-opacity-50 rounded-full p-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Completion Notes */}
              {request.status === MAINTENANCE_STATUS.COMPLETED && request.notes && (
                <div className="mb-6">
                  <h3 className="text-md font-medium mb-2">Completion Notes</h3>
                  <p className="text-gray-700 whitespace-pre-wrap">{request.notes}</p>
                </div>
              )}
              
              {/* Completion Images */}
              {request.status === MAINTENANCE_STATUS.COMPLETED && request.maintenance_request_images && request.maintenance_request_images.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-medium mb-4">Completion Images</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {request.maintenance_request_images.map((image, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={image.image_url}
                          alt={`Completion image ${index + 1}`}
                          className="w-full h-48 object-cover rounded-lg"
                          onClick={() => {
                            setSelectedImage(image.image_url);
                            setShowImageModal(true);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Cancellation Reason */}
              {request.status === MAINTENANCE_STATUS.CANCELLED && request.cancellationreason && (
                <div className="mb-6">
                  <h3 className="text-md font-medium mb-2">Cancellation Reason</h3>
                  <p className="text-gray-700">{request.cancellationreason}</p>
                </div>
              )}
              
              {/* Action Buttons */}
              {canPerformActions() && (
                <div className="mt-6 flex flex-wrap gap-3">
                  {/* Assign Staff Button */}
                  {request.status === MAINTENANCE_STATUS.PENDING && !request.assignedto && (
                    <button
                      onClick={() => document.getElementById('staffAssignment').scrollIntoView({ behavior: 'smooth' })}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      disabled={actionLoading}
                    >
                      Assign Staff
                    </button>
                  )}
                  
                  {/* Start Work Button */}
                  {request.status === MAINTENANCE_STATUS.PENDING && request.assignedto && (
                    <button
                      onClick={handleStartWork}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                      disabled={actionLoading}
                    >
                      {actionLoading ? 'Starting...' : 'Start Work'}
                    </button>
                  )}
                  
                  {/* Complete Button */}
                  {request.status === MAINTENANCE_STATUS.IN_PROGRESS && (
                    <button
                      onClick={() => setShowCompleteDialog(true)}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                      disabled={actionLoading}
                    >
                      {actionLoading ? 'Completing...' : 'Mark as Completed'}
                    </button>
                  )}
                  
                  {/* Cancel Button */}
                  {(request.status === MAINTENANCE_STATUS.PENDING || request.status === MAINTENANCE_STATUS.IN_PROGRESS) && (
                    <button
                      onClick={() => setShowCancelDialog(true)}
                      className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                      disabled={actionLoading}
                    >
                      {actionLoading ? 'Cancelling...' : 'Cancel Request'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Comments Section */}
          <CommentSection
            comments={parseNotes(request.notes)}
            onAddComment={handleAddComment}
            userRole={user?.role || 'guest'}
            userName={user?.name || 'Guest'}
          />
        </div>
        
        {/* Right Column - Status and Assignment */}
        <div className="space-y-6">
          {/* Status Tracker */}
          <StatusTracker 
            request={request} 
            assignedTeamMember={assignedTeamMember}
          />
          
          {/* Staff Assignment */}
          {canPerformActions() && (request.status === MAINTENANCE_STATUS.PENDING || request.status === MAINTENANCE_STATUS.IN_PROGRESS) && (
            <div id="staffAssignment">
              <StaffAssignment
                requestId={id}
                currentAssignee={assignedTeamMember ? {
                  id: assignedTeamMember.id,
                  name: assignedTeamMember.name,
                  scheduledDate: request.assignedat,
                  assignedAt: request.updatedat
                } : null}
                onAssign={handleAssignStaff}
                disabled={actionLoading || request.status !== MAINTENANCE_STATUS.PENDING}
                existingImages={request.maintenance_request_images || []}
              />
            </div>
          )}
        </div>
      </div>
      
      {/* Cancel Dialog */}
      {showCancelDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4">Cancel Maintenance Request</h2>
            <p className="mb-4">Are you sure you want to cancel this maintenance request? This action cannot be undone.</p>
            
            <div className="mb-4">
              <label htmlFor="cancellationReason" className="block text-sm font-medium text-gray-700 mb-1">
                Reason for Cancellation <span className="text-red-500">*</span>
              </label>
              <textarea
                id="cancellationReason"
                rows="3"
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Please provide a reason for cancellation"
                required
              ></textarea>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowCancelDialog(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                disabled={actionLoading}
              >
                No, Keep Request
              </button>
              <button
                onClick={handleCancelRequest}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                disabled={actionLoading || !cancellationReason.trim()}
              >
                {actionLoading ? 'Cancelling...' : 'Yes, Cancel Request'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Complete Dialog */}
      {showCompleteDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4">Complete Maintenance Request</h2>
            <p className="mb-4">Please provide details about the completed work.</p>
            
            <div className="mb-4">
              <label htmlFor="completionNotes" className="block text-sm font-medium text-gray-700 mb-1">
                Completion Notes <span className="text-red-500">*</span>
              </label>
              <textarea
                id="completionNotes"
                rows="3"
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Describe the work that was done"
                required
              ></textarea>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Completion Images (Optional)
              </label>
              <ImageUpload
                onImagesChange={handleCompletionImagesChange}
                maxImages={5}
                initialImages={[]}
              />
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowCompleteDialog(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleCompleteRequest}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                disabled={actionLoading || !completionNotes.trim()}
              >
                {actionLoading ? 'Completing...' : 'Mark as Completed'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Image Viewer Modal */}
      {showImageViewer && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex flex-col z-50">
          <div className="p-4 flex justify-between items-center bg-black bg-opacity-50">
            <h3 className="text-white text-lg font-medium">{imageCollection.title} ({activeImageIndex + 1} of {imageCollection.images.length})</h3>
            <button 
              onClick={() => setShowImageViewer(false)}
              className="text-white hover:text-gray-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="flex-grow flex items-center justify-center p-4">
            <img 
              src={imageCollection.images[activeImageIndex]} 
              alt={`Image ${activeImageIndex + 1}`}
              className="max-h-full max-w-full object-contain"
            />
          </div>
          
          <div className="p-4 flex justify-between items-center bg-black bg-opacity-50">
            <button 
              onClick={() => setActiveImageIndex(prev => (prev > 0 ? prev - 1 : imageCollection.images.length - 1))}
              className="text-white hover:text-gray-300 p-2"
              disabled={imageCollection.images.length <= 1}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            
            <div className="text-white">
              {activeImageIndex + 1} / {imageCollection.images.length}
            </div>
            
            <button 
              onClick={() => setActiveImageIndex(prev => (prev < imageCollection.images.length - 1 ? prev + 1 : 0))}
              className="text-white hover:text-gray-300 p-2"
              disabled={imageCollection.images.length <= 1}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}
      
      {/* Image Modal */}
      {showImageModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="max-w-4xl w-full mx-4">
            <div className="relative">
              <img
                src={selectedImage}
                alt="Full size"
                className="w-full h-auto rounded-lg"
              />
              <button
                onClick={() => setShowImageModal(false)}
                className="absolute top-4 right-4 text-white bg-black bg-opacity-50 rounded-full p-2 hover:bg-opacity-75"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaintenanceDetails; 