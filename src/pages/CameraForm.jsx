import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchData, insertData, updateData } from '../services/supabaseClient';

// UI Components
import FormInput from '../components/ui/FormInput';
import FormTextarea from '../components/ui/FormTextarea';
import FormSelect from '../components/ui/FormSelect';

const CameraForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = !!id;
  
  // Form state
  const [formData, setFormData] = useState({
    propertyid: '',
    locationdescription: '',
    cameratype: '',
    installationdetails: '',
    datapackageinfo: {
      phoneNumber: '',
      planDetails: '',
      renewalDate: null
    },
    status: 'active'
  });
  
  // UI state
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  
  // Camera type options
  const cameraTypeOptions = [
    { value: 'IP Camera', label: 'IP Camera' },
    { value: 'Wireless Camera', label: 'Wireless Camera' },
    { value: 'CCTV', label: 'CCTV' },
    { value: 'Smart Camera', label: 'Smart Camera' },
    { value: 'Other', label: 'Other' }
  ];
  
  // Status options
  const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'maintenance', label: 'Maintenance' }
  ];
  
  // Fetch properties and camera data if in edit mode
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        
        // Fetch properties
        const { data: propertiesData, error: propertiesError } = await fetchData('properties');
        
        if (propertiesError) {
          throw propertiesError;
        }
        
        setProperties(propertiesData || []);
        
        // If in edit mode, fetch camera data
        if (isEditMode) {
          const { data: cameraData, error: cameraError } = await fetchData('cameras', {
            filters: [{ column: 'id', operator: 'eq', value: id }]
          });
          
          if (cameraError) {
            throw cameraError;
          }
          
          if (cameraData && cameraData.length > 0) {
            const camera = cameraData[0];
            
            // Format the data for the form
            setFormData({
              propertyid: camera.propertyid || '',
              locationdescription: camera.locationdescription || '',
              cameratype: camera.cameratype || '',
              installationdetails: camera.installationdetails || '',
              datapackageinfo: {
                phoneNumber: camera.datapackageinfo?.phoneNumber || '',
                planDetails: camera.datapackageinfo?.planDetails || '',
                renewalDate: camera.datapackageinfo?.renewalDate || null
              },
              status: camera.status || 'active'
            });
          } else {
            // Camera not found
            setError('Camera not found');
          }
        }
      } catch (error) {
        console.error('Error fetching initial data:', error.message);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchInitialData();
  }, [id, isEditMode]);
  
  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Handle data package info changes
  const handleDataPackageChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      datapackageinfo: {
        ...prev.datapackageinfo,
        [name]: value
      }
    }));
  };
  
  // Handle renewal date change
  const handleRenewalDateChange = (e) => {
    setFormData(prev => ({
      ...prev,
      datapackageinfo: {
        ...prev.datapackageinfo,
        renewalDate: e.target.value
      }
    }));
  };
  
  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setSubmitting(true);
      setError(null);
      
      // Validate form data
      if (!formData.propertyid) {
        throw new Error('Please select a property');
      }
      
      if (!formData.locationdescription) {
        throw new Error('Please provide a location description');
      }
      
      if (!formData.cameratype) {
        throw new Error('Please select a camera type');
      }
      
      // Prepare data for submission
      const cameraData = {
        ...formData,
        updatedat: new Date().toISOString()
      };
      
      // If creating a new camera, add creation date
      if (!isEditMode) {
        cameraData.createdat = new Date().toISOString();
      }
      
      // Save to database
      let result;
      
      if (isEditMode) {
        result = await updateData('cameras', id, cameraData);
      } else {
        result = await insertData('cameras', cameraData);
      }
      
      if (result.error) {
        throw result.error;
      }
      
      // Navigate back to camera list
      navigate('/dashboard/cameras');
      
    } catch (error) {
      console.error('Error saving camera:', error.message);
      setError(error.message);
    } finally {
      setSubmitting(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading camera data...</div>
      </div>
    );
  }
  
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">
        {isEditMode ? 'Edit Camera' : 'Add New Camera'}
      </h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Basic Information */}
          <div>
            <h2 className="text-lg font-medium mb-4">Basic Information</h2>
            
            <div className="mb-4">
              <label htmlFor="propertyid" className="block text-sm font-medium text-gray-700 mb-1">
                Property *
              </label>
              <select
                id="propertyid"
                name="propertyid"
                value={formData.propertyid}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">Select a property</option>
                {properties.map(property => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </div>
            
            <FormInput
              label="Location Description *"
              id="locationdescription"
              name="locationdescription"
              value={formData.locationdescription}
              onChange={handleInputChange}
              placeholder="e.g., Front entrance, Back yard"
              required
            />
            
            <div className="mb-4">
              <label htmlFor="cameratype" className="block text-sm font-medium text-gray-700 mb-1">
                Camera Type *
              </label>
              <select
                id="cameratype"
                name="cameratype"
                value={formData.cameratype}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">Select camera type</option>
                {cameraTypeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="mb-4">
              <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                {statusOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            
            <FormTextarea
              label="Installation Details"
              id="installationdetails"
              name="installationdetails"
              value={formData.installationdetails}
              onChange={handleInputChange}
              placeholder="Enter installation details, date, technician, etc."
              rows={4}
            />
          </div>
          
          {/* Data Package Information */}
          <div>
            <h2 className="text-lg font-medium mb-4">Data Package Information</h2>
            
            <FormInput
              label="Phone Number"
              id="phoneNumber"
              name="phoneNumber"
              value={formData.datapackageinfo.phoneNumber}
              onChange={handleDataPackageChange}
              placeholder="e.g., 0771234567"
            />
            
            <FormTextarea
              label="Plan Details"
              id="planDetails"
              name="planDetails"
              value={formData.datapackageinfo.planDetails}
              onChange={handleDataPackageChange}
              placeholder="Enter data plan details"
              rows={3}
            />
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Renewal Date
              </label>
              <input
                type="date"
                id="renewalDate"
                name="renewalDate"
                value={formData.datapackageinfo.renewalDate ? new Date(formData.datapackageinfo.renewalDate).toISOString().split('T')[0] : ''}
                onChange={handleRenewalDateChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
        
        <div className="mt-6 flex justify-end space-x-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard/cameras')}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
          >
            {submitting ? 'Saving...' : isEditMode ? 'Update Camera' : 'Add Camera'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CameraForm; 