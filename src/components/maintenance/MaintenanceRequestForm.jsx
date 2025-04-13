import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { MAINTENANCE_STATUS, MAINTENANCE_PRIORITY, MAINTENANCE_TYPES } from '../../utils/constants';
import { toast } from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../hooks/useAuth';
import ImageUpload from '../common/ImageUpload';
import { createMaintenanceRequest } from '../../services/maintenanceService';

const MaintenanceRequestForm = ({ onSubmitSuccess, onCancel, isEditMode = false, initialData = null }) => {
  const navigate = useNavigate();
  const { user, userData } = useAuth();
  
  // Add logging for userData
  useEffect(() => {
    console.log('MaintenanceRequestForm - userData:', userData);
  }, [userData]);
  
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
  
  // Fetch properties based on user role
  useEffect(() => {
    const fetchProperties = async () => {
      try {
        setLoading(true);
        let query = supabase.from('properties').select('*');
        
        // If user is a rentee, only fetch their associated properties
        if (userData?.role === 'rentee') {
          const { data: userData2, error: userError } = await supabase
            .from('app_users')
            .select('associated_property_ids')
            .eq('id', userData.profileId || userData.id)
            .single();

          if (userError) {
            throw userError;
          }
          
          if (userData2?.associated_property_ids?.length > 0) {
            query = query.in('id', userData2.associated_property_ids);
          } else {
            setProperties([]);
          }
        }
        
        const { data, error } = await query;
        if (error) {
          throw error;
        }
        
        setProperties(data || []);
        
        // Pre-select property if there's only one
        if (data?.length === 1) {
          setFormData(prev => ({
            ...prev,
            propertyid: data[0].id
          }));
        }
      } catch (error) {
        console.error('Error fetching properties:', error);
        setError('Failed to load properties');
      } finally {
        setLoading(false);
      }
    };
    
    if (userData) {
      fetchProperties();
    }
  }, [userData]);
  
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
    console.log('Images changed:', imageUrls);
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
      if (!formData.propertyid) {
        throw new Error('Please select a property');
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

      console.log('Submitting form data:', formData);
      console.log('Current auth user:', user);
      console.log('Current user data:', userData);

      // Create maintenance request using auth_id
      const requestData = {
        ...formData,
        images: selectedImages || [] // Ensure images is always an array
      };
      
      console.log('Final request data being sent:', requestData);
      
      const result = await createMaintenanceRequest(requestData, user.id);

      if (result.error) {
        throw new Error(result.error);
      }

      console.log('Maintenance request created successfully:', result);
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
          <p className="text-sm text-gray-500">No properties available.</p>
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
          disabled={isSubmitting}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </form>
  );
};

export default MaintenanceRequestForm; 