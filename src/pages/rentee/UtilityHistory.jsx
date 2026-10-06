import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { platform as platformClient } from '../../services/platformClient';
import { UTILITY_TYPES } from '../../utils/constants';
import { formatCurrency } from '../../utils/helpers';
import { calculateUtilityAmount } from '../../services/utilityBillingService';
import { useAuth } from '../../hooks/useAuth';

const UtilityHistory = () => {
  const { user: authUser, activeTenantId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [readings, setReadings] = useState([]);
  const [selectedReading, setSelectedReading] = useState(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [filter, setFilter] = useState({
    utilityType: UTILITY_TYPES.ELECTRICITY
  });
  const [user, setUser] = useState(null);
  const [property, setProperty] = useState(null);

  useEffect(() => {
    const fetchUserAndProperty = async () => {
      try {
        setUser(null);
        setProperty(null);
        setReadings([]);

        const appUserId = authUser?.profileId || authUser?.appUserId || null;
        if (!appUserId) {
          throw new Error('Failed to load user data');
        }

        setUser({ ...authUser, appUserId });

        const { data: propertyData, error: propertyError } = await platformClient
          .from('properties')
          .select('*')
          .limit(1)
          .maybeSingle();

        if (propertyError) throw propertyError;
        setProperty(propertyData || null);
      } catch (error) {
        console.error('Error fetching user data:', error);
        toast.error('Failed to load user data');
      }
    };

    fetchUserAndProperty();
  }, [activeTenantId, authUser?.id, authUser?.profileId]);

  useEffect(() => {
    if (user && property) {
      fetchReadings();
    }
  }, [user, property, filter]);

  // Modify the fetchReadings function to also fetch property data for rate calculations
  const fetchReadings = async () => {
    try {
      setLoading(true);
      const { data, error } = await platformClient
        .from('utility_readings')
        .select(`
          *,
          properties!propertyid (
            id,
            name,
            electricity_rate,
            water_rate
          ),
          invoices (
            id,
            status,
            totalamount,
            duedate
          )
        `)
        .eq('renteeid', user.appUserId || user.id)
        .eq('propertyid', property.id)
        .eq('utilitytype', filter.utilityType)
        .order('readingdate', { ascending: false });

      if (error) throw error;
      setReadings(data || []);
    } catch (error) {
      console.error('Error fetching readings:', error);
      toast.error('Failed to load utility readings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Utility Reading History</h1>
        
        {/* Utility Type Filter */}
        <select
          value={filter.utilityType}
          onChange={(e) => setFilter(prev => ({ ...prev, utilityType: e.target.value }))}
          className="p-2 border rounded-md"
          disabled={loading}
        >
          <option value={UTILITY_TYPES.ELECTRICITY}>Electricity</option>
          <option value={UTILITY_TYPES.WATER}>Water</option>
        </select>
      </div>

      {/* Readings Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reading Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Previous Reading
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Current Reading
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Consumption
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Unit Rate
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Invoice
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {readings.map((reading) => (
              <tr key={reading.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(reading.readingdate).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {reading.previousreading}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {reading.currentreading}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {(reading.currentreading - (reading.previousreading || 0)).toFixed(2)} {reading.utilitytype === UTILITY_TYPES.ELECTRICITY ? 'kWh' : 'm³'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {reading.utilitytype === UTILITY_TYPES.ELECTRICITY 
                    ? formatCurrency(reading.properties?.electricity_rate || 0) + '/kWh'
                    : formatCurrency(reading.properties?.water_rate || 0) + '/m³'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    // First check for invoiced status
                    reading.billing_status === 'invoiced' || reading.billing_data?.billing_status === 'invoiced'
                      ? 'bg-green-100 text-green-800' :
                    // Check the effective status in billing data first
                    reading.billing_data?.effective_status === 'approved'
                      ? 'bg-green-100 text-green-800' :
                    reading.billing_data?.effective_status === 'rejected' 
                      ? 'bg-red-100 text-red-800' :
                    // Then fall back to the actual status
                    (reading.status === 'approved' || reading.status === 'completed' || reading.status === 'verified') 
                      ? 'bg-green-100 text-green-800' :
                    (reading.status === 'rejected' || reading.status === 'cancelled') 
                      ? 'bg-red-100 text-red-800' :
                    // Show as processed if it has billing data
                    (reading.billing_data || reading.calculatedbill || reading.approved_date)
                      ? 'bg-blue-100 text-blue-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {/* Display status text based on the same hierarchy */}
                    {reading.billing_status === 'invoiced' || reading.billing_data?.billing_status === 'invoiced'
                      ? 'Invoiced' :
                    reading.billing_data?.effective_status === 'approved'
                      ? 'Approved' :
                     reading.billing_data?.effective_status === 'rejected'
                      ? 'Rejected' :
                     // Otherwise display based on actual status
                     (reading.status === 'approved' || reading.status === 'completed' || reading.status === 'verified') 
                      ? 'Approved' :
                     (reading.status === 'rejected' || reading.status === 'cancelled')
                      ? 'Rejected' :
                     // Show as processed if it has billing data
                     (reading.billing_data || reading.calculatedbill || reading.approved_date)
                      ? 'Processed' :
                     'Pending'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {reading.invoices?.[0] ? (
                    <div>
                      <div className="text-sm text-gray-900">
                        Amount: {formatCurrency(reading.invoices[0].totalamount)}
                      </div>
                      <div className="text-sm text-gray-500">
                        Due: {new Date(reading.invoices[0].duedate).toLocaleDateString()}
                      </div>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-500">No invoice</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={() => {
                      setSelectedReading(reading);
                      setShowImageModal(true);
                    }}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    View Photo
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Image Modal */}
      {showImageModal && selectedReading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-xl font-semibold">Meter Reading Photo</h2>
              <button
                onClick={() => setShowImageModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <img
                src={selectedReading.photourl}
                alt="Meter reading"
                className="max-w-full h-auto rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UtilityHistory; 