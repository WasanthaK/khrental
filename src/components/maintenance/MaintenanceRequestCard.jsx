import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '../../utils/helpers';
import { MAINTENANCE_STATUS, MAINTENANCE_PRIORITY, MAINTENANCE_TYPES } from '../../utils/constants';
import { format } from 'date-fns';
import { supabase } from '../../services/supabaseClient';
import { toast } from 'react-hot-toast';
import { STORAGE_BUCKETS, BUCKET_FOLDERS } from '../../services/fileService';
import { useAuth } from '../../hooks/useAuth';
import { cancelMaintenanceRequest } from '../../services/maintenanceService';

const MaintenanceRequestCard = ({ request, onCancelRequest }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { userData } = useAuth();
  
  // Determine if this is a rentee view based on user role
  const isRenteeView = userData?.role === 'rentee';
  
  // Extract request details with proper null checks
  const { 
    id, 
    status, 
    priority, 
    requesttype,
    description, 
    createdat,
    title,
    property,
    rentee,
    assigned_staff,
    maintenance_request_images
  } = request;

  console.log('MaintenanceRequestCard received request:', request);
  console.log('Property data in card:', property);

  // Create a human-readable request ID
  const getHumanReadableId = () => {
    const date = new Date(createdat);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const type = requesttype?.substring(0, 3).toUpperCase() || 'GEN';
    const shortId = id.substring(0, 4);
    return `MR-${year}${month}-${type}-${shortId}`;
  };

  // Get images from maintenance_request_images
  const getImages = () => {
    if (Array.isArray(maintenance_request_images)) {
      return maintenance_request_images.map(img => img.image_url);
    }
    return [];
  };

  // Get status color
  const getStatusColor = () => {
    switch (status) {
      case MAINTENANCE_STATUS.PENDING:
        return 'bg-yellow-50 border-yellow-200';
      case MAINTENANCE_STATUS.IN_PROGRESS:
        return 'bg-blue-50 border-blue-200';
      case MAINTENANCE_STATUS.COMPLETED:
        return 'bg-green-50 border-green-200';
      case MAINTENANCE_STATUS.CANCELLED:
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-white border-gray-200';
    }
  };

  // Get priority color and icon
  const getPriorityInfo = () => {
    switch (priority) {
      case MAINTENANCE_PRIORITY.HIGH:
        return {
          color: 'text-red-600 bg-red-100',
          icon: '🔴'
        };
      case MAINTENANCE_PRIORITY.MEDIUM:
        return {
          color: 'text-yellow-600 bg-yellow-100',
          icon: '🟡'
        };
      case MAINTENANCE_PRIORITY.LOW:
        return {
          color: 'text-green-600 bg-green-100',
          icon: '🟢'
        };
      default:
        return {
          color: 'text-gray-600 bg-gray-100',
          icon: '⚪'
        };
    }
  };

  // Get request type label
  const getRequestTypeLabel = (type) => {
    switch (type) {
      case MAINTENANCE_TYPES.AIR_CONDITIONING:
        return '❄️ Air Conditioning';
      case MAINTENANCE_TYPES.PLUMBING:
        return '🚰 Plumbing';
      case MAINTENANCE_TYPES.ELECTRICAL:
        return '⚡ Electrical';
      case MAINTENANCE_TYPES.CLEANING:
        return '🧹 Cleaning';
      case MAINTENANCE_TYPES.GARDENING:
        return '🌿 Gardening';
      case MAINTENANCE_TYPES.PEST_CONTROL:
        return '🐜 Pest Control';
      case MAINTENANCE_TYPES.EMERGENCY:
        return '🚨 Emergency';
      case MAINTENANCE_TYPES.OTHER:
        return '📋 Other';
      default:
        return type || 'Unknown';
    }
  };

  // Handle cancel request
  const handleCancel = async () => {
    if (isSubmitting) return;
    
    try {
      setIsSubmitting(true);
      
      const result = await cancelMaintenanceRequest(id, 'Cancelled by user');
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to cancel request');
      }
      
      toast.success('Request cancelled successfully');
      if (onCancelRequest) {
        onCancelRequest(id);
      }
    } catch (error) {
      console.error('Error cancelling request:', error);
      toast.error('Failed to cancel request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const priorityInfo = getPriorityInfo();

  // Get image URL from storage or return direct URL
  const getImageUrl = (path) => {
    if (!path) return null;
    
    // If the path is already a full URL, return it
    if (path.startsWith('http')) {
      return path;
    }
    
    // Otherwise, get the URL from storage
    try {
      const { data } = supabase.storage.from('maintenance').getPublicUrl(path);
      return data.publicUrl;
    } catch (error) {
      console.error('Error getting image URL:', error);
      return null;
    }
  };

  return (
    <div className={`border rounded-lg shadow-sm ${getStatusColor()} transition-all hover:shadow-md`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white bg-opacity-50">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-xs font-medium text-gray-500">{getHumanReadableId()}</span>
            <h3 className="text-lg font-semibold mt-1">{title}</h3>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${priorityInfo.color}`}>
              {priorityInfo.icon} {priority}
            </span>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor()}`}>
              {status}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-sm text-gray-600">Property</p>
            <p className="font-medium">{property?.name || 'Unknown property'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Type</p>
            <p className="font-medium">{getRequestTypeLabel(requesttype)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Reported by</p>
            <p className="font-medium">{rentee?.name || 'Unknown rentee'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Assigned to</p>
            <p className="font-medium">{assigned_staff?.name || 'Unassigned'}</p>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-4">{description}</p>

        {maintenance_request_images?.length > 0 && (
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-2">Images ({maintenance_request_images.length})</p>
            <div className="grid grid-cols-4 gap-2">
              {maintenance_request_images.slice(0, 4).map((image, index) => (
                <div key={index} className="relative aspect-square">
                  <img
                    src={image.image_url}
                    alt={`Request image ${index + 1}`}
                    className="absolute inset-0 w-full h-full object-cover rounded-lg shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
                  />
                </div>
              ))}
              {maintenance_request_images.length > 4 && (
                <div className="relative aspect-square bg-gray-100 rounded-lg flex items-center justify-center">
                  <span className="text-lg font-medium text-gray-600">+{maintenance_request_images.length - 4}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mt-4">
          <span className="text-sm text-gray-500">
            Created {formatDate(createdat)}
          </span>
          <div className="flex space-x-2">
            {status !== MAINTENANCE_STATUS.CANCELLED && status !== MAINTENANCE_STATUS.COMPLETED && (
              <button
                onClick={handleCancel}
                disabled={isSubmitting}
                className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Cancelling...' : 'Cancel'}
              </button>
            )}
            <Link
              to={isRenteeView ? `/rentee/maintenance/${id}` : `/dashboard/maintenance/${id}`}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              View Details
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MaintenanceRequestCard; 