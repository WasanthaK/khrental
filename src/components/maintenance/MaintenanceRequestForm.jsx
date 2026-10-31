import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listMaintenanceEligibleProperties } from '../../services/maintenanceLifecycleClient';
import { hasPermission, PERMISSIONS } from '../../utils/accessPolicy';
import { getMyTenancySummary } from '../../services/platformClient';
import { maintenancePropertiesFromTenancies } from '../../services/maintenancePropertyEligibility';
import { MAINTENANCE_STATUS, MAINTENANCE_PRIORITY, MAINTENANCE_TYPES } from '../../utils/constants';
import { toast } from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../hooks/useAuth';
import ImageUpload from '../common/ImageUpload';
import { createMaintenanceRequest } from '../../services/maintenanceService';

const MaintenanceRequestForm = ({ onSubmitSuccess, onCancel, isEditMode = false, initialData = null }) => {
  const navigate = useNavigate();
  const { user, activeTenantId, membership } = useAuth();
  const canManage = hasPermission({ user, membership }, PERMISSIONS.MAINTENANCE_MANAGE);

  // State
  const [formData, setFormData] = useState({
    propertyid: '',
    title: '',
    description: '',
    priority: MAINTENANCE_PRIORITY.MEDIUM,
    requesttype: MAINTENANCE_TYPES.OTHER,
    images: []
  });
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedImages, setSelectedImages] = useState([]);
  
  // Initialize form data if in edit mode
  useEffect(() => {
    if (isEditMode && initialData) {
      setFormData({
        propertyid: initialData.propertyid,
        title: initialData.title,
        description: initialData.description,
        priority: initialData.priority,
        requesttype: initialData.requesttype,
        images: initialData.images || []
      });
      setSelectedImages(initialData.images || []);
    }
  }, [isEditMode, initialData]);
  
  // The server supplies management scope or the renter's active tenancies.
  useEffect(() => {
    let cancelled = false;
    setProperties([]);
    setFormData(prev => ({ ...prev, propertyid: '' }));
    setError(null);
    setLoading(true);
    const load = async () => {
      try {
        const { data, error: tenancyError } = canManage
          ? await listMaintenanceEligibleProperties()
          : await getMyTenancySummary();
        if (tenancyError) throw tenancyError;
        const eligible = canManage ? data : maintenancePropertiesFromTenancies(data);
        if (!Array.isArray(eligible)) throw new Error('Invalid property response');
        if (cancelled) return;
        setProperties(eligible);
        setFormData(prev => ({ ...prev, propertyid: eligible.length === 1 ? eligible[0].id : '' }));
      } catch (error) {
        if (cancelled) return;
        setProperties([]);
        setError(canManage ? 'Unable to load properties you can manage. Please try again.' : 'Unable to verify active tenancy properties. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (user?.id && activeTenantId) load();
    else setLoading(false);
    return () => { cancelled = true; };
  }, [user?.id, activeTenantId, canManage]);

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Handle image changes
  const handleImagesChange = (imageUrls) => {
    setSelectedImages(imageUrls);
    setFormData(prev => ({
      ...prev,
      images: imageUrls
    }));
  };
  
  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Validate required fields
      if (!formData.propertyid || !properties.some(p => p.id === formData.propertyid)) {
        throw new Error(canManage ? 'Please select a property you can manage' : 'Please select an eligible active tenancy property');
      }

      if (!formData.title.trim()) {
        throw new Error('Please enter a title');
      }

      if (!formData.description.trim()) {
        throw new Error('Please enter a description');
      }

      if (!user) {
        throw new Error('User information not available');
      }


      // Create maintenance request using auth_id
      const requestData = {
        ...formData,
        images: selectedImages || [] // Ensure images is always an array
      };
      
      
      const result = await createMaintenanceRequest(requestData, user.id);

      if (result.error) {
        throw new Error(result.error);
      }

      toast.success('Maintenance request created successfully');
      onSubmitSuccess(result.data);
    } catch (error) {
      console.error('Error creating maintenance request:', error);
      // Only show the error message if it's not a duplicate
      if (!error.message.includes('duplicate')) {
        setError(error.message || 'Failed to create maintenance request');
        toast.error(error.message || 'Failed to create maintenance request');
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Request type options
  const requestTypes = [
    { value: MAINTENANCE_TYPES.AIR_CONDITIONING, label: 'Air Conditioning' },
    { value: MAINTENANCE_TYPES.PLUMBING, label: 'Plumbing' },
    { value: MAINTENANCE_TYPES.ELECTRICAL, label: 'Electrical' },
    { value: MAINTENANCE_TYPES.CLEANING, label: 'Cleaning' },
    { value: MAINTENANCE_TYPES.GARDENING, label: 'Gardening' },
    { value: MAINTENANCE_TYPES.PEST_CONTROL, label: 'Pest Control' },
    { value: MAINTENANCE_TYPES.EMERGENCY, label: 'Emergency' },
    { value: MAINTENANCE_TYPES.OTHER, label: 'Other' }
  ];
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }
  
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      )}
      
      <div>
        <label htmlFor="propertyid" className="block text-sm font-medium text-gray-700 mb-1">
          Property <span className="text-red-500">*</span>
        </label>
        {properties.length === 0 ? (
          <p className="text-sm text-gray-500">{canManage ? 'No properties available. Add a property or ask your administrator for property access.' : 'No active tenancy properties available. Contact your property manager.'}</p>
        ) : properties.length === 1 ? (
          <p className="text-sm font-medium">{properties[0].name}</p>
        ) : (
          <select
            id="propertyid"
            name="propertyid"
            value={formData.propertyid}
            onChange={handleInputChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            required
          >
            <option value="">Select a property</option>
            {properties.map(property => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="title"
          name="title"
          value={formData.title}
          onChange={handleInputChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          required
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
          Description <span className="text-red-500">*</span>
        </label>
        <textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={handleInputChange}
          rows={4}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          required
        />
      </div>

      <div>
        <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1">
          Priority <span className="text-red-500">*</span>
        </label>
        <select
          id="priority"
          name="priority"
          value={formData.priority}
          onChange={handleInputChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          required
        >
          <option value={MAINTENANCE_PRIORITY.LOW}>Low</option>
          <option value={MAINTENANCE_PRIORITY.MEDIUM}>Medium</option>
          <option value={MAINTENANCE_PRIORITY.HIGH}>High</option>
          <option value={MAINTENANCE_PRIORITY.URGENT}>Urgent</option>
        </select>
      </div>

      <div>
        <label htmlFor="requesttype" className="block text-sm font-medium text-gray-700 mb-1">
          Request Type <span className="text-red-500">*</span>
        </label>
        <select
          id="requesttype"
          name="requesttype"
          value={formData.requesttype}
          onChange={handleInputChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          required
        >
          {requestTypes.map(type => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Images
        </label>
        <ImageUpload
          onImagesChange={handleImagesChange}
          maxImages={5}
          initialImages={selectedImages}
          bucket="images"
          folder="maintenance"
        />
      </div>

      <div className="flex justify-end space-x-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting || loading || properties.length === 0 || Boolean(error)}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </form>
  );
};

export default MaintenanceRequestForm; 