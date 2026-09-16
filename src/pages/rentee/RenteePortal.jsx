import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyTenancySummary, platform as platformClient } from '../../services/platformClient';
import { useAuth } from '../../hooks/useAuth';
import { isDevBypassEnabled } from '../../utils/env';
import { formatCurrency, formatDate } from '../../utils/helpers';
import { findAppUserByAuthId } from '../../services/appUserService';

const DEV_BYPASS_ENABLED = isDevBypassEnabled();

const RenteePortal = () => {
  const { user, activeTenantId } = useAuth();
  const [renteeData, setRenteeData] = useState(null);
  const [tenancies, setTenancies] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const dataFetched = useRef(false);

  useEffect(() => {
    dataFetched.current = false;
    setRenteeData(null);
    setTenancies([]);
    setInvoices([]);
    setAgreements([]);
    setError(null);

    if (dataFetched.current || !user) {
      return;
    }

    dataFetched.current = true;

    const fetchRenteeData = async () => {
      try {
        setLoading(true);

        if (DEV_BYPASS_ENABLED && user.id === 'dev-user-id') {
          setRenteeData({
            id: 'mock-rentee-id',
            name: 'Development Tenant',
            email: user.email
          });
          setTenancies([{
            agreement_id: 'mock-agreement-1',
            agreement_status: 'active',
            property_id: 'mock-property-id',
            property_name: 'Mock Property',
            property_address: '123 Development St, Test City',
            property_type: 'residential',
            rentamount: 50000,
            startdate: new Date().toISOString(),
            enddate: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000).toISOString()
          }]);
          setInvoices([]);
          setAgreements([]);
          setLoading(false);
          return;
        }

        const renteeLookup = await findAppUserByAuthId(user.id);
        if (!renteeLookup.success) {
          throw new Error(renteeLookup.error || 'Failed to load tenant profile');
        }

        const profile = renteeLookup.data;
        if (!profile || profile.user_type !== 'rentee') {
          throw new Error('User is not a tenant');
        }

        setRenteeData({
          id: profile.id,
          name: profile.name,
          email: profile.email
        });

        const tenancyResult = await getMyTenancySummary();
        if (tenancyResult.error) {
          throw tenancyResult.error;
        }
        setTenancies(tenancyResult.data?.tenancies || []);

        const { data: invoicesData, error: invoicesError } = await platformClient
          .from('invoices')
          .select('*')
          .eq('renteeid', profile.id)
          .order('createdat', { ascending: false });

        if (invoicesError) {
          throw invoicesError;
        }
        setInvoices(invoicesData || []);

        const { data: agreementsData, error: agreementsError } = await platformClient
          .from('agreements')
          .select('*')
          .eq('renteeid', profile.id)
          .order('createdat', { ascending: false });

        if (agreementsError) {
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
  }, [user?.id, activeTenantId]);

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

      {tenancies.length > 0 ? (
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Your Active {tenancies.length > 1 ? 'Tenancies' : 'Tenancy'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tenancies.map((tenancy) => (
              <div key={tenancy.agreement_id} className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-gray-900">{tenancy.property_name || 'Rental property'}</h3>
                      <p className="text-sm text-gray-500">{tenancy.property_address}</p>
                    </div>
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Active</span>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Type:</span>
                    <span className="text-gray-900 font-medium capitalize">{tenancy.property_type || 'residential'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Rent:</span>
                    <span className="text-gray-900 font-medium">{formatCurrency(tenancy.rentamount || 0)}</span>
                  </div>
                  {tenancy.unit_id && (
                    <div className="bg-blue-50 border border-blue-100 rounded-md p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Unit:</span>
                        <span className="text-gray-900 font-medium">{tenancy.unit_number}</span>
                      </div>
                      {tenancy.unit_floor && (
                        <div className="flex items-center justify-between text-sm mt-1">
                          <span className="text-gray-600">Floor:</span>
                          <span className="text-gray-900">{tenancy.unit_floor}</span>
                        </div>
                      )}
                      {tenancy.unit_bedrooms && (
                        <div className="flex items-center justify-between text-sm mt-1">
                          <span className="text-gray-600">Bedrooms:</span>
                          <span className="text-gray-900">{tenancy.unit_bedrooms}</span>
                        </div>
                      )}
                      {tenancy.unit_bathrooms && (
                        <div className="flex items-center justify-between text-sm mt-1">
                          <span className="text-gray-600">Bathrooms:</span>
                          <span className="text-gray-900">{tenancy.unit_bathrooms}</span>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="pt-3 border-t text-sm text-gray-600">
                    {formatDate(tenancy.startdate)} - {formatDate(tenancy.enddate)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded mb-8">
          No active tenancy is currently linked to your account. If you are moving in, your onboarding may still be in progress.
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Recent Invoices</h2>
          <Link to="/rentee/invoices" className="text-blue-600 hover:text-blue-800">View All</Link>
        </div>

        {invoices.length > 0 ? (
          <div className="space-y-4">
            {invoices.slice(0, 3).map(invoice => (
              <div key={invoice.id} className="flex justify-between items-center p-4 border rounded hover:bg-gray-50">
                <div>
                  <p className="font-medium">{invoice.billingperiod}</p>
                  <p className="text-sm text-gray-500">{formatDate(invoice.createdat)}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{formatCurrency(invoice.totalamount)}</p>
                  <p className={`text-sm ${invoice.status === 'paid' ? 'text-green-600' : 'text-yellow-600'}`}>
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

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Recent Agreements</h2>
          <Link to="/rentee/agreements" className="text-blue-600 hover:text-blue-800">View All</Link>
        </div>

        {agreements.length > 0 ? (
          <div className="space-y-4">
            {agreements.slice(0, 3).map(agreement => (
              <div key={agreement.id} className="flex justify-between items-center p-4 border rounded hover:bg-gray-50">
                <div>
                  <p className="font-medium">{formatDate(agreement.startdate)} - {formatDate(agreement.enddate)}</p>
                  <p className="text-sm text-gray-500">Created on {formatDate(agreement.createdat)}</p>
                </div>
                <div>
                  <span className={`px-2 py-1 rounded text-sm ${agreement.status === 'active' || agreement.status === 'signed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
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
