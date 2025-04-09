import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useProperty } from '../contexts/PropertyContext';
import { getInvoiceSummaryByProperty, getPropertiesWithPendingReadings } from '../services/invoiceService';
import PropertySelector from '../components/properties/PropertySelector';

const InvoiceManagementDashboard = () => {
  const { selectedPropertyIds, selectedProperties } = useProperty();
  
  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [invoiceSummary, setInvoiceSummary] = useState({});
  const [propertiesWithReadings, setPropertiesWithReadings] = useState([]);
  const [filterOptions, setFilterOptions] = useState({
    status: 'all',
    period: 'current_month'
  });
  
  // Load invoice summary data when selected properties change
  useEffect(() => {
    if (selectedPropertyIds.length > 0) {
      loadInvoiceSummary();
    }
  }, [selectedPropertyIds, filterOptions]);
  
  // Load properties with pending readings on mount
  useEffect(() => {
    loadPropertiesWithReadings();
  }, []);
  
  // Load invoice summary for selected properties
  const loadInvoiceSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Set date filters based on period
      const options = {};
      
      if (filterOptions.status !== 'all') {
        options.status = filterOptions.status;
      }
      
      const now = new Date();
      
      if (filterOptions.period === 'current_month') {
        options.fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        options.toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
      } else if (filterOptions.period === 'last_month') {
        options.fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
        options.toDate = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();
      } else if (filterOptions.period === 'current_year') {
        options.fromDate = new Date(now.getFullYear(), 0, 1).toISOString();
        options.toDate = new Date(now.getFullYear(), 11, 31).toISOString();
      }
      
      const { data, error } = await getInvoiceSummaryByProperty(selectedPropertyIds, options);
      
      if (error) {
        throw error;
      }
      
      setInvoiceSummary(data || {});
    } catch (err) {
      console.error('Error loading invoice summary:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Load properties with pending readings
  const loadPropertiesWithReadings = async () => {
    try {
      const { data, error } = await getPropertiesWithPendingReadings();
      
      if (error) {
        throw error;
      }
      
      setPropertiesWithReadings(data || []);
    } catch (err) {
      console.error('Error loading properties with readings:', err);
    }
  };
  
  // Handle filter change
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilterOptions(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Format currency
  const formatCurrency = (amount) => {
    return amount.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    });
  };
  
  // Get summary totals
  const getTotals = () => {
    let totalInvoices = 0;
    let totalAmount = 0;
    let pendingAmount = 0;
    let paidAmount = 0;
    
    Object.values(invoiceSummary).forEach(property => {
      totalInvoices += property.totalInvoices || 0;
      totalAmount += property.totalAmount || 0;
      pendingAmount += property.pendingAmount || 0;
      paidAmount += property.paidAmount || 0;
    });
    
    return {
      totalInvoices,
      totalAmount,
      pendingAmount,
      paidAmount
    };
  };
  
  const totals = getTotals();
  
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Invoice Management Dashboard</h1>
        <div className="flex space-x-2">
          <Link
            to="/dashboard/invoices/batch-generate"
            className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Generate Invoices
          </Link>
          <Link
            to="/dashboard/invoices"
            className="bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
            View All Invoices
          </Link>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left column: Property selection */}
        <div className="md:col-span-1">
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <h2 className="text-lg font-medium mb-4">Select Properties</h2>
            <PropertySelector multiSelect={true} />
          </div>
          
          {propertiesWithReadings.length > 0 && (
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-lg font-medium mb-4">Properties with Pending Readings</h2>
              <div className="space-y-3">
                {propertiesWithReadings.map(property => (
                  <div key={property.id} className="border rounded p-3 flex justify-between items-center">
                    <div>
                      <p className="font-medium">{property.name}</p>
                      <p className="text-sm text-gray-500">{property.pendingReadingsCount} readings pending</p>
                    </div>
                    <Link
                      to={`/dashboard/utilities/review?propertyId=${property.id}`}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      Review
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Right column: Dashboard content */}
        <div className="md:col-span-2">
          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  name="status"
                  value={filterOptions.status}
                  onChange={handleFilterChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="verification_pending">Verification Pending</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
              
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Time Period
                </label>
                <select
                  name="period"
                  value={filterOptions.period}
                  onChange={handleFilterChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="current_month">Current Month</option>
                  <option value="last_month">Last Month</option>
                  <option value="current_year">Current Year</option>
                  <option value="all_time">All Time</option>
                </select>
              </div>
            </div>
          </div>
          
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Total Invoices</p>
              <p className="text-2xl font-semibold">{totals.totalInvoices}</p>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Total Amount</p>
              <p className="text-2xl font-semibold">{formatCurrency(totals.totalAmount)}</p>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Pending Amount</p>
              <p className="text-2xl font-semibold">{formatCurrency(totals.pendingAmount)}</p>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Paid Amount</p>
              <p className="text-2xl font-semibold">{formatCurrency(totals.paidAmount)}</p>
            </div>
          </div>
          
          {/* Property results */}
          {selectedPropertyIds.length === 0 ? (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded relative">
              Please select one or more properties to view invoice summary.
            </div>
          ) : loading ? (
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p>Loading invoice data...</p>
            </div>
          ) : error ? (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
              {error}
            </div>
          ) : Object.keys(invoiceSummary).length === 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded relative">
              No invoice data found for the selected properties and filters.
            </div>
          ) : (
            <div className="space-y-6">
              {selectedProperties.map(property => {
                const propertyData = invoiceSummary[property.id];
                
                if (!propertyData) {
                  return (
                    <div key={property.id} className="bg-white rounded-lg shadow overflow-hidden">
                      <div className="bg-gray-100 px-4 py-3 border-b">
                        <h3 className="font-medium">{property.name}</h3>
                      </div>
                      <div className="p-4">
                        <p className="text-gray-500">No invoice data available for this property.</p>
                      </div>
                    </div>
                  );
                }
                
                return (
                  <div key={property.id} className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="bg-gray-100 px-4 py-3 border-b">
                      <h3 className="font-medium">{property.name}</h3>
                      <p className="text-sm text-gray-600">{property.address}</p>
                    </div>
                    
                    <div className="p-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                          <p className="text-sm text-gray-500">Invoices</p>
                          <p className="text-xl font-semibold">{propertyData.totalInvoices}</p>
                        </div>
                        
                        <div>
                          <p className="text-sm text-gray-500">Total Amount</p>
                          <p className="text-xl font-semibold">{formatCurrency(propertyData.totalAmount)}</p>
                        </div>
                        
                        <div>
                          <p className="text-sm text-gray-500">Pending</p>
                          <p className="text-xl font-semibold">{formatCurrency(propertyData.pendingAmount)}</p>
                        </div>
                        
                        <div>
                          <p className="text-sm text-gray-500">Paid</p>
                          <p className="text-xl font-semibold">{formatCurrency(propertyData.paidAmount)}</p>
                        </div>
                      </div>
                      
                      <div className="flex justify-end space-x-2">
                        <Link
                          to={`/dashboard/invoices?propertyId=${property.id}`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          View Invoices
                        </Link>
                        
                        <Link
                          to={`/dashboard/utilities/review?propertyId=${property.id}`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          View Readings
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InvoiceManagementDashboard; 