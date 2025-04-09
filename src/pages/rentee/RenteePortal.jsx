import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { formatCurrency, formatDate } from '../../utils/helpers';

const RenteePortal = () => {
  const { user } = useAuth();
  const [renteeData, setRenteeData] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const dataFetched = useRef(false);

  useEffect(() => {
    // Skip if data has already been fetched or user is not available
    if (dataFetched.current || !user) {
      return;
    }
    
    // Set dataFetched to true immediately to prevent multiple fetches
    dataFetched.current = true;
    
    const fetchRenteeData = async () => {
      try {
        setLoading(true);
        
        // For development bypass user, create mock data
        if (process.env.NODE_ENV !== 'production' && user.id === 'dev-user-id') {
          // Create mock rentee data
          const mockRentee = {
            id: 'mock-rentee-id',
            name: 'Development Rentee',
            email: user.email,
            propertyName: 'Mock Property',
            propertyAddress: '123 Development St, Test City',
            rent: 50000,
            leaseStartDate: new Date().toISOString(),
            associatedPropertyIds: ['mock-property-id']
          };
          
          // Create mock invoices
          const mockInvoices = [
            {
              id: 'mock-invoice-1',
              renteeId: 'mock-rentee-id',
              propertyId: 'mock-property-id',
              billingPeriod: 'May 2023',
              totalAmount: 52000,
              status: 'paid',
              createdat: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
              id: 'mock-invoice-2',
              renteeId: 'mock-rentee-id',
              propertyId: 'mock-property-id',
              billingPeriod: 'June 2023',
              totalAmount: 52000,
              status: 'pending',
              createdat: new Date().toISOString()
            }
          ];
          
          // Create mock agreements
          const mockAgreements = [
            {
              id: 'mock-agreement-1',
              renteeId: 'mock-rentee-id',
              propertyId: 'mock-property-id',
              status: 'signed',
              startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
              endDate: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000).toISOString(),
              createdat: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
            }
          ];
          
          setRenteeData(mockRentee);
          setInvoices(mockInvoices);
          setAgreements(mockAgreements);
          setLoading(false);
          return;
        }
        
        // For real users, fetch data from the database
        // Fetch rentee profile from app_users table
        const { data: renteeData, error: renteeError } = await supabase
          .from('app_users')
          .select('*')
          .eq('auth_id', user.id)
          .single();
        
        if (renteeError) {
          throw renteeError;
        }
        
        if (renteeData && renteeData.user_type === 'rentee') {
          const renteeId = renteeData.id;
          
          // Prepare for property fetching
          let propertyIds = [];
          let structuredAssociations = [];
          
          // Check if we have structured associations
          if (renteeData.associated_properties && Array.isArray(renteeData.associated_properties) && renteeData.associated_properties.length > 0) {
            structuredAssociations = renteeData.associated_properties;
            // Extract unique property IDs from structured associations
            propertyIds = [...new Set(structuredAssociations.map(assoc => assoc.propertyId))];
          } 
          // Fall back to legacy format if needed
          else if (renteeData.associated_property_ids && renteeData.associated_property_ids.length > 0) {
            propertyIds = renteeData.associated_property_ids;
            // Convert legacy format to structured for internal use
            structuredAssociations = propertyIds.map(id => ({ propertyId: id, unitId: null }));
          }
          
          // Fetch associated properties with their units
          let associatedProperties = [];
          if (propertyIds.length > 0) {
            const { data: propertiesData, error: propertiesError } = await supabase
              .from('properties')
              .select(`
                *,
                property_units(*)
              `)
              .in('id', propertyIds);
            
            if (propertiesError) {
              throw propertiesError;
            }
            
            if (propertiesData && propertiesData.length > 0) {
              // For each property, get the associated units if it's an apartment
              associatedProperties = await Promise.all(propertiesData.map(async (property) => {
                const propertyItem = {
                  id: property.id,
                  name: property.name || 'Unnamed Property',
                  address: property.address,
                  rent: property.rentalvalues?.rent || 0,
                  propertytype: property.propertytype || 'residential',
                  units: property.property_units || []
                };
                
                // Get the unit associations for this property
                const unitAssociations = structuredAssociations
                  .filter(assoc => assoc.propertyId === property.id && assoc.unitId)
                  .map(assoc => assoc.unitId);
                
                // If it's an apartment and has unit associations, attach them
                if (property.propertytype === 'apartment' && unitAssociations.length > 0) {
                  const associatedUnits = property.property_units
                    ? property.property_units.filter(unit => unitAssociations.includes(unit.id))
                    : [];
                  
                  propertyItem.associatedUnits = associatedUnits;
                  
                  // If there's an associated unit, use its rental value if available
                  if (associatedUnits.length > 0 && associatedUnits[0].rentalvalues?.rent) {
                    propertyItem.rent = associatedUnits[0].rentalvalues.rent;
                  }
                }
                
                return propertyItem;
              }));
            }
          }
          
          // Format rentee data
          const formattedRentee = {
            id: renteeData.id,
            name: renteeData.name,
            email: renteeData.email,
            properties: associatedProperties,
            associatedPropertyIds: renteeData.associated_property_ids || [],
            structuredAssociations: structuredAssociations
          };
          
          setRenteeData(formattedRentee);
          
          // Fetch rentee's invoices
          const { data: invoicesData, error: invoicesError } = await supabase
            .from('invoices')
            .select('*')
            .eq('renteeid', renteeId)
            .order('createdat', { ascending: false });
          
          if (invoicesError) {
            throw invoicesError;
          }
          setInvoices(invoicesData || []);
          
          // Fetch rentee's agreements
          const { data: agreementsData, error: agreementsError } = await supabase
            .from('agreements')
            .select('*')
            .eq('renteeid', renteeId)
            .order('createdat', { ascending: false });
          
          if (agreementsError) {
            throw agreementsError;
          }
          setAgreements(agreementsData || []);
        } else {
          throw new Error('User is not a rentee');
        }
      } catch (error) {
        console.error('Error fetching rentee data:', error.message);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchRenteeData();
  }, [user]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading your data...</div>
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

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Welcome, {renteeData?.name || user.email}</h1>
      
      {/* Property Information */}
      {renteeData?.properties?.length > 0 ? (
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Your Rental {renteeData.properties.length > 1 ? 'Properties' : 'Property'}</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {renteeData.properties.map(property => (
              <div key={property.id} className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <h3 className="font-medium text-gray-900">{property.name}</h3>
                  <p className="text-sm text-gray-500">{property.address}</p>
                </div>
                
                <div className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Type:</span>
                      <span className="text-gray-900 font-medium capitalize">{property.propertytype}</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Rent:</span>
                      <span className="text-gray-900 font-medium">{formatCurrency(property.rent || 0)}</span>
                    </div>
                    
                    {/* Show unit information for apartments */}
                    {property.propertytype === 'apartment' && property.associatedUnits && property.associatedUnits.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Your Unit</h4>
                        
                        {property.associatedUnits.map(unit => (
                          <div key={unit.id} className="bg-blue-50 border border-blue-100 rounded-md p-3">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-600">Unit Number:</span>
                              <span className="text-gray-900 font-medium">{unit.unitnumber}</span>
                            </div>
                            {unit.floor && (
                              <div className="flex items-center justify-between text-sm mt-1">
                                <span className="text-gray-600">Floor:</span>
                                <span className="text-gray-900">{unit.floor}</span>
                              </div>
                            )}
                            {unit.bedrooms && (
                              <div className="flex items-center justify-between text-sm mt-1">
                                <span className="text-gray-600">Bedrooms:</span>
                                <span className="text-gray-900">{unit.bedrooms}</span>
                              </div>
                            )}
                            {unit.bathrooms && (
                              <div className="flex items-center justify-between text-sm mt-1">
                                <span className="text-gray-600">Bathrooms:</span>
                                <span className="text-gray-900">{unit.bathrooms}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded mb-8">
          No properties are currently associated with your account.
        </div>
      )}
      
      {/* Recent Invoices */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Recent Invoices</h2>
          <Link
            to="/portal/invoices"
            className="text-blue-600 hover:text-blue-800"
          >
            View All
          </Link>
        </div>
        
        {invoices.length > 0 ? (
          <div className="space-y-4">
            {invoices.slice(0, 3).map(invoice => (
              <div
                key={invoice.id}
                className="flex justify-between items-center p-4 border rounded hover:bg-gray-50"
              >
                <div>
                  <p className="font-medium">{invoice.billingperiod}</p>
                  <p className="text-sm text-gray-500">
                    {formatDate(invoice.createdat)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{formatCurrency(invoice.totalamount)}</p>
                  <p className={`text-sm ${
                    invoice.status === 'paid' ? 'text-green-600' : 'text-yellow-600'
                  }`}>
                    {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No invoices found.</p>
        )}
      </div>
      
      {/* Recent Agreements */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Recent Agreements</h2>
          <Link
            to="/portal/agreements"
            className="text-blue-600 hover:text-blue-800"
          >
            View All
          </Link>
        </div>
        
        {agreements.length > 0 ? (
          <div className="space-y-4">
            {agreements.slice(0, 3).map(agreement => (
              <div
                key={agreement.id}
                className="flex justify-between items-center p-4 border rounded hover:bg-gray-50"
              >
                <div>
                  <p className="font-medium">
                    {formatDate(agreement.startdate)} - {formatDate(agreement.enddate)}
                  </p>
                  <p className="text-sm text-gray-500">
                    Created on {formatDate(agreement.createdat)}
                  </p>
                </div>
                <div>
                  <span className={`px-2 py-1 rounded text-sm ${
                    agreement.status === 'signed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {agreement.status.charAt(0).toUpperCase() + agreement.status.slice(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No agreements found.</p>
        )}
      </div>
    </div>
  );
};

export default RenteePortal; 