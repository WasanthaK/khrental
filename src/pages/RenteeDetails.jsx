import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import InvitationStatusBadge from '../components/common/InvitationStatusBadge';
import InviteUserButton from '../components/common/InviteUserButton';
import InvoiceCard from '../components/invoices/InvoiceCard';
import useInvitationStatus from '../hooks/useInvitationStatus';
import { deleteAppUser, fetchAppUser, mapAppUserToRentee } from '../services/appUserService';
import { fetchProperty, fetchPropertyUnit } from '../services/agreementService';
import { isMssqlApiEnabled, requestMssqlApi } from '../services/mssqlApiClient';
import { platform as platformClient } from '../services/platformClient';
import { formatDate } from '../utils/helpers';

const getMonthlyRent = (agreement) => {
  const value = agreement?.terms?.monthlyRent ?? agreement?.rentamount;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
};

const statusClasses = (status) => {
  switch (status) {
    case 'review':
      return 'bg-blue-100 text-blue-800';
    case 'pending':
    case 'pending_signature':
    case 'pending_activation':
      return 'bg-yellow-100 text-yellow-800';
    case 'signed':
    case 'active':
      return 'bg-green-100 text-green-800';
    case 'expired':
    case 'rejected':
      return 'bg-red-100 text-red-800';
    case 'cancelled':
    case 'terminated':
      return 'bg-orange-100 text-orange-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const AgreementSummaryCard = ({ agreement }) => {
  const property = agreement.properties || agreement.property || null;
  const unit = agreement.property_units || agreement.unit || null;
  const monthlyRent = getMonthlyRent(agreement);

  return (
    <Link to={`/dashboard/agreements/${agreement.id}`} className="block">
      <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h3 className="font-medium text-gray-900">
              {property?.name || `Property ${agreement.propertyid || 'not linked'}`}
              {unit?.unitnumber && (
                <span className="ml-1 text-gray-500">(Unit {unit.unitnumber})</span>
              )}
            </h3>
            {(agreement.startdate || agreement.enddate) && (
              <p className="text-sm text-gray-500">
                {agreement.startdate ? formatDate(agreement.startdate) : 'No start date'}
                {' - '}
                {agreement.enddate ? formatDate(agreement.enddate) : 'No end date'}
              </p>
            )}
          </div>
          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusClasses(agreement.status)}`}>
            {agreement.status
              ? agreement.status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
              : 'Unknown'}
          </span>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100 text-sm space-y-1">
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">Monthly Rent:</span>
            <span className="font-medium">
              {monthlyRent === null ? 'N/A' : `$${monthlyRent.toLocaleString()}`}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">Agreement ID:</span>
            <span className="font-mono text-xs">{agreement.id}</span>
          </div>
        </div>
      </div>
    </Link>
  );
};

const loadAgreementRows = async (renteeId) => {
  if (isMssqlApiEnabled()) {
    return requestMssqlApi(`/api/mssql/agreements?renteeId=${encodeURIComponent(renteeId)}&pageSize=500`);
  }

  const { data, error } = await platformClient
    .from('agreements')
    .select('*')
    .eq('renteeid', renteeId)
    .order('createdat', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
};

const loadInvoiceRows = async (renteeId) => {
  if (isMssqlApiEnabled()) {
    return requestMssqlApi(`/api/mssql/invoices?renteeId=${encodeURIComponent(renteeId)}&pageSize=500`);
  }

  const { data, error } = await platformClient
    .from('invoices')
    .select('*')
    .eq('renteeid', renteeId)
    .order('createdat', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
};

const hydrateAgreement = async (agreement) => {
  const property = agreement.properties
    || agreement.property
    || (agreement.propertyid ? await fetchProperty(agreement.propertyid).catch(() => null) : null);

  const unit = agreement.property_units
    || agreement.unit
    || (agreement.unitid ? await fetchPropertyUnit(agreement.unitid).catch(() => null) : null);

  return {
    ...agreement,
    properties: property,
    property,
    property_units: unit,
    unit
  };
};

const hydrateInvoice = async (invoice) => {
  const property = invoice.property
    || invoice.properties
    || (invoice.propertyid ? await fetchProperty(invoice.propertyid).catch(() => null) : null);

  return {
    ...invoice,
    property,
    totalamount: invoice.amount ?? invoice.totalamount ?? 0,
    createdat: invoice.createdat || invoice.created_at,
    duedate: invoice.duedate || invoice.due_date,
    paymentdate: invoice.paymentdate || invoice.payment_date
  };
};

const RenteeDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const invitationStatus = useInvitationStatus(id, true);

  const [rentee, setRentee] = useState(null);
  const [agreements, setAgreements] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const renteeData = await fetchAppUser(id);
        if (!renteeData || renteeData.user_type !== 'rentee') {
          throw new Error('Rentee not found');
        }

        const mappedRentee = mapAppUserToRentee(renteeData);
        const [agreementRows, invoiceRows] = await Promise.all([
          loadAgreementRows(id),
          loadInvoiceRows(id)
        ]);

        const [hydratedAgreements, hydratedInvoices] = await Promise.all([
          Promise.all((agreementRows || []).map(hydrateAgreement)),
          Promise.all((invoiceRows || []).map(hydrateInvoice))
        ]);

        if (!cancelled) {
          setRentee(mappedRentee);
          setAgreements(hydratedAgreements);
          setInvoices(hydratedInvoices);
        }
      } catch (loadError) {
        console.error('Error fetching rentee details:', loadError);
        if (!cancelled) {
          setError(loadError.message || 'Failed to load rentee details');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const associatedProperties = useMemo(() => {
    const byId = new Map();

    agreements.forEach((agreement) => {
      const property = agreement.properties || agreement.property;
      if (property?.id) {
        const existing = byId.get(property.id) || { ...property, assignedUnits: [] };
        const unit = agreement.property_units || agreement.unit;
        if (unit?.id && !existing.assignedUnits.some((item) => item.id === unit.id)) {
          existing.assignedUnits.push(unit);
        }
        byId.set(property.id, existing);
      }
    });

    return [...byId.values()];
  }, [agreements]);

  const handleDelete = async () => {
    try {
      setLoading(true);
      const result = await deleteAppUser(id);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to delete rentee');
      }
      toast.success('Rentee deleted successfully');
      navigate('/dashboard/rentees');
    } catch (deleteError) {
      console.error('Error deleting rentee:', deleteError);
      toast.error(`Error deleting rentee: ${deleteError.message}`);
    } finally {
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded" role="alert">
        <strong className="font-bold">Error!</strong>
        <span className="block sm:inline"> {error}</span>
      </div>
    );
  }

  if (!rentee) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">{rentee.name}</h1>
        <div className="flex space-x-2">
          <Link
            to={`/dashboard/rentees/${id}/edit`}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
          >
            Edit
          </Link>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
          >
            Delete
          </button>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4">Confirm Deletion</h2>
            <p className="mb-6">Are you sure you want to delete {rentee.name}? This action cannot be undone.</p>
            <div className="flex justify-end space-x-2">
              <button type="button" onClick={() => setShowDeleteConfirm(false)} className="bg-gray-300 px-4 py-2 rounded">
                Cancel
              </button>
              <button type="button" onClick={handleDelete} className="bg-red-500 text-white px-4 py-2 rounded">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium mb-4">Basic Information</h2>
            <div className="space-y-4">
              <div><h3 className="text-sm font-medium text-gray-500">Name</h3><p className="mt-1">{rentee.name}</p></div>
              <div><h3 className="text-sm font-medium text-gray-500">Email</h3><p className="mt-1">{rentee.contactDetails?.email || rentee.email || 'Not provided'}</p></div>
              <div><h3 className="text-sm font-medium text-gray-500">Phone</h3><p className="mt-1">{rentee.contactDetails?.phone || 'Not provided'}</p></div>
              <div><h3 className="text-sm font-medium text-gray-500">Registration Date</h3><p className="mt-1">{formatDate(rentee.registrationDate) || 'Not available'}</p></div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Invitation Status</h3>
                <div className="mt-2 flex items-center">
                  <InvitationStatusBadge status={invitationStatus.status} />
                  {invitationStatus.status !== 'registered' && !invitationStatus.loading && (
                    <div className="ml-2">
                      <InviteUserButton userId={id} onSuccess={() => invitationStatus.refresh()} size="sm" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium mb-4">Associated Properties</h2>
            {associatedProperties.length === 0 ? (
              <p className="text-gray-500">No property linked through an agreement.</p>
            ) : (
              <div className="space-y-3">
                {associatedProperties.map((property) => (
                  <Link key={property.id} to={`/dashboard/properties/${property.id}`} className="block border rounded p-3 hover:bg-gray-50">
                    <div className="font-medium">{property.name || property.address || property.id}</div>
                    {property.address && <div className="text-sm text-gray-500">{property.address}</div>}
                    {property.assignedUnits.length > 0 && (
                      <div className="text-sm text-gray-600 mt-1">
                        Units: {property.assignedUnits.map((unit) => unit.unitnumber || unit.id).join(', ')}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white shadow-md rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Agreements</h2>
            {agreements.length === 0 ? (
              <p className="text-gray-500">No agreements found for this rentee.</p>
            ) : (
              <div className="space-y-4">
                {agreements.map((agreement) => (
                  <AgreementSummaryCard key={agreement.id} agreement={agreement} />
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium mb-4">Invoices</h2>
            {invoices.length === 0 ? (
              <p className="text-gray-500">No invoices found for this rentee.</p>
            ) : (
              <div className="space-y-6">
                {invoices.map((invoice) => (
                  <InvoiceCard key={invoice.id} invoice={invoice} rentee={rentee} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RenteeDetails;
