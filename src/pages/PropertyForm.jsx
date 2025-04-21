import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchData, insertData, updateData } from '../services/supabaseClient';
import { saveFile, saveImage, deleteFile, STORAGE_BUCKETS, BUCKET_FOLDERS } from '../services/fileService';
import { generateTempId } from '../utils/helpers';
import { PROPERTY_TYPES } from '../utils/constants';
import { toDatabaseFormat, fromDatabaseFormat } from '../utils/databaseUtils';
import { toast } from 'react-hot-toast';

// UI Components
import FormInput from '../components/ui/FormInput';
import FormTextarea from '../components/ui/FormTextarea';
import ImageUpload from '../components/common/ImageUpload';
import DynamicList from '../components/ui/DynamicList';
import KeyValuePairs from '../components/ui/KeyValuePairs';
import PropertyAmenities from '../components/properties/PropertyAmenities';
import PropertyAvailability from '../components/properties/PropertyAvailability';
import PropertyMap from '../components/properties/PropertyMap';
import PropertyUnits from '../components/properties/PropertyUnits';

const PropertyForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = !!id;
  
  // Initial form data
  const initialFormData = {
    name: '',
    address: '',
    bank_name: '',
    bank_branch: '',
    bank_account_number: '',
    unitconfiguration: '',
    rentalvalues: {
      rent: '',
      deposit: '',
    },
    checklistitems: [],
    terms: {},
    images: [],
    description: '',
    status: 'active',
    propertytype: '',
    squarefeet: '',
    yearbuilt: '',
    availablefrom: null,
    amenities: [],
    electricity_rate: '',
    water_rate: '',
  };
  
  // Form state
  const [formData, setFormData] = useState(initialFormData);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [existingImages, setExistingImages] = useState([]);
  const [imagesToDelete, setImagesToDelete] = useState([]);
  const [profileImageIndex, setProfileImageIndex] = useState(0); // Track which image is the profile picture
  
  // Fetch property data if in edit mode
  useEffect(() => {
    const fetchPropertyData = async () => {
      if (isEditMode) {
        try {
          setLoading(true);
          const { data, error } = await fetchData({
            table: 'properties',
            filters: [{ column: 'id', operator: 'eq', value: id }],
          });
          
          if (error) {
            throw error;
          }
          
          if (data && data.length > 0) {
            const property = fromDatabaseFormat(data[0]);
            console.log('Fetched property data:', property);
            
            // Ensure rentalvalues is properly structured
            const rentalvalues = typeof property.rentalvalues === 'string' 
              ? JSON.parse(property.rentalvalues)
              : property.rentalvalues || { rent: '', deposit: '' };
            
            // Ensure arrays are properly initialized
            const checklistitems = Array.isArray(property.checklistitems) 
              ? property.checklistitems 
              : [];
            
            const amenities = Array.isArray(property.amenities)
              ? property.amenities
              : [];
            
            const images = Array.isArray(property.images)
              ? property.images
              : [];
            
            setFormData({
              name: property.name || '',
              address: property.address || '',
              bank_name: property.bank_name || '',
              bank_branch: property.bank_branch || '',
              bank_account_number: property.bank_account_number || '',
              unitconfiguration: property.unitconfiguration || '',
              rentalvalues,
              checklistitems,
              terms: property.terms || {},
              images,
              description: property.description || '',
              status: property.status || 'active',
              propertytype: property.propertytype || '',
              squarefeet: property.squarefeet || '',
              yearbuilt: property.yearbuilt || '',
              availablefrom: property.availablefrom || null,
              amenities,
              electricity_rate: property.electricity_rate || '',
              water_rate: property.water_rate || '',
            });
            
            // Set existing images if any
            if (images.length > 0) {
              setExistingImages(images);
            }
          }
        } catch (error) {
          console.error('Error fetching property:', error);
          setError(error.message);
        } finally {
          setLoading(false);
        }
      }
    };
    
    fetchPropertyData();
  }, [id, isEditMode]);
  
  // Handle input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Handle rental values changes
  const handleRentalValueChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      rentalvalues: {
        ...prev.rentalvalues,
        [name]: value,
      },
    }));
  };
  
  // Handle status change
  const handleStatusChange = (status) => {
    setFormData(prev => ({
      ...prev,
      status,
    }));
  };
  
  // Handle available from date change
  const handleAvailableFromChange = (date) => {
    setFormData(prev => ({
      ...prev,
      availablefrom: date,
    }));
  };
  
  // Handle property type change
  const handlePropertyTypeChange = (e) => {
    const { value } = e.target;
    setFormData(prev => ({
      ...prev,
      propertytype: value,
    }));
  };
  
  // Handle amenities change
  const handleAmenitiesChange = (amenities) => {
    setFormData(prev => ({
      ...prev,
      amenities,
    }));
  };
  
  // Handle checklist items change
  const handleChecklistItemsChange = (checklistitems) => {
    setFormData(prev => ({
      ...prev,
      checklistitems,
    }));
  };
  
  // Organize images by category
  const organizeImagesByCategory = (images) => {
    // Debug output to check what we're receiving
    console.log('Property images received for organization:', images);
    
    if (!images || images.length === 0) {
      console.log('No property images found to organize');
      return [];
    }
    
    // Clone the images array and ensure each image has all required properties
    const sortedImages = [...images].map(img => {
      // Handle both string URLs and object format
      if (typeof img === 'string') {
        return {
          image_url: img,
          image_type: 'exterior', // Default category for backward compatibility
          uploaded_at: new Date().toISOString()
        };
      }
      
      return {
        ...img,
        image_url: img.image_url || img, // Handle both formats
        image_type: img.image_type || 'exterior',
        uploaded_at: img.uploaded_at || new Date().toISOString()
      };
    });
    
    // Filter out any images with empty URLs
    const validImages = sortedImages.filter(img => {
      const url = typeof img === 'string' ? img : img.image_url;
      return !!url;
    });
    
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
    console.log('Property images after sorting:', validImages);
    
    // Group images by type
    const groupedImages = validImages.reduce((acc, image) => {
      // Make sure we have a valid type
      const type = image.image_type || 'exterior';
      if (!acc[type]) acc[type] = [];
      acc[type].push(image);
      return acc;
    }, {});
    
    // Debug output for grouped images
    console.log('Property images after grouping by type:', groupedImages);
    
    // Define category order and labels
    const categoryOrder = ['exterior', 'interior', 'floorplan', 'other'];
    const categoryLabels = {
      'exterior': 'Exterior Images',
      'interior': 'Interior Images',
      'floorplan': 'Floor Plans',
      'other': 'Other Images'
    };
    
    // Create the final structure
    const organizedImages = categoryOrder
      .filter(category => groupedImages[category] && groupedImages[category].length > 0)
      .map(category => ({
        category,
        label: categoryLabels[category],
        images: groupedImages[category]
      }));
    
    // Debug output for final organized structure
    console.log('Final organized property images by category:', organizedImages);
    
    return organizedImages;
  };

  // Handle image upload
  const handleImagesChange = async (newImages, imageType = 'exterior') => {
    try {
      console.log(`Processing ${newImages.length} new property images of type: ${imageType}`);
      
      const uploadPromises = newImages.map(async (file) => {
        // If it's already a URL string, return it as is with type
        if (typeof file === 'string') {
          console.log('Existing image URL:', file);
          return {
            image_url: file,
            image_type: imageType,
            uploaded_at: new Date().toISOString()
          };
        }
        
        // If it's a File object or has a name property, upload it
        if (file instanceof File || file.name) {
          console.log(`Uploading new ${imageType} image:`, file.name);
          const result = await saveImage(file, {
            bucket: STORAGE_BUCKETS.IMAGES,
            folder: BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES].PROPERTIES
          });

          if (!result.success) {
            console.error('Failed to upload property image:', result.error);
            throw new Error(result.error || 'Failed to upload image');
          }

          console.log('Property image uploaded successfully:', result.url);
          return {
            image_url: result.url,
            image_type: imageType,
            uploaded_at: new Date().toISOString()
          };
        }
        
        console.error('Invalid file object:', file);
        throw new Error('Invalid file object: must be a File or URL string');
      });

      const uploadedImages = await Promise.all(uploadPromises);
      console.log('All property images processed successfully:', uploadedImages);
      
      // Update form data with new image objects
      setFormData(prev => {
        // Convert existing images to object format if they're just strings
        const convertedExistingImages = (prev.images || []).map(img => 
          typeof img === 'string' 
            ? { image_url: img, image_type: 'exterior', uploaded_at: new Date().toISOString() }
            : img
        );
        
        return {
          ...prev,
          images: [...convertedExistingImages, ...uploadedImages]
        };
      });

      toast.success(`${uploadedImages.length} ${imageType} images uploaded successfully`);
    } catch (error) {
      console.error('Error uploading property images:', error);
      toast.error(error.message || 'Failed to upload images');
    }
  };
  
  // Handle image removal
  const handleRemoveImage = async (index) => {
    try {
      const imageToRemove = formData.images[index];
      console.log('Removing property image:', imageToRemove);
      
      // Get the image URL (handle both string and object formats)
      const imageUrl = typeof imageToRemove === 'string' 
        ? imageToRemove 
        : imageToRemove.image_url;
      
      if (imageUrl) {
        // Extract the path from the URL
        const urlParts = imageUrl.split('/storage/v1/object/public/');
        if (urlParts.length === 2) {
          const [bucket, path] = urlParts[1].split('/', 1);
          const filePath = urlParts[1].substring(bucket.length + 1);
          
          console.log('Deleting property image file:', { bucket, path: filePath });
          
          const { success, error } = await deleteFile(bucket, filePath);
          if (!success) {
            console.error('Failed to delete property image file:', error);
            throw new Error(error?.message || 'Failed to delete image');
          }

          // Update form data only after successful deletion
          const updatedImages = formData.images.filter((_, i) => i !== index);
          setFormData(prev => ({
            ...prev,
            images: updatedImages
          }));

          toast.success('Property image removed successfully');
        } else {
          console.error('Invalid property image URL format:', imageUrl);
          throw new Error('Invalid image URL format');
        }
      }
    } catch (error) {
      console.error('Error removing property image:', error);
      toast.error(error.message || 'Failed to remove image');
    }
  };
  
  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError(null);

      // Prepare the data for database
      const propertyData = {
        ...formData,
        // Ensure all required fields are present and properly formatted
        name: formData.name?.trim(),
        address: formData.address?.trim(),
        bank_name: formData.bank_name?.trim(),
        bank_branch: formData.bank_branch?.trim(),
        bank_account_number: formData.bank_account_number?.trim(),
        propertytype: formData.propertytype,
        status: formData.status,
        rentalvalues: {
          rent: parseFloat(formData.rentalvalues.rent) || 0,
          deposit: parseFloat(formData.rentalvalues.deposit) || 0,
        },
        squarefeet: formData.squarefeet ? parseInt(formData.squarefeet) : null,
        yearbuilt: formData.yearbuilt ? parseInt(formData.yearbuilt) : null,
        availablefrom: formData.availablefrom,
        description: formData.description?.trim() || '',
        checklistitems: Array.isArray(formData.checklistitems) ? formData.checklistitems : [],
        amenities: Array.isArray(formData.amenities) ? formData.amenities : [],
        images: Array.isArray(formData.images) ? formData.images : [],
        unitconfiguration: formData.unitconfiguration?.trim() || '',
        electricity_rate: formData.electricity_rate ? parseFloat(formData.electricity_rate) : null,
        water_rate: formData.water_rate ? parseFloat(formData.water_rate) : null,
        updatedat: new Date().toISOString()
      };

      // Only add createdat for new properties
      if (!id) {
        propertyData.createdat = new Date().toISOString();
      }

      console.log('Submitting property data:', propertyData);

      let result;
      if (id) {
        // Update existing property
        result = await updateData('properties', id, propertyData);
      } else {
        // Create new property
        result = await insertData('properties', propertyData);
      }

      if (result.error) {
        console.error('Error saving property:', result.error);
        setError(result.error.message || 'Failed to save property');
        toast.error('Failed to save property');
        return;
      }

      toast.success(`Property ${id ? 'updated' : 'created'} successfully!`);
      navigate('/dashboard/properties');
    } catch (err) {
      console.error('Error saving property:', err);
      setError(err.message || 'Failed to save property');
      toast.error('Failed to save property');
    } finally {
      setSubmitting(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading property data...</div>
      </div>
    );
  }
  
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">
        {isEditMode ? 'Edit Property' : 'Add New Property'}
      </h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline ml-2">{error}</span>
          {error.includes(':') && (
            <ul className="list-disc ml-8 mt-2">
              {error.split(':')[1].split(',').map((err, index) => (
                <li key={index} className="text-sm">{err.trim()}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Basic Information */}
          <div>
            <h2 className="text-lg font-medium mb-4">Basic Information</h2>
            
            <FormInput
              label="Property Name"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="e.g., KRE Athurugiriya"
              required
            />
            
            <FormInput
              label="Address"
              id="address"
              name="address"
              value={formData.address}
              onChange={handleInputChange}
              placeholder="Full property address"
              required
            />

            {/* Banking Details Section */}
            <div className="mt-6">
              <h3 className="text-md font-medium mb-4">Banking Details</h3>
              
              <FormInput
                label="Bank Name"
                id="bank_name"
                name="bank_name"
                value={formData.bank_name}
                onChange={handleInputChange}
                placeholder="e.g., Commercial Bank"
                required
              />
              
              <FormInput
                label="Bank Branch"
                id="bank_branch"
                name="bank_branch"
                value={formData.bank_branch}
                onChange={handleInputChange}
                placeholder="e.g., Athurugiriya"
                required
              />
              
              <FormInput
                label="Account Number"
                id="bank_account_number"
                name="bank_account_number"
                value={formData.bank_account_number}
                onChange={handleInputChange}
                placeholder="e.g., 1234567890"
                required
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Property Type
              </label>
              <select
                id="propertytype"
                name="propertytype"
                value={formData.propertytype}
                onChange={handlePropertyTypeChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                required
              >
                <option value="">Select Property Type</option>
                <option value={PROPERTY_TYPES.APARTMENT}>Apartment Complex</option>
                <option value={PROPERTY_TYPES.HOUSE}>House</option>
                <option value={PROPERTY_TYPES.CONDO}>Condominium</option>
                <option value={PROPERTY_TYPES.COMMERCIAL}>Commercial</option>
                <option value={PROPERTY_TYPES.LAND}>Land</option>
              </select>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <FormInput
                label="Monthly Rent"
                id="rent"
                name="rent"
                type="number"
                value={formData.rentalvalues.rent}
                onChange={handleRentalValueChange}
                placeholder="0.00"
                required
              />
              
              <FormInput
                label="Security Deposit"
                id="deposit"
                name="deposit"
                type="number"
                value={formData.rentalvalues.deposit}
                onChange={handleRentalValueChange}
                placeholder="0.00"
                required
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Property Availability
              </label>
              <PropertyAvailability
                status={formData.status}
                availableFrom={formData.availablefrom}
                onStatusChange={handleStatusChange}
                onDateChange={handleAvailableFromChange}
              />
            </div>
          </div>
          
          {/* Additional Information */}
          <div>
            <h2 className="text-lg font-medium mb-4">Additional Information</h2>
            
            {formData.propertytype !== PROPERTY_TYPES.APARTMENT && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unit Configuration
                </label>
                <FormInput
                  label="Unit Configuration"
                  id="unitconfiguration"
                  name="unitconfiguration"
                  value={formData.unitconfiguration}
                  onChange={handleInputChange}
                  placeholder="e.g., 4+2 units"
                />
              </div>
            )}
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Square Feet
              </label>
              <FormInput
                label="Square Feet"
                id="squarefeet"
                name="squarefeet"
                type="number"
                value={formData.squarefeet}
                onChange={handleInputChange}
                placeholder="e.g., 1200"
              />
            </div>
            
            {/* Utility Rates */}
            <div className="mb-4">
              <h3 className="text-md font-medium text-gray-700 mb-3">Utility Rates</h3>
              <div className="grid grid-cols-2 gap-4">
                <FormInput
                  label="Electricity Rate (per unit)"
                  id="electricity_rate"
                  name="electricity_rate"
                  type="number"
                  step="0.01"
                  value={formData.electricity_rate}
                  onChange={handleInputChange}
                  placeholder="e.g., 32.50"
                />
                
                <FormInput
                  label="Water Rate (per unit)"
                  id="water_rate"
                  name="water_rate"
                  type="number"
                  step="0.01"
                  value={formData.water_rate}
                  onChange={handleInputChange}
                  placeholder="e.g., 45.00"
                />
              </div>
              <p className="mt-1 text-sm text-gray-500">
                These rates will be used for utility billing calculations.
              </p>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Year Built
              </label>
              <FormInput
                label="Year Built"
                id="yearbuilt"
                name="yearbuilt"
                type="number"
                value={formData.yearbuilt}
                onChange={handleInputChange}
                placeholder="e.g., 2020"
              />
            </div>
            
            {/* Checklist Items */}
            <div className="mt-6">
              <h2 className="text-lg font-medium mb-4">Checklist Items</h2>
              <p className="text-gray-500 mb-4">
                Add items to be checked during property inspections, move-in/move-out, etc.
              </p>
              <DynamicList
                label=""
                items={formData.checklistitems}
                onChange={handleChecklistItemsChange}
                placeholder="Add new checklist item (e.g., 'Check plumbing')"
              />
            </div>
            
            {/* Amenities */}
            <div className="mt-6">
              <h2 className="text-lg font-medium mb-4">Amenities</h2>
              <PropertyAmenities
                selectedAmenities={formData.amenities}
                onChange={handleAmenitiesChange}
              />
            </div>
          </div>
        </div>
        
        {/* Description */}
        <div className="mt-6">
          <h2 className="text-lg font-medium mb-4">Description</h2>
          
          <FormTextarea
            label="Property Description"
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            placeholder="Detailed description of the property"
            rows={4}
          />
        </div>
        
        {/* Images */}
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-2">Property Images</h3>
          <div className="mb-4">
            {organizeImagesByCategory(formData.images || []).map((category) => (
              <div key={category.category} className="mb-6">
                <h4 className="text-md font-medium mb-2">{category.label} ({category.images.length})</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {category.images.map((image, index) => {
                    const imageUrl = typeof image === 'string' ? image : image.image_url;
                    const imageIndex = formData.images.findIndex(img => {
                      if (typeof img === 'string') return img === imageUrl;
                      return img.image_url === imageUrl;
                    });
                    
                    return (
                      <div key={index} className="relative group">
                        <div className="aspect-square overflow-hidden rounded-lg border border-gray-200">
                          <img
                            src={imageUrl}
                            alt={`${category.label} ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(imageIndex)}
                            className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            disabled={submitting}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          
          <div className="mb-4">
            <h4 className="text-md font-medium mb-2">Upload Images</h4>
            <ImageUpload 
              onImagesChange={handleImagesChange}
              maxImages={20}
              initialImages={[]}
              showTypeSelector={true}
            />
          </div>
        </div>
        
        {/* Location */}
        <div className="mt-6">
          <h2 className="text-lg font-medium mb-4">Property Location</h2>
          
          <PropertyMap
            address={formData.address}
            coordinates={null}
            onCoordinatesChange={null}
          />
        </div>
        
        {/* Form Actions */}
        <div className="mt-8 flex justify-end space-x-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard/properties')}
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
            {submitting ? 'Saving...' : isEditMode ? 'Update Property' : 'Add Property'}
          </button>
        </div>
      </form>
      
      {/* Property Units Section (only for apartment type properties) */}
      {isEditMode && formData.propertytype === PROPERTY_TYPES.APARTMENT && (
        <PropertyUnits propertyId={id} propertyType={formData.propertytype} />
      )}
    </div>
  );
};

export default PropertyForm; 