import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchData, supabase, checkUserExists } from '../services/supabaseClient';
import { 
  updateMaintenanceRequest, 
  assignMaintenanceRequest, 
  startMaintenanceWork, 
  completeMaintenanceRequest, 
  cancelMaintenanceRequest,
  addMaintenanceComment,
  addMaintenanceRequestImage
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
import MaintenanceImageUpload from '../components/maintenance/MaintenanceImageUpload';

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
  const [selectedImage, setSelectedImage] = useState(null);
  const [showImageModal, setShowImageModal] = useState(false);
  
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
      
      // Detailed inspection of request images
      console.log('Maintenance request images:', requestData.maintenance_request_images);
      if (requestData.maintenance_request_images) {
        console.log(`Found ${requestData.maintenance_request_images.length} images for this request`);
        // Log detailed info about each image
        requestData.maintenance_request_images.forEach((img, index) => {
          console.log(`Image ${index + 1}:`, {
            id: img.id,
            url: img.image_url,
            type: img.image_type,
            uploaded_at: img.uploaded_at
          });
        });
      } else {
        console.log('No images found for this maintenance request');
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
      setError(null);
      
      // Create completion data object with notes and any uploaded images
      const completionData = {
        notes: completionNotes,
        images: completionImages.map(img => ({
          ...img,
          type: img.type || 'completion'  // Ensure type is set for all images
        })),
        userId: user?.id
      };
      
      console.log('Completing request with data:', completionData);
      
      const result = await completeMaintenanceRequest(id, completionData);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to complete request');
      }
      
      setShowCompleteDialog(false);
      setCompletionNotes('');
      setCompletionImages([]);
      
      // Refresh all data
      await fetchRequestData();
      
      toast.success('Maintenance request has been completed successfully');
    } catch (error) {
      console.error('Error completing request:', error.message);
      setError(error.message);
      toast.error(error.message || 'Failed to complete request');
    } finally {
      setActionLoading(false);
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
  
  // Modify the parseNotes function to better handle JSON format
  const parseNotes = (notes) => {
    if (!notes) return [];
    
    try {
      // Try to parse as JSON
      const parsedNotes = JSON.parse(notes);
      if (Array.isArray(parsedNotes)) {
        // Add proper display formatting for admin messages
        return parsedNotes.map(note => ({
          ...note,
          isAdminMessage: note.role === 'admin' || !!note.isAdminMessage,
          // Ensure content is extracted correctly
          content: note.content || note.text || ''
        }));
      } else if (typeof parsedNotes === 'object') {
        // If notes is a JSON object but not an array, wrap it in an array
        return [{
          content: parsedNotes.content || parsedNotes.text || JSON.stringify(parsedNotes),
          createdat: parsedNotes.createdat || new Date().toISOString(),
          isAdminMessage: parsedNotes.role === 'admin' || !!parsedNotes.isAdminMessage
        }];
      }
    } catch (e) {
      // If notes is not valid JSON, treat it as a single comment
      console.log("Failed to parse notes as JSON:", e);
      return [{ content: notes, createdat: new Date().toISOString(), isAdminMessage: false }];
    }
    
    // Fallback
    return [{ content: notes, createdat: new Date().toISOString(), isAdminMessage: false }];
  };
  
  // Update the organizeImagesByStage function to be more forgiving with data
  const organizeImagesByStage = (images) => {
    // Debug output to check what we're receiving
    console.log('Images received for organization:', images);
    
    if (!images || images.length === 0) {
      console.log('No images found to organize');
      return [];
    }
    
    // Clone the images array and ensure each image has all required properties
    const sortedImages = [...images].map(img => ({
      ...img,
      image_url: img.image_url || '',
      image_type: img.image_type || 'initial',
      uploaded_at: img.uploaded_at || new Date().toISOString()
    }));
    
    // Filter out any images with empty URLs
    const validImages = sortedImages.filter(img => !!img.image_url);
    
    if (validImages.length < sortedImages.length) {
      console.log(`Filtered out ${sortedImages.length - validImages.length} images with empty URLs`);
    }
    
    // Sort images by uploaded_at date
    validImages.sort((a, b) => {
      const dateA = new Date(a.uploaded_at || 0);
      const dateB = new Date(b.uploaded_at || 0);
      return dateA - dateB;
    });
    
    // Debug output for sorted images
    console.log('Images after sorting:', validImages);
    
    // Group images by type
    const groupedImages = validImages.reduce((acc, image) => {
      // Make sure we have a valid type
      const type = image.image_type || 'initial';
      if (!acc[type]) acc[type] = [];
      acc[type].push(image);
      return acc;
    }, {});
    
    // Debug output for grouped images
    console.log('Images after grouping by type:', groupedImages);
    
    // Define stage order and labels
    const stageOrder = ['initial', 'additional', 'progress', 'completion'];
    const stageLabels = {
      'initial': 'Initial Request Images',
      'additional': 'Additional Images',
      'progress': 'Work in Progress Images',
      'completion': 'Completion Images'
    };
    
    // Create the final structure
    const organizedImages = stageOrder
      .filter(stage => groupedImages[stage] && groupedImages[stage].length > 0)
      .map(stage => ({
        stage,
        label: stageLabels[stage],
        images: groupedImages[stage]
      }));
    
    // Debug output for final organized structure
    console.log('Final organized images by stage:', organizedImages);
    
    return organizedImages;
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
  
  // Add this function at the end of the component but before the return statement
  const debugFetchImages = async () => {
    try {
      console.log('Fetching images directly from database for debugging');
      
      const { data: images, error } = await supabase
        .from('maintenance_request_images')
        .select('*')
        .eq('maintenance_request_id', id);
      
      if (error) {
        console.error('Error fetching images:', error);
        return;
      }
      
      console.log(`Direct query found ${images?.length || 0} images for request ${id}:`, images);
      
      // If we found images but they're not showing in the UI, force update
      if (images && images.length > 0 && (!request.maintenance_request_images || request.maintenance_request_images.length === 0)) {
        console.log('Found images directly but not in request - updating request data');
        const updatedRequest = {...request, maintenance_request_images: images};
        setRequest(updatedRequest);
      }
    } catch (err) {
      console.error('Error in debug fetch images:', err);
    }
  };
  
  // Add this function before the return statement
  const handleAddMultipleImages = async (files) => {
    try {
      setActionLoading(true);
      let errorCount = 0;
      let successCount = 0;
      
      // First check if we have a valid user ID
      let validUserId = null;
      if (user?.id) {
        // Use our utility function for more reliable user checking
        const { exists, data } = await checkUserExists(user.id);
        if (exists && data) {
          validUserId = user.id;
          console.log('Valid user ID confirmed for image upload:', validUserId);
        } else {
          console.warn('Could not validate user ID - will upload without attribution');
        }
      }
      
      // Process files one by one
      for (const file of files) {
        try {
          const result = await addMaintenanceRequestImage({
            maintenance_request_id: id,
            image: file,
            image_type: 'additional',
            description: '',
            userId: validUserId // Only pass the user ID if we've verified it exists
          });
          
          if (result.success) {
            successCount++;
          } else {
            errorCount++;
            console.error('Failed to add image:', result.error);
          }
        } catch (err) {
          errorCount++;
          console.error('Error adding image:', err);
        }
      }
      
      // Refresh data to show updated images
      await fetchRequestData();
      
      if (successCount > 0) {
        toast.success(`Successfully added ${successCount} image${successCount !== 1 ? 's' : ''}`);
      }
      
      if (errorCount > 0) {
        toast.error(`Failed to add ${errorCount} image${errorCount !== 1 ? 's' : ''}`);
      }
    } catch (error) {
      console.error('Error adding images:', error);
      toast.error('Failed to add images');
    } finally {
      setActionLoading(false);
    }
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Debug button - only visible in development */}
      {process.env.NODE_ENV === 'development' && (
        <button 
          onClick={debugFetchImages}
          className="mb-4 px-3 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded"
          title="Debug: Fetch images directly"
        >
          Debug Images
        </button>
      )}
      
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
              
              {/* Sequential Image Gallery */}
              {(() => {
                // Debug section to help troubleshoot
                console.log('Maintenance request data for images:', request);
                console.log('Maintenance request images:', request.maintenance_request_images);
                
                // Add a placeholder if no images
                if (!request.maintenance_request_images || request.maintenance_request_images.length === 0) {
                  console.log('No maintenance request images found');
                  return (
                    <div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden">
                      <div className="px-6 py-4 border-b">
                        <h3 className="text-lg font-medium">Maintenance Request Images</h3>
                        <p className="text-sm text-gray-500 mt-1">No images available for this maintenance request</p>
                      </div>
                      
                      <div className="px-6 py-4 text-center text-gray-500">
                        <div className="mb-4">
                          <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <p>No images have been uploaded for this maintenance request.</p>
                        {canPerformActions() && (
                          <p className="mt-2">
                            <label 
                              htmlFor="add-images-input"
                              className="text-blue-500 hover:text-blue-700 font-medium cursor-pointer"
                            >
                              Add Images
                            </label>
                            <input
                              id="add-images-input"
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              onChange={(e) => handleAddMultipleImages(Array.from(e.target.files))}
                              disabled={actionLoading}
                            />
                          </p>
                        )}
                      </div>
                    </div>
                  );
                }
                
                // Handle empty or invalid images array
                if (!Array.isArray(request.maintenance_request_images)) {
                  console.error('Maintenance request images is not an array:', request.maintenance_request_images);
                  return <div className="bg-red-100 p-4 rounded-md mb-6">Error: Could not process maintenance request images</div>;
                }
                
                // Process the organized images
                const organizedImages = organizeImagesByStage(request.maintenance_request_images);
                console.log('Organized images result:', organizedImages);
                
                return (
                  <div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden">
                    <div className="px-6 py-4 border-b">
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="text-lg font-medium">Maintenance Request Images</h3>
                          <p className="text-sm text-gray-500 mt-1">
                            All images ({request.maintenance_request_images.length}) uploaded during the maintenance process
                          </p>
                        </div>
                        {canPerformActions() && (
                          <div>
                            <label
                              htmlFor="add-more-images-input"
                              className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-sm font-medium cursor-pointer inline-flex items-center"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              Add More Images
                            </label>
                            <input
                              id="add-more-images-input"
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              onChange={(e) => handleAddMultipleImages(Array.from(e.target.files))}
                              disabled={actionLoading}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="px-6 py-4">
                      {organizedImages.length > 0 ? (
                        organizedImages.map((stage, stageIndex) => (
                          <div key={stage.stage} className={`${stageIndex > 0 ? 'mt-8' : ''}`}>
                            <div className="flex items-center mb-3">
                              <div className={`w-3 h-3 rounded-full mr-2 ${
                                stage.stage === 'initial' ? 'bg-blue-500' :
                                stage.stage === 'progress' ? 'bg-yellow-500' :
                                stage.stage === 'completion' ? 'bg-green-500' : 'bg-gray-500'
                              }`}></div>
                              <h4 className="text-md font-medium">{stage.label} ({stage.images.length})</h4>
                            </div>
                            
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                              {stage.images.map((image, imageIndex) => (
                                <div key={`${stage.stage}-${imageIndex}`} className="relative group">
                                  <div className="aspect-square overflow-hidden rounded-lg border border-gray-200">
                                    <img
                                      src={image.image_url}
                                      alt={`${stage.label} ${imageIndex + 1}`}
                                      className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                      onClick={() => {
                                        console.log('Image clicked:', image);
                                        setSelectedImage(image.image_url);
                                        setShowImageModal(true);
                                      }}
                                      onError={(e) => {
                                        console.error('Error loading image:', image.image_url);
                                        e.target.src = 'https://via.placeholder.com/150?text=Image+Error';
                                        e.target.alt = 'Failed to load image';
                                      }}
                                    />
                                  </div>
                                  <div className="mt-1">
                                    <p className="text-xs text-gray-500 truncate">
                                      {image.uploaded_at ? formatDate(image.uploaded_at, true) : 'No date'}
                                    </p>
                                    {image.description && (
                                      <p className="text-xs text-gray-400 truncate">{image.description}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-6 text-gray-500">
                          <p>No images could be organized by stage.</p>
                          <p className="mt-2 text-sm">Raw image count: {request.maintenance_request_images.length}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
              
              {/* Completion Notes */}
              {request.status === MAINTENANCE_STATUS.COMPLETED && request.notes && (
                <div className="mb-6">
                  <h3 className="text-md font-medium mb-2">Completion Notes</h3>
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    {(() => {
                      try {
                        // Try to parse the notes as JSON
                        const notesData = JSON.parse(request.notes);
                        
                        if (Array.isArray(notesData)) {
                          return notesData.map((note, index) => (
                            <div key={index} className="mb-3 last:mb-0">
                              <div className="flex items-start">
                                <div className={`p-3 rounded-lg ${note.role === 'admin' || note.isAdminMessage ? 'bg-blue-100' : 'bg-white border border-gray-200'} flex-grow`}>
                                  <div className="flex justify-between mb-1">
                                    <span className="font-semibold text-sm">{note.name || 'System'}</span>
                                    <span className="text-xs text-gray-500">{formatDate(note.createdat)}</span>
                                  </div>
                                  <p className="text-gray-700 whitespace-pre-wrap">{note.content}</p>
                                </div>
                              </div>
                            </div>
                          ));
                        } else if (typeof notesData === 'object') {
                          // Handle single object
                          return (
                            <div className="mb-3">
                              <div className="flex items-start">
                                <div className={`p-3 rounded-lg ${notesData.role === 'admin' || notesData.isAdminMessage ? 'bg-blue-100' : 'bg-white border border-gray-200'} flex-grow`}>
                                  <div className="flex justify-between mb-1">
                                    <span className="font-semibold text-sm">{notesData.name || 'System'}</span>
                                    <span className="text-xs text-gray-500">{formatDate(notesData.createdat)}</span>
                                  </div>
                                  <p className="text-gray-700 whitespace-pre-wrap">{notesData.content}</p>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        
                        // Fallback to plain text if JSON parsing didn't yield expected results
                        return <p className="text-gray-700 whitespace-pre-wrap">{request.notes}</p>;
                      } catch (e) {
                        // If it's not valid JSON, display as plain text
                        return <p className="text-gray-700 whitespace-pre-wrap">{request.notes}</p>;
                      }
                    })()}
                  </div>
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
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full">
            <h2 className="text-xl font-semibold mb-4">Complete Maintenance Request</h2>
            <p className="mb-4">Please provide details about the completion of this maintenance request.</p>
            
            <div className="mb-4">
              <label htmlFor="completionNotes" className="block text-sm font-medium text-gray-700 mb-1">
                Completion Notes <span className="text-red-500">*</span>
              </label>
              <textarea
                id="completionNotes"
                rows="4"
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Describe the work that was completed"
                required
              ></textarea>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Completion Images
              </label>
              <MaintenanceImageUpload
                onImagesChange={setCompletionImages}
                maxImages={8}
                initialImages={completionImages}
                imageType="completion"
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
      
      {/* Image Modal */}
      {showImageModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={() => setShowImageModal(false)}
        >
          <div className="max-w-4xl max-h-screen p-2" onClick={e => e.stopPropagation()}>
            <button 
              className="absolute top-4 right-4 bg-white rounded-full p-2 shadow-lg z-10"
              onClick={() => setShowImageModal(false)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img 
              src={selectedImage} 
              alt="Full size preview" 
              className="max-w-full max-h-screen object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default MaintenanceDetails; 