import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { UTILITY_TYPES } from '../../utils/constants';
import { formatCurrency, formatDate } from '../../utils/helpers';
import { toast } from 'react-hot-toast';
import { calculateUtilityAmount } from '../../services/utilityBillingService';

const RenteeUtilities = () => {
  const { user } = useAuth();
  const [recentReadings, setRecentReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchRecentReadings();
  }, []);

  const fetchRecentReadings = async () => {
    try {
      setLoading(true);
      setError(null);

      // First get the app_user details for the current auth user
      const { data: appUserData, error: appUserError } = await supabase
        .from('app_users')
        .select('*')
        .eq('auth_id', user.id)
        .single();

      if (appUserError) {
        throw appUserError;
      }

      if (!appUserData) {
        throw new Error('User profile not found');
      }

      // Fetch recent utility readings with property rates for proper amount calculation
      const { data: readingsData, error: readingsError } = await supabase
        .from('utility_readings')
        .select(`
          *,
          properties!propertyid (
            id,
            name,
            electricity_rate,
            water_rate
          )
        `)
        .eq('renteeid', appUserData.id)
        .order('readingdate', { ascending: false })
        .limit(5);

      if (readingsError) {
        throw readingsError;
      }

      // If we have readings, fetch their associated invoices
      if (readingsData && readingsData.length > 0) {
        // Instead of trying to query by billing_ids directly (which fails with JSON error)
        // We fetch all recent invoices for this rentee and match them client-side
        const { data: invoiceData, error: invoiceError } = await supabase
          .from('invoices')
          .select('*')
          .eq('renteeid', appUserData.id)
          .order('createdat', { ascending: false })
          .limit(10);
          
        if (invoiceError) {
          console.error('Error fetching invoices:', invoiceError);
          // Continue without invoices
        }
        
        if (invoiceData && invoiceData.length > 0) {
          // Associate invoices with readings using a more robust approach
          readingsData.forEach(reading => {
            // Try to find matching invoice by checking components
            const matchingInvoice = invoiceData.find(invoice => {
              // Check if billing_ids exists and contains this reading ID
              if (invoice.components && typeof invoice.components === 'object') {
                // Handle different possible formats of components
                if (Array.isArray(invoice.components.billing_ids)) {
                  return invoice.components.billing_ids.includes(reading.id);
                } else if (invoice.components.utility_readings) {
                  return invoice.components.utility_readings.includes(reading.id);
                }
              }
              return false;
            });
            
            if (matchingInvoice) {
              reading.invoice = matchingInvoice;
            }
          });
        }
      }
      
      setRecentReadings(readingsData || []);
    } catch (err) {
      console.error('Error fetching recent readings:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
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

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Utilities</h1>
        <div className="flex gap-4">
          <Link
            to="/rentee/utilities/submit"
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Submit New Reading
          </Link>
          <Link
            to="/rentee/utilities/history"
            className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            View History
          </Link>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium mb-4">Electricity</h2>
          <p className="text-gray-600 mb-4">Submit your electricity meter readings and view your consumption history.</p>
          <Link
            to="/rentee/utilities/submit"
            className="text-blue-600 hover:text-blue-800"
          >
            Submit Reading →
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium mb-4">Water</h2>
          <p className="text-gray-600 mb-4">Track your water usage and submit meter readings for billing.</p>
          <Link
            to="/rentee/utilities/submit"
            className="text-blue-600 hover:text-blue-800"
          >
            Submit Reading →
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium mb-4">Billing History</h2>
          <p className="text-gray-600 mb-4">View your past utility bills and payment history.</p>
          <Link
            to="/rentee/utilities/history"
            className="text-blue-600 hover:text-blue-800"
          >
            View History →
          </Link>
        </div>
      </div>

      {/* Recent Readings */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-medium">Recent Readings</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reading
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Consumption
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Invoice
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Photo
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {recentReadings.map((reading) => (
                <tr key={reading.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(reading.readingdate)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {reading.utilitytype}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {reading.currentreading}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {(reading.currentreading - (reading.previousreading || 0)).toFixed(2)} 
                    {reading.utilitytype === UTILITY_TYPES.ELECTRICITY ? ' kWh' : ' m³'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {/* Status column with colored indicators */}
                    {reading.billing_data?.effective_status === 'rejected' || reading.billing_status === 'rejected' ? (
                      <span className="px-2 py-1 rounded-full bg-red-100 text-red-800 text-xs font-medium">
                        Rejected
                      </span>
                    ) : reading.billing_data?.effective_status === 'approved' || reading.status === 'approved' ? (
                      <span className="px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs font-medium">
                        Approved
                      </span>
                    ) : reading.billing_data?.effective_status === 'pending_invoice' || reading.billing_status === 'pending_invoice' ? (
                      <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
                        Processed
                      </span>
                    ) : reading.billing_status === 'invoiced' ? (
                      <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-800 text-xs font-medium">
                        Invoiced
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {reading.invoice ? (
                      <div>
                        <div className="text-sm text-gray-900">
                          Amount: {formatCurrency(reading.invoice.totalamount)}
                        </div>
                        <div className="text-sm text-gray-500">
                          Due: {formatDate(reading.invoice.duedate)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">No invoice</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex justify-end">
                      <button
                        className="inline-flex items-center px-3 py-1 border border-blue-300 text-sm leading-4 font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        onClick={() => window.open(reading.photourl, '_blank')}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        VIEW
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {recentReadings.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-6 py-4 text-center text-sm text-gray-500">
                    No recent readings found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RenteeUtilities; 