import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { saveFile, deleteFile, STORAGE_BUCKETS, BUCKET_FOLDERS } from '../services/fileService';
import { createAppUser, updateAppUser, inviteAppUser, fetchAppUser, storeStructuredAssociations, getStructuredAssociations } from '../services/appUserService';
import { formatDate } from '../utils/helpers';
import { USER_ROLES } from '../utils/constants';
import { toast } from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import { sendInvitation } from '../services/invitation';
import { createAppUser as createRenteeUser } from '../services/createAppUser';

// UI Components
import FormInput from '../components/ui/FormInput';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import PropertySelector from '../components/properties/PropertySelector';
import ImageUpload from '../components/common/ImageUpload';

const RenteeForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = !!id;
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    contactDetails: {
      email: '',
      phone: '',
      alternatePhone: '',
      emergencyContact: ''
    },
    associatedPropertyIds: [],
    national_id: '',
    permanent_address: '',
    structuredAssociations: []
  });
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [idCopy, setIdCopy] = useState(null);
  const [existingIdCopy, setExistingIdCopy] = useState(null);
  const [properties, setProperties] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [propertyUnits, setPropertyUnits] = useState([]);
  const [sendRealEmail, setSendRealEmail] = useState(false);
  
  // Fetch rentee data if in edit mode and available properties
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        
        // Fetch available properties
        const { data: propertiesData, error: propertiesError } = await supabase
          .from('properties')
          .select('*');
        
        if (propertiesError) {
          throw propertiesError;
        }
        
        // Format properties for display
        const formattedProperties = propertiesData?.map(property => ({
          id: property.id,
          name: property.name || property.address || 'Unnamed Property',
          propertytype: property.propertytype
        })) || [];
        
        setProperties(formattedProperties);
        
        // If in edit mode, fetch rentee data from app_users table
        if (isEditMode) {
          const renteeData = await fetchAppUser(id);
          
          // Get structured associations from storage
          const structuredAssociations = getStructuredAssociations(id);
          
          setFormData({
            name: renteeData.name || '',
            contactDetails: {
              email: renteeData.email || '',
              phone: renteeData.contact_details?.phone || '',
              address: renteeData.contact_details?.address || ''
            },
            associatedPropertyIds: renteeData.associated_property_ids || [],
            idCopy: renteeData.id_copy_url || null,
            idCopyFile: null,
            structuredAssociations: structuredAssociations.length > 0 ? structuredAssociations : [],
            national_id: renteeData.national_id || '',
            permanent_address: renteeData.permanent_address || '',
          });
          
          if (renteeData.id_copy_url) {
            setExistingIdCopy(renteeData.id_copy_url);
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
  
  // Fetch units for selected property
  useEffect(() => {
    if (selectedProperty) {
      fetchPropertyUnits(selectedProperty);
    } else {
      setPropertyUnits([]);
      setSelectedUnit('');
    }
  }, [selectedProperty]);
  
  // Handle form input change
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };
  
  // Handle contact details changes
  const handleContactChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      contactDetails: {
        ...prev.contactDetails,
        [name]: value,
      },
    }));
  };
  
  // Handle ID copy upload
  const handleIdCopyUpload = async (file) => {
    const fileName = `${uuidv4()}-${file.name}`;
    const filePath = `${STORAGE_BUCKETS.IMAGES}/id-copies/${fileName}`;
    
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.IMAGES.split('/')[0])
      .upload(`id-copies/${fileName}`, file);
    
    if (error) {
      throw error;
    }
    
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKETS.IMAGES.split('/')[0])
      .getPublicUrl(`id-copies/${fileName}`);
    
    return urlData.publicUrl;
  };
  
  // Handle ID copy preview
  const handleIdCopyChange = async (file) => {
    try {
      setIdCopy(file);
      
      // If it's a new file, show preview
      if (file instanceof File) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setExistingIdCopy(reader.result);
        };
        reader.readAsDataURL(file);
      }
    } catch (error) {
      console.error('Error handling ID copy:', error);
      toast.error('Failed to process ID copy');
    }
  };
  
  // Handle ID copy removal
  const handleRemoveIdCopy = async () => {
    try {
      if (existingIdCopy) {
        const fileName = existingIdCopy.split('/').pop();
        await supabase.storage
          .from(STORAGE_BUCKETS.IMAGES.split('/')[0])
          .remove([`id-copies/${fileName}`]);
        
        setExistingIdCopy(null);
        
        if (isEditMode) {
          await supabase
            .from('app_users')
            .update({ id_copy_url: null })
            .eq('id', id);
        }
      }
      
      setIdCopy(null);
    } catch (error) {
      console.error('Error removing ID copy:', error);
      toast.error('Failed to remove ID copy');
    }
  };
  
  // Handle property selection
  const handlePropertyChange = (e) => {
    setSelectedProperty(e.target.value);
    setSelectedUnit(''); // Reset unit selection when property changes
  };
  
  // Handle unit selection
  const handleUnitChange = (e) => {
    setSelectedUnit(e.target.value);
  };
  
  // Check if property is an apartment
  const isSelectedPropertyApartment = () => {
    if (!selectedProperty) {
      return false;
    }
    const property = properties.find(p => p.id === selectedProperty);
    return property?.propertytype === 'apartment';
  };
  
  // Add selected property to associated properties
  const handleAddProperty = () => {
    // Skip if no property selected or if already associated
    if (!selectedProperty) {
      return;
    }
    
    // Check if this property-unit combination already exists
    const alreadyExists = formData.structuredAssociations.some(
      assoc => assoc.propertyId === selectedProperty && 
              (!isSelectedPropertyApartment() || assoc.unitId === selectedUnit)
    );
    
    if (alreadyExists) {
      toast.error('This property or unit is already associated with this rentee');
      return;
    }
    
    // For apartments, require unit selection
    if (isSelectedPropertyApartment() && !selectedUnit) {
      toast.error('Please select a unit for this apartment property');
      return;
    }
    
    // Add to legacy array (for backward compatibility)
    if (!formData.associatedPropertyIds.includes(selectedProperty)) {
      setFormData(prev => ({
        ...prev,
        associatedPropertyIds: [...prev.associatedPropertyIds, selectedProperty]
      }));
    }
    
    // Add to structured associations
    setFormData(prev => ({
      ...prev,
      structuredAssociations: [...prev.structuredAssociations, {
        propertyId: selectedProperty,
        unitId: isSelectedPropertyApartment() ? selectedUnit : null
      }]
    }));
    
    // Reset selections
    setSelectedProperty('');
    setSelectedUnit('');
  };
  
  // Remove property from associated properties
  const handleRemoveProperty = (index) => {
    const association = formData.structuredAssociations[index];
    
    // Update structured associations
    setFormData(prev => ({
      ...prev,
      structuredAssociations: prev.structuredAssociations.filter((_, i) => i !== index)
    }));
    
    // Check if this property is no longer associated in any unit
    // If so, also remove from legacy array
    const stillAssociated = formData.structuredAssociations.some(
      (assoc, i) => i !== index && assoc.propertyId === association.propertyId
    );
    
    if (!stillAssociated) {
      setFormData(prev => ({
        ...prev,
        associatedPropertyIds: prev.associatedPropertyIds.filter(id => id !== association.propertyId)
      }));
    }
  };
  
  // Fetch units for a property
  const fetchPropertyUnits = async (propertyId) => {
    try {
      const { data, error } = await supabase
        .from('property_units')
        .select('*')
        .eq('propertyid', propertyId)
        .order('unitnumber');
      
      if (error) {
        throw error;
      }
      setPropertyUnits(data || []);
    } catch (error) {
      console.error('Error fetching property units:', error);
      setPropertyUnits([]);
    }
  };
  
  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);
      
      // Validate required fields
      if (!formData.name) {
        throw new Error('Name is required');
      }
      if (!formData.contactDetails.email) {
        throw new Error('Email is required');
      }
      
      // Process form data
      const processedFormData = { ...formData };
      
      // Upload ID copy if provided
      let idCopyUrl = isEditMode ? existingIdCopy : null;
      if (idCopy instanceof File) {
        try {
          console.log('Uploading new ID copy...');
          idCopyUrl = await handleIdCopyUpload(idCopy);
          console.log('ID copy uploaded, URL:', idCopyUrl);
        } catch (error) {
          console.error('Error uploading ID copy:', error);
          throw new Error('Failed to upload ID copy: ' + error.message);
        }
      }
      
      // Prepare data for app_users table
      const appUserData = {
        name: processedFormData.name,
        email: processedFormData.contactDetails.email,
        role: 'rentee',
        user_type: 'rentee',
        contact_details: processedFormData.contactDetails,
        id_copy_url: idCopyUrl || null,
        associated_property_ids: Array.isArray(processedFormData.associatedPropertyIds) ? processedFormData.associatedPropertyIds : [],
        invited: false,
        national_id: processedFormData.national_id,
        permanent_address: processedFormData.permanent_address,
      };
      
      // Save to app_users table
      let result;
      if (isEditMode) {
        result = await updateAppUser(id, appUserData);
      } else {
        result = await createRenteeUser(appUserData, 'rentee');
      }
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to save rentee');
      }
      
      // Get the user ID from the result data
      const userId = isEditMode ? id : (result.data ? result.data.id : null);
      
      // Store structured associations separately
      if (userId) {
        const structuredAssociations = Array.isArray(processedFormData.structuredAssociations) 
          ? processedFormData.structuredAssociations 
          : [];
        
        storeStructuredAssociations(userId, structuredAssociations);
      }
      
      // Don't automatically send invitation - just show success message
      setSuccess(`Rentee ${isEditMode ? 'updated' : 'created'} successfully!`);
      
      // Navigate back to rentee list after a short delay
      setTimeout(() => {
        navigate('/dashboard/rentees');
      }, 1500);
      
    } catch (error) {
      console.error('Error saving rentee:', error.message);
      setError(error.message);
    } finally {
      setSubmitting(false);
    }
  };
  
  // Replace the handleSendInvitation function with a new implementation
  const handleSendInvitation = async () => {
    try {
      if (!formData.contactDetails.email) {
        toast.error('Email is required to send an invitation');
        return;
      }

      // For newly created users, we need to look up the user ID by email
      let userIdToUse = id; // For edit mode, use the existing ID
      
      if (!userIdToUse) {
        // If we're in create mode and just created a user, we need to find their ID
        const { data: foundUser, error } = await supabase
          .from('app_users')
          .select('id')
          .eq('email', formData.contactDetails.email.toLowerCase())
          .single();
          
        if (error || !foundUser) {
          toast.error('Could not find user record. Please try again.');
          console.error('Error finding user by email:', error);
          return;
        }
        
        userIdToUse = foundUser.id;
      }
      
      if (!userIdToUse) {
        toast.error('User ID not available. Please try again.');
        return;
      }

      // Using the new dedicated renteeInvitation service that directly uses supabase.auth.admin
      console.log(`Sending direct invitation to ${formData.name} (${formData.contactDetails.email}) with ID ${userIdToUse}`);
      
      const inviteResult = await sendInvitation(
        {
          id: userIdToUse,
          email: formData.contactDetails.email,
          name: formData.name,
          role: 'rentee'
        },
        !sendRealEmail // Only force simulation if sendRealEmail is false
      );

      console.log('Direct invitation result:', inviteResult);

      if (inviteResult.success) {
        toast.success(`${sendRealEmail ? 'Real' : 'Simulated'} invitation sent successfully!`);
        // Force refresh the user status 
        setTimeout(() => window.location.reload(), 1500);
      } else {
        toast.error(`Failed to send invitation: ${inviteResult.error}`);
        console.error('Invitation error details:', inviteResult);
      }
    } catch (error) {
      console.error('Error sending invitation:', error);
      toast.error(`Failed to send invitation: ${error.message}`);
    }
  };
  
  // Helper to get property name
  const getPropertyName = (propertyId) => {
    const property = properties.find(p => p.id === propertyId);
    return property ? property.name : propertyId;
  };
  
  // Helper to get unit number
  const getUnitNumber = (unitId) => {
    if (!unitId) {
      return null;
    }
    
    for (const property of properties) {
      if (property.propertytype !== 'apartment') {
        continue;
      }
      
      const units = propertyUnits.filter(u => u.propertyid === property.id);
      const unit = units.find(u => u.id === unitId);
      if (unit) {
        return unit.unitnumber;
      }
    }
    
    return unitId;
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading rentee data...</div>
      </div>
    );
  }
  
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">
        {isEditMode ? 'Edit Rentee' : 'Add New Rentee'}
      </h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline ml-2">{error}</span>
        </div>
      )}
      
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-6" role="alert">
          <strong className="font-bold">Success!</strong>
          <span className="block sm:inline ml-2">{success}</span>
          
          {/* Show invitation option after success */}
          <div className="mt-4 pt-4 border-t border-green-300">
            <strong className="font-bold">Next step:</strong>
            <span className="block sm:inline ml-2">Send an invitation to allow this rentee to set up their account.</span>
            
            <div className="flex items-center mt-2 mb-3">
              <input
                id="send-real-email"
                type="checkbox"
                checked={sendRealEmail}
                onChange={(e) => setSendRealEmail(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="send-real-email" className="ml-2 text-sm text-gray-700">
                Send Real Email
              </label>
            </div>
            
            <button
              type="button"
              onClick={handleSendInvitation}
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              {sendRealEmail ? 'Send Real Invitation' : 'Send Invitation (Simulated)'}
            </button>
          </div>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Basic Information */}
          <div>
            <h2 className="text-lg font-medium mb-4">Basic Information</h2>
            
            <FormInput
              label="Full Name"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="e.g., John Doe"
              required
            />
            
            <FormInput
              label="Email"
              id="email"
              name="email"
              type="email"
              value={formData.contactDetails.email}
              onChange={handleContactChange}
              placeholder="e.g., john.doe@example.com"
              required
            />
            
            <FormInput
              label="Phone Number"
              id="phone"
              name="phone"
              value={formData.contactDetails.phone}
              onChange={handleContactChange}
              placeholder="e.g., 0771234567"
              required
            />

            <FormInput
              label="National ID"
              id="national_id"
              name="national_id"
              value={formData.national_id || ''}
              onChange={handleInputChange}
              placeholder="e.g., 123456789"
              required
            />

            <div className="mb-4">
              <label htmlFor="permanent_address" className="block text-sm font-medium text-gray-700">
                Permanent Address <span className="text-red-500">*</span>
              </label>
              <textarea
                id="permanent_address"
                name="permanent_address"
                rows={3}
                value={formData.permanent_address || ''}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="Enter permanent residential address"
                required
              />
            </div>
            
            {/* ID Copy Upload */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ID Copy
              </label>
              <ImageUpload
                onImagesChange={(files) => handleIdCopyChange(files[0])}
                maxImages={1}
                initialImages={existingIdCopy ? [{ url: existingIdCopy }] : []}
                bucket={STORAGE_BUCKETS.IMAGES}
                folder="id-copies"
                acceptedTypes={['image/jpeg', 'image/png', 'image/gif', 'application/pdf']}
                maxSizeInMB={5}
              />
              {existingIdCopy && (
                <div className="mt-2">
                  {existingIdCopy.endsWith('.pdf') ? (
                    <div className="flex items-center space-x-2">
                      <svg className="w-8 h-8 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9 2a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2V6.414A2 2 0 0016.414 5L14 2.586A2 2 0 0012.586 2H9z" />
                      </svg>
                      <span className="text-sm text-gray-500">PDF Document</span>
                    </div>
                  ) : (
                    <img
                      src={existingIdCopy}
                      alt="ID Copy Preview"
                      className="h-32 w-auto object-contain rounded-md"
                    />
                  )}
                  <button
                    type="button"
                    onClick={handleRemoveIdCopy}
                    className="mt-2 text-sm text-red-600 hover:text-red-800"
                  >
                    Remove ID Copy
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Property Assignment */}
          <div>
            <h2 className="text-lg font-medium mb-4">Property Assignment</h2>
            
            <div className="mb-4">
              <label htmlFor="property" className="block text-sm font-medium text-gray-700 mb-1">
                Select Property
              </label>
              <div className="flex flex-col space-y-2">
                <div className="flex-grow">
                  <select
                    id="property"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    value={selectedProperty}
                    onChange={handlePropertyChange}
                  >
                    <option value="">Select a property</option>
                    {properties.map(property => (
                      <option 
                        key={property.id} 
                        value={property.id}
                      >
                        {property.name} ({property.propertytype})
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* Show unit selection for apartments */}
                {isSelectedPropertyApartment() && (
                  <div className="flex-grow">
                    <label htmlFor="unit" className="block text-sm font-medium text-gray-700 mb-1">
                      Select Unit
                    </label>
                    <select
                      id="unit"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      value={selectedUnit}
                      onChange={handleUnitChange}
                    >
                      <option value="">Select a unit</option>
                      {propertyUnits.map(unit => (
                        <option 
                          key={unit.id} 
                          value={unit.id}
                        >
                          Unit {unit.unitnumber}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                
                <button
                  type="button"
                  onClick={handleAddProperty}
                  disabled={!selectedProperty || (isSelectedPropertyApartment() && !selectedUnit)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Add Property
                </button>
              </div>
            </div>
            
            {/* Associated Properties */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Associated Properties
              </label>
              
              {formData.structuredAssociations.length > 0 ? (
                <div className="space-y-3">
                  {formData.structuredAssociations.map((assoc, index) => {
                    const property = properties.find(p => p.id === assoc.propertyId);
                    const propertyName = property ? property.name : assoc.propertyId;
                    const unitNumber = assoc.unitId ? getUnitNumber(assoc.unitId) : null;
                    
                    return (
                      <div key={index} className="flex items-center justify-between p-3 border border-gray-200 rounded-md bg-white">
                        <div>
                          <span className="text-sm font-medium">{propertyName}</span>
                          {unitNumber && (
                            <span className="text-sm text-gray-500 ml-2">
                              (Unit {unitNumber})
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveProperty(index)}
                          className="text-red-600 hover:text-red-800"
                          aria-label="Remove property"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
                  <p className="text-sm text-gray-500">No properties assigned yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Form Actions */}
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard/rentees')}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            disabled={submitting}
          >
            {submitting ? 'Saving...' : isEditMode ? 'Update Rentee' : 'Add Rentee'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default RenteeForm; 