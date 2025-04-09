import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchData, supabase } from '../services/supabaseClient';
import { generateInvoice } from '../services/paymentService';
import { formatCurrency } from '../utils/helpers';
import { INVOICE_STATUS } from '../utils/constants';

// UI Components
import FormInput from '../components/ui/FormInput';
import InvoiceComponentsTable from '../components/invoices/InvoiceComponentsTable';

const InvoiceForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = !!id;
  
  // Form state
  const [formData, setFormData] = useState({
    renteeid: '',
    propertyid: '',
    billingperiod: '',
    components: {
      rent: 0,
      electricity: 0,
      water: 0,
      pastDues: 0,
      taxes: 0
    },
    totalamount: 0,
    status: 'pending',
    duedate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: ''
  });
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [properties, setProperties] = useState([]);
  const [rentees, setRentees] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [selectedRentee, setSelectedRentee] = useState(null);
  const [approvedReadings, setApprovedReadings] = useState([]);
  const [activeTab, setActiveTab] = useState('details'); // 'details' or 'components'
  
  // Fetch data for form
  useEffect(() => {
    const fetchFormData = async () => {
      try {
        setLoading(true);
        
        // Fetch properties
        const { data: propertiesData, error: propertiesError } = await fetchData('properties');
        
        if (propertiesError) {
          throw propertiesError;
        }
        
        setProperties(propertiesData || []);
        
        // Fetch rentees from app_users table
        const { data: appUsersData, error: appUsersError } = await supabase
          .from('app_users')
          .select('*')
          .eq('user_type', 'rentee');
        
        if (appUsersError) {
          throw appUsersError;
        }
        
        setRentees(appUsersData || []);
        
        // If in edit mode, fetch invoice data
        if (isEditMode) {
          const { data: invoiceData, error: invoiceError } = await fetchData('invoices', {
            filters: [{ column: 'id', operator: 'eq', value: id }],
          });
          
          if (invoiceError) {
            throw invoiceError;
          }
          
          if (invoiceData && invoiceData.length > 0) {
            const invoice = invoiceData[0];
            
            setFormData({
              propertyid: invoice.propertyid || '',
              renteeid: invoice.renteeid || '',
              billingperiod: invoice.billingperiod || '',
              duedate: invoice.duedate ? new Date(invoice.duedate).toISOString().split('T')[0] : '',
              status: invoice.status || 'pending',
              components: invoice.components || {
                rent: 0,
                electricity: 0,
                water: 0,
                pastDues: 0,
                taxes: 0
              },
              notes: invoice.notes || ''
            });
            
            if (invoice.propertyid) {
              const property = propertiesData.find(p => p.id === invoice.propertyid);
              setSelectedProperty(property);
            }
            
            if (invoice.renteeid) {
              const rentee = appUsersData.find(r => r.id === invoice.renteeid);
              setSelectedRentee(rentee);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching form data:', error.message);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchFormData();
  }, [id, isEditMode]);
  
  // Fetch approved utility readings when property and rentee are selected
  useEffect(() => {
    const fetchApprovedReadings = async () => {
      if (formData.propertyid && formData.renteeid) {
        try {
          const { data, error } = await supabase
            .from('utility_readings')
            .select('*')
            .eq('propertyid', formData.propertyid)
            .eq('renteeid', formData.renteeid)
            .eq('status', 'approved')
            .is('invoice_id', null)
            .order('readingdate', { ascending: false });

          if (error) {
            throw error;
          }
          setApprovedReadings(data || []);
        } catch (error) {
          console.error('Error fetching approved readings:', error);
        }
      }
    };

    fetchApprovedReadings();
  }, [formData.propertyid, formData.renteeid]);

  // Handle reading selection
  const handleReadingSelect = (reading) => {
    setFormData(prev => ({
      ...prev,
      components: {
        ...prev.components,
        [reading.utilitytype]: reading.calculatedbill
      }
    }));
  };

  // Update rent amount when property is selected
  useEffect(() => {
    if (selectedProperty && selectedProperty.rentalvalues) {
      setFormData(prev => ({
        ...prev,
        components: {
          ...prev.components,
          rent: selectedProperty.rentalvalues.rent || 0,
        },
      }));
    }
  }, [selectedProperty]);
  
  // Calculate total amount using useCallback to avoid recreation on every render
  const calculateTotal = useCallback(() => {
    return Object.values(formData.components).reduce((sum, value) => sum + (parseFloat(value) || 0), 0);
  }, [formData.components]);
  
  // Update total amount whenever components change
  useEffect(() => {
    const total = calculateTotal();
    setFormData(prev => ({
      ...prev,
      totalamount: total
    }));
  }, [formData.components, calculateTotal]);
  
  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };
  
  // Handle property selection
  const handlePropertyChange = (e) => {
    const propertyid = e.target.value;
    setFormData(prev => ({
      ...prev,
      propertyid,
    }));
    
    const property = properties.find(p => p.id === propertyid);
    setSelectedProperty(property);
  };
  
  // Handle rentee selection
  const handleRenteeChange = (e) => {
    const renteeid = e.target.value;
    setFormData(prevData => ({
      ...prevData,
      renteeid
    }));
    
    const rentee = rentees.find(r => r.id === renteeid);
    setSelectedRentee(rentee);
  };
  
  // Handle component amount changes
  const handleComponentChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      components: {
        ...prev.components,
        [name]: parseFloat(value) || 0,
      },
    }));
  };
  
  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setSubmitting(true);
      setError(null);
      
      // Validate form data
      if (!formData.renteeid || !formData.propertyid || !formData.billingperiod) {
        throw new Error('Please fill in all required fields.');
      }
      
      // Calculate total amount (recalculate to ensure it's up to date)
      const totalAmount = calculateTotal();
      
      // Prepare data for submission
      const invoiceData = {
        renteeid: formData.renteeid,
        propertyid: formData.propertyid,
        billingperiod: formData.billingperiod,
        components: formData.components,
        totalamount: totalAmount > 0 ? totalAmount : 1, // Ensure totalamount is never 0
        status: formData.status || 'pending',
        notes: formData.notes || '',
        duedate: formData.duedate,
        renteeEmail: selectedRentee?.contactdetails?.email || selectedRentee?.contactDetails?.email,
      };
      
      console.log('Submitting invoice:', invoiceData);
      
      // Generate invoice
      const { success, data, error } = await generateInvoice(invoiceData);
      
      if (!success) {
        throw new Error(error || 'Failed to generate invoice');
      }

      // Update the utility readings to link them to the invoice
      if (data && data.id) {
        const selectedReadings = approvedReadings.filter(reading => 
          formData.components[reading.utilitytype] === reading.calculatedbill
        );

        for (const reading of selectedReadings) {
          await supabase
            .from('utility_readings')
            .update({ invoice_id: data.id })
            .eq('id', reading.id);
        }
      }
      
      // Navigate back to invoice list
      navigate('/dashboard/invoices');
      
    } catch (error) {
      console.error('Error generating invoice:', error.message);
      setError(error.message);
    } finally {
      setSubmitting(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <div className="text-lg font-medium text-gray-700">Loading invoice data...</div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="max-w-5xl mx-auto bg-white rounded-xl shadow-md overflow-hidden">
      {/* Header with page title and actions */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">
          {isEditMode ? 'Edit Invoice' : 'Create New Invoice'}
        </h1>
        <div className="flex space-x-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard/invoices')}
            className="px-4 py-2 bg-white bg-opacity-20 hover:bg-opacity-30 text-white rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex -mb-px">
          <button
            onClick={() => setActiveTab('details')}
            className={`py-4 px-6 font-medium text-sm border-b-2 ${activeTab === 'details' 
              ? 'border-blue-500 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } transition-colors focus:outline-none`}
          >
            Invoice Details
          </button>
          <button
            onClick={() => setActiveTab('components')}
            className={`py-4 px-6 font-medium text-sm border-b-2 ${activeTab === 'components' 
              ? 'border-blue-500 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } transition-colors focus:outline-none`}
          >
            Invoice Components
          </button>
        </nav>
      </div>
      
      {/* Error message */}
      {error && (
        <div className="m-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-md" role="alert">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800 font-medium">{error}</p>
            </div>
          </div>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="p-6">
        {/* Tab content */}
        <div className={`${activeTab === 'details' ? 'block' : 'hidden'}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left column */}
            <div>
              <div className="mb-6">
                <label htmlFor="propertyid" className="block text-sm font-medium text-gray-700 mb-1">
                  Property <span className="text-red-500">*</span>
                </label>
                <select
                  id="propertyid"
                  name="propertyid"
                  value={formData.propertyid}
                  onChange={handlePropertyChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
                  required
                >
                  <option value="">Select a property</option>
                  {properties.map(property => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="mb-6">
                <label htmlFor="renteeid" className="block text-sm font-medium text-gray-700 mb-1">
                  Rentee <span className="text-red-500">*</span>
                </label>
                <select
                  id="renteeid"
                  name="renteeid"
                  value={formData.renteeid}
                  onChange={handleRenteeChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
                  required
                >
                  <option value="">Select a rentee</option>
                  {rentees.map(rentee => (
                    <option key={rentee.id} value={rentee.id}>
                      {rentee.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Right column */}
            <div>
              <FormInput
                label="Billing Period"
                id="billingperiod"
                value={formData.billingperiod}
                onChange={handleInputChange}
                placeholder="e.g., March 2025"
                required
              />
              
              <FormInput
                label="Due Date"
                id="duedate"
                type="date"
                value={formData.duedate}
                onChange={handleInputChange}
                required
              />
              
              {isEditMode && (
                <div className="mb-6">
                  <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
                  >
                    <option value={INVOICE_STATUS.PENDING}>Pending</option>
                    <option value={INVOICE_STATUS.VERIFICATION_PENDING}>Verification Pending</option>
                    <option value={INVOICE_STATUS.PAID}>Paid</option>
                    <option value={INVOICE_STATUS.OVERDUE}>Overdue</option>
                    <option value={INVOICE_STATUS.REJECTED}>Rejected</option>
                  </select>
                </div>
              )}
            </div>
          </div>
          
          <div className="mt-4">
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes || ''}
              onChange={handleInputChange}
              rows="3"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
              placeholder="Add any additional notes here..."
            ></textarea>
          </div>
          
          <div className="mt-6 text-right">
            <button
              type="button"
              onClick={() => setActiveTab('components')}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Next: Invoice Components
            </button>
          </div>
        </div>
        
        <div className={`${activeTab === 'components' ? 'block' : 'hidden'}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left column - Invoice Components */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Invoice Components</h3>
              
              <div className="space-y-5">
                <FormInput
                  label="Rent"
                  id="rent"
                  name="rent"
                  type="number"
                  value={formData.components.rent}
                  onChange={handleComponentChange}
                  placeholder="0.00"
                  className="mb-5"
                />
                
                <FormInput
                  label="Electricity"
                  id="electricity"
                  name="electricity"
                  type="number"
                  value={formData.components.electricity}
                  onChange={handleComponentChange}
                  placeholder="0.00"
                  className="mb-5"
                />
                
                <FormInput
                  label="Water"
                  id="water"
                  name="water"
                  type="number"
                  value={formData.components.water}
                  onChange={handleComponentChange}
                  placeholder="0.00"
                  className="mb-5"
                />
                
                <FormInput
                  label="Past Dues"
                  id="pastDues"
                  name="pastDues"
                  type="number"
                  value={formData.components.pastDues}
                  onChange={handleComponentChange}
                  placeholder="0.00"
                  className="mb-5"
                />
                
                <FormInput
                  label="Taxes"
                  id="taxes"
                  name="taxes"
                  type="number"
                  value={formData.components.taxes}
                  onChange={handleComponentChange}
                  placeholder="0.00"
                  className="mb-5"
                />
              </div>
            </div>
            
            {/* Right column - Available Readings and Summary */}
            <div>
              {/* Available Utility Readings */}
              {approvedReadings.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Available Utility Readings</h3>
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                    {approvedReadings.map(reading => (
                      <div key={reading.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors">
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="font-medium text-gray-800 capitalize">{reading.utilitytype}</div>
                            <div className="text-sm text-gray-500">
                              {new Date(reading.readingdate).toLocaleDateString()} • Previous: {reading.previousreading} • Current: {reading.currentreading}
                            </div>
                          </div>
                          <div className="flex items-center">
                            <span className="mr-3 font-medium">{formatCurrency(reading.calculatedbill)}</span>
                            <button
                              type="button"
                              onClick={() => handleReadingSelect(reading)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                              title="Add to Invoice"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Invoice Summary */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">Invoice Summary</h3>
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <InvoiceComponentsTable components={formData.components} />
                  <div className="mt-4 text-right">
                    <div className="text-xl font-bold text-gray-900">
                      Total: {formatCurrency(calculateTotal())}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-8 flex justify-between">
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              Back to Invoice Details
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : (
                isEditMode ? 'Update Invoice' : 'Generate Invoice'
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default InvoiceForm; 