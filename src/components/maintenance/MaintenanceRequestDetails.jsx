import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  getMaintenanceRequest,
  updateMaintenanceRequest,
  assignMaintenanceRequest,
  startMaintenanceWork,
  completeMaintenanceRequest,
  cancelMaintenanceRequest,
  addMaintenanceRequestImage,
  addMaintenanceRequestComment
} from '../../services/maintenanceService';
import { MaintenanceStatus, MaintenanceImageType } from '../../utils/constants';
import { formatDate } from '../../utils/helpers';
import { toast } from 'react-hot-toast';
import ImageUpload from '../common/ImageUpload';
import CommentSection from '../maintenance/CommentSection';

const MaintenanceRequestDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userData } = useAuth();
  
  // State
  const [request, setRequest] = useState(null);
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
  
  // Fetch request details
  useEffect(() => {
    const fetchRequest = async () => {
      try {
        setLoading(true);
        const data = await getMaintenanceRequest(id);
        setRequest(data);
      } catch (error) {
        console.error('Error fetching maintenance request:', error);
        setError('Failed to load maintenance request details');
        toast.error('Failed to load maintenance request details');
      } finally {
        setLoading(false);
      }
    };
    
    fetchRequest();
  }, [id]);
  
  // Check if user can perform actions
  const canPerformActions = () => {
    if (!request || !userData) return false;
    
    // Admin can do everything
    if (userData.role === 'admin') return true;
    
    // Staff can perform actions on assigned requests
    if (userData.role === 'staff') {
      return request.assignedto === userData.id;
    }
    
    // Rentees can only view their own requests
    return request.renteeid === userData.id;
  };
  
  // Handle assign staff
  const handleAssignStaff = async (staffId) => {
    try {
      setActionLoading(true);
      const updatedRequest = await assignMaintenanceRequest(request.id, staffId);
      setRequest(updatedRequest);
      toast.success('Staff assigned successfully');
    } catch (error) {
      console.error('Error assigning staff:', error);
      toast.error('Failed to assign staff');
    } finally {
      setActionLoading(false);
    }
  };
  
  // Handle start work
  const handleStartWork = async () => {
    try {
      setActionLoading(true);
      const updatedRequest = await startMaintenanceWork(request.id);
      setRequest(updatedRequest);
      toast.success('Work started successfully');
    } catch (error) {
      console.error('Error starting work:', error);
      toast.error('Failed to start work');
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
      const updatedRequest = await completeMaintenanceRequest(
        request.id,
        completionNotes,
        completionImages
      );
      setRequest(updatedRequest);
      setShowCompleteDialog(false);
      toast.success('Maintenance request completed successfully');
    } catch (error) {
      console.error('Error completing request:', error);
      toast.error('Failed to complete request');
    } finally {
      setActionLoading(false);
    }
  };
  
  // Handle cancel request
  const handleCancelRequest = async () => {
    if (!cancellationReason.trim()) {
      toast.error('Please provide a reason for cancellation');
      return;
    }
    
    try {
      setActionLoading(true);
      const updatedRequest = await cancelMaintenanceRequest(
        request.id,
        cancellationReason
      );
      setRequest(updatedRequest);
      setShowCancelDialog(false);
      toast.success('Maintenance request cancelled successfully');
    } catch (error) {
      console.error('Error cancelling request:', error);
      toast.error('Failed to cancel request');
    } finally {
      setActionLoading(false);
    }
  };
  
  // Handle add image
  const handleAddImage = async (files, type) => {
    try {
      setActionLoading(true);
      for (const file of files) {
        await addMaintenanceRequestImage({
          maintenance_request_id: request.id,
          image: file,
          image_type: type
        });
      }
      
      // Refresh request data
      const updatedRequest = await getMaintenanceRequest(request.id);
      setRequest(updatedRequest);
      toast.success('Images added successfully');
    } catch (error) {
      console.error('Error adding images:', error);
      toast.error('Failed to add images');
    } finally {
      setActionLoading(false);
    }
  };
  
  // Handle add comment
  const handleAddComment = async (comment) => {
    try {
      setActionLoading(true);
      await addMaintenanceRequestComment({
        maintenance_request_id: request.id,
        comment
      });
      
      // Refresh request data
      const updatedRequest = await getMaintenanceRequest(request.id);
      setRequest(updatedRequest);
      toast.success('Comment added successfully');
    } catch (error) {
      console.error('Error adding comment:', error);
      toast.error('Failed to add comment');
    } finally {
      setActionLoading(false);
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
        </div>
      </div>
      
      {/* Main Content */}
      <div className="bg-white rounded-lg shadow-md p-6">
        {/* Request Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <h2 className="text-lg font-medium mb-2">{request.title}</h2>
            <p className="text-gray-600 mb-4">{request.description}</p>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Property</p>
                <p className="font-medium">{request.property?.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Reported by</p>
                <p className="font-medium">{request.rentee?.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Priority</p>
                <p className="font-medium">{request.priority}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <p className="font-medium">{request.status}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Created</p>
                <p className="font-medium">{formatDate(request.createdat)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Last Updated</p>
                <p className="font-medium">{formatDate(request.updatedat)}</p>
              </div>
            </div>
          </div>
          
          {/* Actions */}
          <div className="space-y-4">
            {canPerformActions() && (
              <>
                {request.status === MaintenanceStatus.PENDING && (
                  <button
                    onClick={() => handleAssignStaff(userData.id)}
                    disabled={actionLoading}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    Assign to Me
                  </button>
                )}
                
                {request.status === MaintenanceStatus.ASSIGNED && (
                  <button
                    onClick={handleStartWork}
                    disabled={actionLoading}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    Start Work
                  </button>
                )}
                
                {request.status === MaintenanceStatus.IN_PROGRESS && (
                  <button
                    onClick={() => setShowCompleteDialog(true)}
                    disabled={actionLoading}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    Complete Request
                  </button>
                )}
                
                {request.status !== MaintenanceStatus.COMPLETED && 
                 request.status !== MaintenanceStatus.CANCELLED && (
                  <button
                    onClick={() => setShowCancelDialog(true)}
                    disabled={actionLoading}
                    className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                  >
                    Cancel Request
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        
        {/* Images */}
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-4">Images</h3>
          <ImageUpload
            selectedImages={[]}
            onChange={(files) => handleAddImage(files, MaintenanceImageType.GENERAL)}
            maxImages={5}
            disabled={!canPerformActions()}
          />
        </div>
        
        {/* Comments */}
        <div>
          <h3 className="text-lg font-medium mb-4">Comments</h3>
          <CommentSection
            comments={request.comments || []}
            onAddComment={handleAddComment}
            disabled={!canPerformActions()}
          />
        </div>
      </div>
    </div>
  );
};

export default MaintenanceRequestDetails; 