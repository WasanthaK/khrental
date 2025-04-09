import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '../../services/supabaseClient';
import { UTILITY_TYPES } from '../../utils/constants';
import ImageViewer from '../../components/common/ImageViewer';

const UtilityReadingsReview = () => {
  const [loading, setLoading] = useState(false);
  const [readings, setReadings] = useState([]);
  const [selectedReading, setSelectedReading] = useState(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [filter, setFilter] = useState({
    status: 'pending',
    utilityType: UTILITY_TYPES.ELECTRICITY
  });

  useEffect(() => {
    fetchReadings();
  }, [filter]);

  const fetchReadings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('utility_readings')
        .select(`
          *,
          app_users!renteeid (
            name,
            email
          ),
          properties!propertyid (
            name,
            address,
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
        .eq('status', filter.status)
        .eq('utilitytype', filter.utilityType)
        .order('readingdate', { ascending: false });

      if (error) {
        throw error;
      }
      setReadings(data || []);
    } catch (error) {
      console.error('Error fetching readings:', error);
      toast.error('Failed to load utility readings');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (reading) => {
    try {
      setLoading(true);

      // Calculate the bill based on consumption and property utility rates
      const consumption = reading.currentreading - (reading.previousreading || 0);
      
      // Get the appropriate rate based on utility type
      let rate = 0;
      if (reading.utilitytype === UTILITY_TYPES.ELECTRICITY) {
        rate = parseFloat(reading.properties?.electricity_rate) || 0;
      } else if (reading.utilitytype === UTILITY_TYPES.WATER) {
        rate = parseFloat(reading.properties?.water_rate) || 0;
      }
      
      // Calculate the total amount
      const totalAmount = consumption * rate;

      // Create billing data object that can be easily reused by invoice module
      const billingData = {
        utility_type: reading.utilitytype,
        consumption: consumption,
        rate: rate,
        amount: totalAmount,
        reading_id: reading.id,
        property_id: reading.propertyid,
        rentee_id: reading.renteeid,
        reading_date: reading.readingdate,
        billing_month: new Date(reading.readingdate).toLocaleString('default', { month: 'long' }),
        billing_year: new Date(reading.readingdate).getFullYear(),
        approved_date: new Date().toISOString()
      };

      console.log('Calculated billing data:', billingData);

      // Update reading status to approved with calculated bill and billing data
      const { error: updateError } = await supabase
        .from('utility_readings')
        .update({ 
          status: 'approved',
          calculatedbill: totalAmount,
          billing_data: billingData,
          approved_date: billingData.approved_date
        })
        .eq('id', reading.id);

      if (updateError) {
        throw updateError;
      }
      
      // Store billing data in a separate utility_billing table for the invoice module to use
      const { error: billingError } = await supabase
        .from('utility_billing')
        .insert({
          reading_id: reading.id,
          rentee_id: reading.renteeid,
          property_id: reading.propertyid,
          utility_type: reading.utilitytype,
          consumption: consumption,
          rate: rate,
          amount: totalAmount,
          reading_date: reading.readingdate,
          billing_month: billingData.billing_month,
          billing_year: billingData.billing_year,
          status: 'pending_invoice',
          approved_date: billingData.approved_date
        });
        
      if (billingError) {
        console.error('Error creating billing record:', billingError);
        // Don't stop the process if billing record fails, just log it
      }

      toast.success('Reading approved and ready for invoice');
      fetchReadings();
    } catch (error) {
      console.error('Error approving reading:', error);
      toast.error('Failed to approve reading');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (reading) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('utility_readings')
        .update({ status: 'rejected' })
        .eq('id', reading.id);

      if (error) {
        throw error;
      }

      toast.success('Reading rejected');
      fetchReadings();
    } catch (error) {
      console.error('Error rejecting reading:', error);
      toast.error('Failed to reject reading');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Utility Readings Review</h1>
        
        {/* Filters */}
        <div className="flex gap-4">
          <select
            value={filter.utilityType}
            onChange={(e) => setFilter(prev => ({ ...prev, utilityType: e.target.value }))}
            className="p-2 border rounded-md"
            disabled={loading}
          >
            <option value={UTILITY_TYPES.ELECTRICITY}>Electricity</option>
            <option value={UTILITY_TYPES.WATER}>Water</option>
          </select>

          <select
            value={filter.status}
            onChange={(e) => setFilter(prev => ({ ...prev, status: e.target.value }))}
            className="p-2 border rounded-md"
            disabled={loading}
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Readings Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Property
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rentee
              </th>
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
                Rate
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Est. Cost
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Billing Info
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {readings.map((reading) => {
              // Calculate consumption and estimate cost
              const consumption = reading.currentreading - (reading.previousreading || 0);
              let rate = 0;
              
              if (reading.utilitytype === UTILITY_TYPES.ELECTRICITY) {
                rate = parseFloat(reading.properties?.electricity_rate) || 0;
              } else if (reading.utilitytype === UTILITY_TYPES.WATER) {
                rate = parseFloat(reading.properties?.water_rate) || 0;
              }
              
              const estimatedCost = consumption * rate;
              
              return (
              <tr key={reading.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {reading.properties?.name}
                  </div>
                  <div className="text-sm text-gray-500">
                    {reading.properties?.address}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {reading.app_users?.name}
                  </div>
                  <div className="text-sm text-gray-500">
                    {reading.app_users?.email}
                  </div>
                </td>
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
                  {consumption}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {rate.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  ${estimatedCost.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    reading.status === 'approved' ? 'bg-green-100 text-green-800' :
                    reading.status === 'rejected' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {reading.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {reading.billing_data ? (
                    <div>
                      <div className="text-sm text-gray-900">
                        Month: {reading.billing_data.billing_month} {reading.billing_data.billing_year}
                      </div>
                      <div className="text-sm text-gray-500">
                        Approved: {new Date(reading.approved_date).toLocaleDateString()}
                      </div>
                    </div>
                  ) : reading.status === 'approved' ? (
                    <span className="text-sm text-amber-600">No billing data</span>
                  ) : (
                    <span className="text-sm text-gray-500">Pending approval</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {reading.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(reading)}
                        disabled={loading}
                        className="text-green-600 hover:text-green-900"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(reading)}
                        disabled={loading}
                        className="text-red-600 hover:text-red-900"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setSelectedReading(reading);
                      setShowImageModal(true);
                    }}
                    className="text-blue-600 hover:text-blue-900 ml-2"
                  >
                    View Photo
                  </button>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      {/* Image Modal */}
      {showImageModal && selectedReading && (
        <ImageViewer
          imageUrl={selectedReading.photourl}
          open={showImageModal}
          onClose={() => setShowImageModal(false)}
          title="Meter Reading Photo"
        />
      )}
    </div>
  );
};

export default UtilityReadingsReview; 