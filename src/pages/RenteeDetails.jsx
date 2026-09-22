import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { platform as platformClient } from '../services/platformClient';
import { formatDate } from '../utils/helpers';
import { toast } from 'react-toastify';
import InvitationStatusBadge from '../components/common/InvitationStatusBadge';
import useInvitationStatus from '../hooks/useInvitationStatus';
import InviteUserButton from '../components/common/InviteUserButton';
import AgreementCard from '../components/agreements/AgreementCard';
import InvoiceCard from '../components/invoices/InvoiceCard';
import { mapAppUserToRentee } from '../services/appUserService';
import { getRentee, updateRentee } from '../services/renteeService';

// Custom component for displaying agreements in RenteeDetails page
const AgreementSummaryCard = ({ agreement, property, rentee }) => {
  const formattedStartDate = formatDate(agreement.startdate);
  const formattedEndDate = formatDate(agreement.enddate);
  const hasUnit = agreement.unitid && agreement.unit;

  return (
    <Link to={`/dashboard/agreements/${agreement.id}`} className="block">
      <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-medium text-gray-900">
              {property ? property.name : 'Unnamed Property'}
              {hasUnit && <span className="ml-1 text-gray-500">(Unit {agreement.unit.unitnumber})</span>}
            </h3>
            {formattedStartDate && formattedEndDate && (
              <p className="text-sm text-gray-500">
                {formattedStartDate} - {formattedEndDate}
              </p>
            )}
          </div>
          <div>
            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
              agreement.status === 'draft' ? 'bg-gray-100 text-gray-800' :
              agreement.status === 'pending_signature' ? 'bg-yellow-100 text-yellow-800' :
              agreement.status === 'signed' ? 'bg-green-100 text-green-800' :
              agreement.status === 'expired' ? 'bg-red-100 text-red-800' :
              agreement.status === 'review' ? 'bg-blue-100 text-blue-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {agreement.status ? agreement.status.replace(/_/g, ' ').charAt(0).toUpperCase() + agreement.status.replace(/_/g, ' ').slice(1) : 'Unknown'}
            </span>
          </div>
        </div>

        <div className="mt-2 pt-2 border-t border-gray-100 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Monthly Rent:</span>
            <span className="font-medium">
              ${agreement.terms?.monthlyRent ? Number(agreement.terms.monthlyRent).toLocaleString() : 'N/A'}
            </span>
          </div>
          {agreement.signeddate && (
            <div className="flex justify-between mt-1">
              <span className="text-gray-500">Signed Date:</span>
              <span className="font-medium">{formatDate(agreement.signeddate)}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

// Custom PropertyCard component for RenteeDetails
const RenteePropertyCard = ({ property }) => {
  const isApartment = property.propertytype === 'apartment';
  const hasAssignedUnits = isApartment && property.assignedUnits && property.assignedUnits.length > 0;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
      <Link to={`/dashboard/properties/${property.id}`} className="block">
        <div className="relative h-40 bg-gray-100">
          {property.images && property.images.length > 0 ? (
            <img
              src={property.images[0]}
              alt={property.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-200">
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          )}
          <div className="absolute top-2 right-2">
            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
              property.status === 'available' ? 'bg-green-100 text-green-800' :
              property.status === 'rented' ? 'bg-blue-100 text-blue-800' :
              property.status === 'maintenance' ? 'bg-yellow-100 text-yellow-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {property.status.charAt(0).toUpperCase() + property.status.slice(1)}
            </span>
          </div>
        </div>

        <div className="p-4">
          <h3 className="font-semibold text-lg mb-1 text-gray-900">{property.name}</h3>
          <p className="text-sm text-gray-600 mb-2">{property.address}</p>

          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-900">
              ${property.rentalvalues?.rent ? property.rentalvalues.rent.toLocaleString() : '0'}/month
            </span>
            <span className="text-xs px-2 py-1 bg-gray-100 rounded-full text-gray-700">
              {property.propertytype || 'Residential'}
            </span>
          </div>

          {isApartment && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                {hasAssignedUnits ? 'Assigned Units:' : 'No Units Assigned'}
              </h4>

              {hasAssignedUnits && (
                <div className="flex flex-wrap gap-2">
                  {property.assignedUnits.map((unit) => (
                    <span
                      key={unit.id}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                    >
                      Unit {unit.unitnumber}
                      {unit.status && (
                        <span
                          className="ml-1 w-2 h-2 rounded-full inline-block"
                          style={{
                            backgroundColor: unit.status === 'occupied' ? '#4f46e5'
                              : unit.status === 'available' ? '#10b981' : '#d97706'
                          }}
                        />
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Link>
    </div>
  );
};

const RenteeDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [rentee, setRentee] = useState(null);
  const [properties, setProperties] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);

  const invitationStatus = useInvitationStatus(rentee?.active === false ? null : id);

  const checkInvitationStatus = () => {
    invitationStatus.refresh();
  };

  useEffect(() => {
    const fetchRenteeData = async () => {
      try {
        setLoading(true);

        // The renter identity and organization membership are loaded from the
        // canonical tenant-scoped MSSQL endpoint. Structured property/unit
        // assignments come from that same server projection, never sessionStorage.
        const renteeData = await getRentee(id);

        if (!renteeData) {
          throw new Error('Tenant not found');
        }

        const renteeInfo = {
          ...mapAppUserToRentee(renteeData),
          structuredAssociations: renteeData.associated_properties || []
        };

        setRentee(renteeInfo);

        let propertyIds = [];

        if (renteeInfo.structuredAssociations.length > 0) {
          propertyIds = [...new Set(renteeInfo.structuredAssociations.map((association) => (
            association.propertyId || association.propertyid
          )).filter(Boolean))];
        } else if (renteeInfo.associatedPropertyIds?.length > 0) {
          propertyIds = renteeInfo.associatedPropertyIds;
        }

        if (propertyIds.length > 0) {
          const { data: propertiesData, error: propertiesError } = await platformClient
            .from('properties')
            .select(`
              *,
              property_units(*)
            `)
            .in('id', propertyIds);

          if (propertiesError) {
            throw propertiesError;
          }

          const associatedProperties = await Promise.all(propertiesData.map(async (property) => {
            const propertyItem = {
              id: property.id,
              name: property.name || property.address || 'Unnamed Property',
              address: property.address || '',
              propertytype: property.propertytype || property.type || 'Residential',
              status: property.status || 'available',
              images: property.images || [],
              rentalvalues: property.rentalvalues || { rent: 0 },
              unitconfiguration: property.unitconfiguration || property.type || '',
              description: property.description || 'No description available',
              amenities: property.amenities || [],
              units: property.property_units || []
            };

            if (property.propertytype === 'apartment') {
              const associatedUnits = renteeInfo.structuredAssociations
                .filter((association) => String(association.propertyId || association.propertyid) === String(property.id))
                .map((association) => association.unitId || association.unitid)
                .filter(Boolean);

              if (associatedUnits.length > 0) {
                const { data: unitData, error: unitError } = await platformClient
                  .from('property_units')
                  .select('*')
                  .in('id', associatedUnits);

                if (!unitError && unitData) {
                  propertyItem.assignedUnits = unitData;
                } else {
                  console.error('Error fetching unit details:', unitError);
                  propertyItem.assignedUnits = [];
                }
              } else {
                propertyItem.assignedUnits = [];
              }
            }

            return propertyItem;
          }));

          setProperties(associatedProperties);
        } else {
          setProperties([]);
        }

        const { data: invoicesData, error: invoicesError } = await platformClient
          .from('invoices')
          .select(`
            *,
            property:propertyid (
              id,
              name,
              address
            )
          `)
          .eq('renteeid', id);

        if (invoicesError) {
          console.error('Error fetching invoices:', invoicesError);
          throw invoicesError;
        }

        const formattedInvoices = invoicesData.map((invoice) => ({
          id: invoice.id,
          status: invoice.status || 'pending',
          createdat: invoice.createdat || invoice.created_at || new Date().toISOString(),
          totalamount: invoice.amount || invoice.totalamount || 0,
          billingperiod: invoice.billingperiod || `${formatDate(invoice.startdate || invoice.createdat)} - ${formatDate(invoice.duedate || invoice.due_date)}`,
          duedate: invoice.duedate || invoice.due_date,
          paymentdate: invoice.paymentdate || invoice.payment_date,
          property: invoice.property,
          propertyid: invoice.propertyid
        }));

        setInvoices(formattedInvoices || []);

        const { data: agreementsData, error: agreementsError } = await platformClient
          .from('agreements')
          .select(`
            *,
            properties:propertyid (
              id,
              name,
              address
            ),
            unit:unitid (
              id,
              unitnumber
            )
          `)
          .eq('renteeid', id)
          .order('createdat', { ascending: false });

        if (agreementsError) {
          console.error('Error fetching agreements:', agreementsError);
          throw agreementsError;
        }

        setAgreements(agreementsData || []);
      } catch (fetchError) {
        console.error('Error fetching tenant data:', fetchError.message);
        setError(fetchError.message);
      } finally {
        setLoading(false);
      }
    };

    fetchRenteeData();
  }, [id]);

  const handleDeactivate = async () => {
    try {
      setLoading(true);
      await updateRentee(id, { status: 'inactive' });
      toast.success('Tenant deactivated for this organization.');
      navigate('/dashboard/rentees');
    } catch (deactivateError) {
      console.error('Error deactivating tenant:', deactivateError.message);
      setError(deactivateError.message);
      toast.error(`Error deactivating tenant: ${deactivateError.message}`);
    } finally {
      setLoading(false);
      setShowDeactivateConfirm(false);
    }
  };

  const handleInviteSuccess = () => {
    checkInvitationStatus();
    toast.success('Invitation sent successfully');
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
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

  if (!rentee) {
    return (
      <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded relative" role="alert">
        <strong className="font-bold">Not Found!</strong>
        <span className="block sm:inline"> The requested tenant could not be found.</span>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold">{rentee.name}</h1>
          <span className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
            rentee.active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'
          }`}>
            {rentee.active ? 'Active Tenant' : 'Inactive Tenant'}
          </span>
        </div>
        <div className="flex space-x-2">
          <Link
            to={`/dashboard/rentees/${id}/edit`}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
          >
            Edit
          </Link>
          {rentee.active && (
            <button
              onClick={() => setShowDeactivateConfirm(true)}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
            >
              Deactivate
            </button>
          )}
        </div>
      </div>

      {showDeactivateConfirm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4">Deactivate Tenant</h2>
            <p className="mb-6">
              Deactivate {rentee.name} for this organization? Their global KH Rentals identity and relationships with other organizations will not be deleted.
            </p>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowDeactivateConfirm(false)}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleDeactivate}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`lg:col-span-1 ${properties.length === 0 ? 'lg:col-span-2' : ''}`}>
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-medium mb-4">Basic Information</h2>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-500">Name</h3>
                <p className="mt-1">{rentee.name}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500">Email</h3>
                <p className="mt-1">{rentee.contactDetails?.email || 'Not provided'}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500">Phone</h3>
                <p className="mt-1">{rentee.contactDetails?.phone || 'Not provided'}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500">Registration Date</h3>
                <p className="mt-1">{formatDate(rentee.registrationDate) || 'Not available'}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500">ID Copy</h3>
                <p className="mt-1">
                  {rentee.idCopyUrl ? (
                    <a
                      href={rentee.idCopyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-600"
                    >
                      View ID Copy
                    </a>
                  ) : (
                    'Not uploaded'
                  )}
                </p>
              </div>

              {rentee.active && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Invitation Status</h3>
                  <div className="mt-2 flex items-center">
                    <InvitationStatusBadge status={invitationStatus.status} />

                    {invitationStatus.status !== 'registered' && !invitationStatus.loading && (
                      <div className="ml-2">
                        <InviteUserButton
                          userId={id}
                          invitationStatus={invitationStatus.status}
                          onSuccess={handleInviteSuccess}
                          size="sm"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {properties.length > 0 && (
          <div className="lg:col-span-1">
            <div className="bg-white shadow-md rounded-lg p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Associated Properties</h2>
              <div className="space-y-6">
                {properties.map((property) => (
                  <RenteePropertyCard
                    key={property.id}
                    property={property}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="lg:col-span-1">
          <div className="bg-white shadow-md rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Agreements</h2>

            {agreements.length === 0 ? (
              <p className="text-gray-500">No agreements found for this tenant.</p>
            ) : (
              <div className="space-y-6">
                {agreements.map((agreement) => (
                  <AgreementSummaryCard
                    key={agreement.id}
                    agreement={agreement}
                    property={agreement.properties}
                    rentee={rentee}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium mb-4">Invoices</h2>

            {invoices.length > 0 ? (
              <div className="space-y-6">
                {invoices.map((invoice) => (
                  <InvoiceCard
                    key={invoice.id}
                    invoice={invoice}
                    rentee={rentee}
                  />
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No invoices found for this tenant.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RenteeDetails;
