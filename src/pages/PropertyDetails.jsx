import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchData, deleteData } from '../services/supabaseClient';
import { formatCurrency, formatDate } from '../utils/helpers';
import { DEFAULT_IMAGE } from '../utils/constants';
import { supabase } from '../services/supabaseClient';
import { getRenteesByProperty } from '../services/renteeService';

// Components
import PropertyMap from '../components/properties/PropertyMap';

const PropertyDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [property, setProperty] = useState(null);
  const [rentees, setRentees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState('exterior');
  const [organizedImages, setOrganizedImages] = useState([]);
  const [agreements, setAgreements] = useState([]);
  const [maintenanceRequests, setMaintenanceRequests] = useState([]);
  
  // Function to organize images by category
  const organizeImagesByCategory = (images) => {
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
    
    // Group images by type
    const groupedImages = validImages.reduce((acc, image) => {
      // Make sure we have a valid type
      const type = image.image_type || 'exterior';
      if (!acc[type]) acc[type] = [];
      acc[type].push(image);
      return acc;
    }, {});
    
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
    
    return organizedImages;
  };
  
  useEffect(() => {
    const fetchPropertyData = async () => {
      try {
        setLoading(true);
        
        // Fetch property details
        const { data: propertyData, error: propertyError } = await fetchData('properties', {
          filters: [{ column: 'id', operator: 'eq', value: id }],
        });
        
        if (propertyError) {
          throw propertyError;
        }
        
        if (propertyData && propertyData.length > 0) {
          // Inspect the raw property data before any processing
          console.log('Raw property data from DB:', propertyData[0]);
          console.log('Terms type:', typeof propertyData[0].terms);
          
          // Add more robust terms handling
          let processedProperty = { ...propertyData[0] };
          
          // Handle terms properly - if it's a string, parse it
          if (typeof processedProperty.terms === 'string') {
            try {
              // Try to parse as JSON
              processedProperty.terms = JSON.parse(processedProperty.terms);
              console.log('Successfully parsed terms as JSON:', processedProperty.terms);
            } catch (e) {
              console.error('Error parsing terms JSON:', e);
              // If it's not valid JSON but has content, treat it as a single term
              if (processedProperty.terms.trim()) {
                processedProperty.terms = { generalTerms: processedProperty.terms };
              } else {
                processedProperty.terms = {};
              }
            }
          } else if (processedProperty.terms === null || processedProperty.terms === undefined) {
            // Handle null or undefined
            console.log('Terms was null or undefined, using empty object');
            processedProperty.terms = {};
          } else if (typeof processedProperty.terms === 'object') {
            // Already an object, but check if it's empty
            if (Object.keys(processedProperty.terms).length === 0) {
              console.log('Terms is an empty object');
            } else {
              console.log('Terms is already an object:', processedProperty.terms);
            }
          } else {
            // Handle any other unexpected type
            console.log('Terms has unexpected type:', typeof processedProperty.terms);
            processedProperty.terms = { value: String(processedProperty.terms) };
          }
          
          console.log('Final property data:', processedProperty);
          
          setProperty(processedProperty);
          
          // Organize property images
          const images = processedProperty.images || [];
          const organized = organizeImagesByCategory(images);
          setOrganizedImages(organized);
          
          // Set default active category if it exists
          if (organized.length > 0) {
            setActiveCategory(organized[0].category);
          }
          
          // Fetch all rentees associated with this property using the dedicated service
          console.log('Fetching rentees for property ID:', id);
          
          try {
            // Query rentees directly using SQL-like filter with Supabase
            const { data: directRentees, error: directError } = await supabase
              .from('app_users')
              .select('id, name, contact_details, email')
              .eq('user_type', 'rentee')
              .filter('associated_property_ids', 'cs', `{"${id}"}`);
              
            if (directError) {
              console.error('Error fetching rentees with filter:', directError);
              setRentees([]);
            } else if (directRentees && directRentees.length > 0) {
              console.log('Found rentees via direct query:', directRentees.length);
              setRentees(directRentees);
            } else {
              console.log('No rentees found with associated property IDs, checking agreements...');
              
              // Also check agreements to find rentees linked to this property
              const { data: agreementRentees, error: agreementError } = await supabase
                .from('agreements')
                .select('renteeid')
                .eq('propertyid', id)
                .in('status', ['active', 'pending', 'review', 'signed']);
                
              if (agreementError) {
                console.error('Error checking agreements:', agreementError);
                setRentees([]);
              } else if (agreementRentees && agreementRentees.length > 0) {
                console.log('Found rentees via agreements:', agreementRentees.length);
                
                // Get unique rentee IDs from agreements
                const renteeIds = [...new Set(agreementRentees.map(a => a.renteeid))];
                
                // Fetch the actual rentee records
                const { data: fullRentees, error: renteeError } = await supabase
                  .from('app_users')
                  .select('id, name, contact_details, email')
                  .in('id', renteeIds);
                  
                if (renteeError) {
                  console.error('Error fetching rentees by IDs:', renteeError);
                  setRentees([]);
                } else {
                  console.log('Retrieved rentees from agreements:', fullRentees?.length || 0);
                  setRentees(fullRentees || []);
                }
              } else {
                console.log('No rentees found in agreements, checking units...');
                
                // Check if property has units, then check for agreements on those units
                const { data: propertyUnits, error: unitsError } = await supabase
                  .from('property_units')
                  .select('id')
                  .eq('propertyid', id);
                  
                if (unitsError) {
                  console.error('Error checking property units:', unitsError);
                  setRentees([]);
                } else if (propertyUnits && propertyUnits.length > 0) {
                  // Property has units, check for agreements on these units
                  const unitIds = propertyUnits.map(unit => unit.id);
                  
                  const { data: unitAgreements, error: unitAgreementsError } = await supabase
                    .from('agreements')
                    .select('renteeid')
                    .in('unitid', unitIds)
                    .in('status', ['active', 'pending', 'review', 'signed']);
                    
                  if (unitAgreementsError) {
                    console.error('Error checking unit agreements:', unitAgreementsError);
                    setRentees([]);
                  } else if (unitAgreements && unitAgreements.length > 0) {
                    console.log('Found rentees via unit agreements:', unitAgreements.length);
                    
                    // Get unique rentee IDs from unit agreements
                    const unitRenteeIds = [...new Set(unitAgreements.map(a => a.renteeid))];
                    
                    // Fetch the actual rentee records
                    const { data: unitRentees, error: unitRenteeError } = await supabase
                      .from('app_users')
                      .select('id, name, contact_details, email')
                      .in('id', unitRenteeIds);
                      
                    if (unitRenteeError) {
                      console.error('Error fetching rentees by unit agreement IDs:', unitRenteeError);
                      setRentees([]);
                    } else {
                      console.log('Retrieved rentees from unit agreements:', unitRentees?.length || 0);
                      setRentees(unitRentees || []);
                    }
                  } else {
                    console.log('No rentees found in unit agreements');
                    setRentees([]);
                  }
                } else {
                  console.log('Property has no units');
                  setRentees([]);
                }
              }
            }
          } catch (err) {
            console.error('Exception fetching rentees:', err);
            setRentees([]);
          }
          
          // Fetch agreements for this property
          const { data: agreementsData, error: agreementsError } = await fetchData('agreements', {
            filters: [{ column: 'propertyid', operator: 'eq', value: id }],
          });
          
          if (agreementsError) {
            throw agreementsError;
          }
          
          setAgreements(agreementsData || []);
          
          // Fetch maintenance requests for this property
          const { data: maintenanceData, error: maintenanceError } = await fetchData('maintenance_requests', {
            filters: [{ column: 'propertyid', operator: 'eq', value: id }],
          });
          
          if (maintenanceError) {
            throw maintenanceError;
          }
          
          setMaintenanceRequests(maintenanceData || []);
        } else {
          throw new Error('Property not found');
        }
      } catch (error) {
        console.error('Error fetching property data:', error.message);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchPropertyData();
  }, [id]);
  
  const handleDelete = async () => {
    try {
      setLoading(true);
      const { error } = await deleteData('properties', id);
      
      if (error) {
        throw error;
      }
      
      navigate('/dashboard/properties');
    } catch (error) {
      console.error('Error deleting property:', error.message);
      setError(error.message);
    } finally {
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading property details...</div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
        <strong className="font-bold">Error!</strong>
        <span className="block sm:inline"> {error}</span>
      </div>
    );
  }
  
  if (!property) {
    return (
      <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded relative" role="alert">
        <strong className="font-bold">Not Found!</strong>
        <span className="block sm:inline"> The requested property could not be found.</span>
      </div>
    );
  }
  
  return (
    <div>
      {/* Header with actions */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">{property.name}</h1>
        <div className="flex space-x-3">
          <Link
            to={`/dashboard/properties/${id}/edit`}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
            Edit
          </Link>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Delete
          </button>
        </div>
      </div>
      
      {/* Property details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Images */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {organizedImages.length > 0 ? (
              <div>
                {/* Category tabs */}
                <div className="bg-gray-100 border-b">
                  <div className="flex overflow-x-auto">
                    {organizedImages.map((category) => (
                      <button
                        key={category.category}
                        onClick={() => setActiveCategory(category.category)}
                        className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${
                          activeCategory === category.category
                            ? 'border-b-2 border-blue-500 bg-white text-blue-600'
                            : 'text-gray-600 hover:text-gray-800 hover:bg-gray-200'
                        }`}
                      >
                        {category.label} ({category.images.length})
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Active category images */}
                {organizedImages.find(cat => cat.category === activeCategory) && (
                  <div>
                    <div className="h-96 overflow-hidden">
                      {(() => {
                        const categoryImages = organizedImages.find(cat => cat.category === activeCategory).images;
                        const currentImage = categoryImages[activeImageIndex >= categoryImages.length ? 0 : activeImageIndex];
                        const imageUrl = typeof currentImage === 'string' ? currentImage : currentImage.image_url;
                        
                        return (
                          <img 
                            src={imageUrl} 
                            alt={property.name} 
                            className="w-full h-full object-contain"
                            onError={(e) => { 
                              console.log("Image failed to load, using fallback");
                              e.target.onerror = null; 
                              e.target.src = DEFAULT_IMAGE; 
                            }}
                          />
                        );
                      })()}
                    </div>
                    
                    {/* Thumbnails */}
                    {(() => {
                      const categoryImages = organizedImages.find(cat => cat.category === activeCategory).images;
                      
                      return categoryImages.length > 1 ? (
                        <div className="p-2 flex space-x-2 overflow-x-auto">
                          {categoryImages.map((image, index) => {
                            const imageUrl = typeof image === 'string' ? image : image.image_url;
                            
                            return (
                              <button
                                key={index}
                                onClick={() => setActiveImageIndex(index)}
                                className={`h-16 w-16 flex-shrink-0 rounded overflow-hidden border-2 ${
                                  index === activeImageIndex ? 'border-blue-500' : 'border-transparent'
                                }`}
                              >
                                <img 
                                  src={imageUrl} 
                                  alt={`Thumbnail ${index + 1}`} 
                                  className="w-full h-full object-cover"
                                  onError={(e) => { 
                                    e.target.onerror = null; 
                                    e.target.src = DEFAULT_IMAGE; 
                                  }}
                                />
                              </button>
                            );
                          })}
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-96 bg-gray-100 flex items-center justify-center">
                <div className="text-center">
                  <img 
                    src={DEFAULT_IMAGE} 
                    alt="No images available" 
                    className="w-full max-w-md mx-auto"
                  />
                  <p className="text-gray-500 mt-4">No images available for this property</p>
                </div>
              </div>
            )}
          </div>
          
          {/* Description */}
          <div className="bg-white rounded-lg shadow p-6 mt-6">
            <h2 className="text-lg font-medium mb-4">Description</h2>
            <p className="text-gray-700">
              {property.description || 'No description available.'}
            </p>
          </div>
          
          {/* Amenities */}
          <div className="bg-white rounded-lg shadow p-6 mt-6">
            <h2 className="text-lg font-medium mb-4">Amenities</h2>
            {property.amenities && property.amenities.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {property.amenities.map((amenity, index) => (
                  <span key={index} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                    {amenity}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No amenities available.</p>
            )}
          </div>
          
          {/* Checklist Items */}
          <div className="bg-white rounded-lg shadow p-6 mt-6">
            <h2 className="text-lg font-medium mb-4">Checklist Items</h2>
            {property.checklistitems && property.checklistitems.length > 0 ? (
              <ul className="list-disc pl-5 space-y-1">
                {property.checklistitems.map((item, index) => (
                  <li key={index} className="text-gray-700">{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">No checklist items available.</p>
            )}
          </div>
          
          {/* Location */}
          <div className="bg-white rounded-lg shadow p-6 mt-6">
            <h2 className="text-lg font-medium mb-4">Location</h2>
            <PropertyMap 
              address={property.address || ''} 
              coordinates={property.coordinates || null} 
              readOnly={true} 
            />
          </div>
        </div>
        
        {/* Right column - Details */}
        <div>
          {/* Basic Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium mb-4">Property Details</h2>
            
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Address</p>
                <p className="font-medium">{property.address || 'No address provided'}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">Property Type</p>
                <p className="font-medium capitalize">{property.propertytype || 'Not specified'}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">Unit Configuration</p>
                <p className="font-medium">{property.unitconfiguration || 'Not specified'}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">Monthly Rent</p>
                <p className="font-medium">{formatCurrency(property.rentalvalues?.rent || 0)}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">Deposit</p>
                <p className="font-medium">{formatCurrency(property.rentalvalues?.deposit || 0)}</p>
              </div>
              
              {property.squarefeet && (
                <div>
                  <p className="text-sm text-gray-500">Square Feet</p>
                  <p className="font-medium">{property.squarefeet} sq ft</p>
                </div>
              )}
              
              {property.yearbuilt && (
                <div>
                  <p className="text-sm text-gray-500">Year Built</p>
                  <p className="font-medium">{property.yearbuilt}</p>
                </div>
              )}
              
              <div>
                <p className="text-sm text-gray-500">Availability</p>
                <div className="mt-1">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    property.status === 'available' ? 'bg-green-100 text-green-800' : 
                    property.status === 'occupied' ? 'bg-red-100 text-red-800' : 
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {property.status ? property.status.charAt(0).toUpperCase() + property.status.slice(1) : 'Unknown'}
                  </span>
                  
                  {property.availablefrom && property.status !== 'available' && (
                    <p className="text-sm mt-1">
                      Available from: {formatDate(property.availablefrom)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Terms */}
          <div className="bg-white rounded-lg shadow p-6 mt-6">
            <h2 className="text-lg font-medium mb-4">Terms</h2>
            
            {property.terms && typeof property.terms === 'object' && Object.keys(property.terms).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(property.terms).map(([key, value]) => {
                  // Skip null or undefined values
                  if (value === null || value === undefined) {
                    return null;
                  }
                  
                  // Format the key for display
                  const displayKey = key.replace(/([A-Z])/g, ' $1')
                                .trim()
                                .replace(/^\w/, c => c.toUpperCase());
                  
                  return (
                    <div key={key}>
                      <p className="text-sm text-gray-500">{displayKey}</p>
                      <p className="font-medium">
                        {typeof value === 'boolean' 
                          ? (value ? 'Yes' : 'No')
                          : typeof value === 'object' && value !== null
                            ? JSON.stringify(value)
                            : String(value)
                        }
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-500">No terms available.</p>
            )}
          </div>
          
          {/* Current Rentees */}
          <div className="bg-white rounded-lg shadow p-6 mt-6">
            <h2 className="text-lg font-medium mb-4">Current Rentees</h2>
            
            {rentees && rentees.length > 0 ? (
              <div className="space-y-4">
                {rentees.map(rentee => (
                  <div key={rentee.id} className="border-b border-gray-200 pb-3 last:border-b-0 last:pb-0">
                    <Link 
                      to={`/dashboard/rentees/${rentee.id}`}
                      className="font-medium text-blue-600 hover:text-blue-800"
                    >
                      {rentee.name || 'Unnamed Rentee'}
                    </Link>
                    {rentee.contact_details && (
                      <div className="mt-1 text-sm text-gray-600">
                        {rentee.contact_details.email && (
                          <div>Email: {rentee.contact_details.email}</div>
                        )}
                        {rentee.contact_details.phone && (
                          <div>Phone: {rentee.contact_details.phone}</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500">
                <p>No rentees currently associated with this property.</p>
                <div className="mt-2">
                  <Link 
                    to="/dashboard/rentees/new" 
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium inline-flex items-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Add a rentee
                  </Link>
                </div>
              </div>
            )}
          </div>
          
          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow p-6 mt-6">
            <h2 className="text-lg font-medium mb-4">Quick Actions</h2>
            
            <div className="space-y-2">
              <Link
                to={`/dashboard/agreements/new?property_id=${id}`}
                className="block w-full text-center px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Create New Agreement
              </Link>
              
              <Link
                to={`/dashboard/invoices/new?property_id=${id}`}
                className="block w-full text-center px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
              >
                Generate Invoice
              </Link>
              
              <Link
                to={`/dashboard/maintenance/new?property_id=${id}`}
                className="block w-full text-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Schedule Maintenance
              </Link>
            </div>
          </div>
        </div>
      </div>
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium mb-4">Confirm Deletion</h3>
            <p className="mb-4">
              Are you sure you want to delete this property? This action cannot be undone.
              {rentees && rentees.length > 0 && (
                <span className="block text-red-600 mt-2">
                  Warning: This property has {rentees.length} associated rentee(s).
                </span>
              )}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete Property
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PropertyDetails; 