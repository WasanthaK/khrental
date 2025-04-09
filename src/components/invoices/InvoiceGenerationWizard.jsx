import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PropertySelector from '../properties/PropertySelector';
import { useProperty } from '../../contexts/PropertyContext';
import { supabase } from '../../services/supabaseClient';

/**
 * InvoiceGenerationWizard - Step-by-step wizard for generating invoices across multiple properties
 */
const InvoiceGenerationWizard = () => {
  const navigate = useNavigate();
  const { selectedPropertyIds } = useProperty();
  
  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Data state
  const [selectedProperties, setSelectedProperties] = useState([]);
  const [readingsByProperty, setReadingsByProperty] = useState({});
  
  // Get default billing period (current month in YYYY-MM format)
  const getDefaultBillingPeriod = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  };
  
  const [formData, setFormData] = useState({
    billingPeriod: getDefaultBillingPeriod(),
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 14 days from now
    includeRent: false,
    sendNotifications: true,
    notes: ''
  });
  const [result, setResult] = useState(null);
  
  // Load property IDs from context on mount
  useEffect(() => {
    if (selectedPropertyIds.length > 0) {
      setSelectedProperties(selectedPropertyIds);
    }
  }, [selectedPropertyIds]);
  
  // Fetch readings when properties are selected and moving to step 2
  useEffect(() => {
    if (currentStep === 2 && selectedProperties.length > 0) {
      fetchReadings();
    }
  }, [currentStep, selectedProperties]);
  
  // Fetch readings for selected properties
  const fetchReadings = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await fetchReadingsForInvoiceByProperty(selectedProperties);
      setReadingsByProperty(result.data || {});
    } catch (err) {
      console.error('Error fetching readings:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Local implementation to avoid circular dependency
  const fetchReadingsForInvoiceByProperty = async (propertyIds) => {
    try {
      console.log('Fetching readings for invoice by property:', { propertyIds });
      
      // Handle single propertyId case
      const propertyIdsArray = Array.isArray(propertyIds) ? propertyIds : [propertyIds];
      
      // Execute the query
      const { data, error } = await supabase
        .from('utility_readings')
        .select(`
          *,
          properties:propertyid(id, name, bank_name, bank_branch, bank_account_number, electricity_rate, water_rate),
          app_users:renteeid(id, name, email, contact_details)
        `)
        .in('propertyid', propertyIdsArray)
        .eq('billing_status', 'pending_invoice')
        .order('readingdate', { ascending: false });
      
      if (error) {
        throw error;
      }
      
      // Group readings by property and rentee
      const readingsByProperty = {};
      
      data.forEach(reading => {
        const propertyId = reading.propertyid;
        const renteeId = reading.renteeid;
        
        // Initialize property object if it doesn't exist
        if (!readingsByProperty[propertyId]) {
          readingsByProperty[propertyId] = {
            propertyInfo: reading.properties,
            rentees: {}
          };
        }
        
        // Initialize rentee object if it doesn't exist
        if (!readingsByProperty[propertyId].rentees[renteeId]) {
          readingsByProperty[propertyId].rentees[renteeId] = {
            renteeInfo: reading.app_users,
            readings: []
          };
        }
        
        // Calculate the amount if not already calculated
        if (!reading.calculatedbill) {
          // Simple calculation - could be replaced with more complex logic
          const consumption = reading.currentreading - reading.previousreading;
          const rate = reading.utilitytype === 'electricity' ? 
            reading.properties.electricity_rate : 
            reading.properties.water_rate;
          reading.calculatedbill = consumption * (rate || 1);
        }
        
        // Add reading to the rentee's readings
        readingsByProperty[propertyId].rentees[renteeId].readings.push(reading);
      });
      
      console.log(`Successfully grouped readings by property and rentee: ${Object.keys(readingsByProperty).length} properties`);
      
      return { data: readingsByProperty, error: null };
    } catch (error) {
      console.error('Error fetching readings for invoice by property:', error);
      return { data: null, error };
    }
  };
  
  // Handle next step
  const handleNext = () => {
    if (currentStep === 1 && selectedProperties.length === 0) {
      setError('Please select at least one property');
      return;
    }
    
    setCurrentStep(prevStep => prevStep + 1);
  };
  
  // Handle previous step
  const handlePrevious = () => {
    setCurrentStep(prevStep => Math.max(1, prevStep - 1));
  };
  
  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };
  
  // Handle property selection
  const handlePropertySelect = (propertyIds) => {
    setSelectedProperties(propertyIds);
  };
  
  // Handle generate invoices
  const handleGenerateInvoices = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const options = {
        billingPeriod: formData.billingPeriod,
        dueDate: formData.dueDate,
        includeRent: formData.includeRent,
        sendNotifications: formData.sendNotifications,
        notes: formData.notes
      };
      
      const result = await generateInvoicesByProperty(readingsByProperty, options);
      
      if (!result.success) {
        throw new Error('Failed to generate some or all invoices');
      }
      
      setResult(result);
      setCurrentStep(4); // Move to success step
    } catch (err) {
      console.error('Error generating invoices:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Local implementation to avoid circular dependency
  const generateInvoicesByProperty = async (readingsByProperty, options = {}) => {
    try {
      console.log('Generating invoices by property:', { options });
      
      const results = {
        success: true,
        invoiceIds: [],
        propertyResults: {},
        errors: []
      };
      
      // Process each property
      for (const propertyId in readingsByProperty) {
        const propertyData = readingsByProperty[propertyId];
        results.propertyResults[propertyId] = {
          invoiceCount: 0,
          totalAmount: 0,
          rentees: []
        };
        
        // Process each rentee in the property
        for (const renteeId in propertyData.rentees) {
          const renteeData = propertyData.rentees[renteeId];
          
          try {
            // Skip if there are no readings
            if (renteeData.readings.length === 0) {
              continue;
            }
            
            // Prepare invoice components
            const components = {
              rent: 0,
              electricity: 0,
              water: 0,
              pastDues: 0,
              taxes: 0
            };
            
            // Calculate component amounts from readings
            renteeData.readings.forEach(reading => {
              if (reading.utilitytype === 'electricity') {
                components.electricity += parseFloat(reading.calculatedbill) || 0;
              } else if (reading.utilitytype === 'water') {
                components.water += parseFloat(reading.calculatedbill) || 0;
              }
            });
            
            // Add rent component if enabled in options
            if (options.includeRent && propertyData.propertyInfo?.rentalvalues?.rent) {
              components.rent = parseFloat(propertyData.propertyInfo.rentalvalues.rent) || 0;
            }
            
            // Calculate total amount
            const totalAmount = Object.values(components).reduce((sum, value) => sum + (parseFloat(value) || 0), 0);
            
            // Create invoice record
            const { data: invoice, error: invoiceError } = await supabase
              .from('invoices')
              .insert({
                renteeid: renteeId,
                propertyid: propertyId,
                billingperiod: options.billingPeriod || new Date().toISOString().split('T')[0].substring(0, 7),
                components,
                totalamount: totalAmount,
                status: 'pending',
                duedate: options.dueDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                notes: options.notes || ''
              })
              .select()
              .single();
            
            if (invoiceError) {
              throw invoiceError;
            }
            
            // Update readings with invoice ID
            const readingIds = renteeData.readings.map(reading => reading.id);
            const { error: updateError } = await supabase
              .from('utility_readings')
              .update({
                invoice_id: invoice.id,
                billing_status: 'invoiced'
              })
              .in('id', readingIds);
            
            if (updateError) {
              throw updateError;
            }
            
            // Update results
            results.invoiceIds.push(invoice.id);
            results.propertyResults[propertyId].invoiceCount += 1;
            results.propertyResults[propertyId].totalAmount += totalAmount;
            results.propertyResults[propertyId].rentees.push({
              renteeId,
              invoiceId: invoice.id,
              amount: totalAmount
            });
            
            // Send notification if enabled
            if (options.sendNotifications) {
              // TODO: Implement notification service integration
              console.log(`Should send notification to rentee ${renteeId} for invoice ${invoice.id}`);
            }
          } catch (error) {
            console.error(`Error generating invoice for rentee ${renteeId} in property ${propertyId}:`, error);
            results.errors.push({
              propertyId,
              renteeId,
              error: error.message
            });
          }
        }
      }
      
      // Mark operation as failed if there are errors
      if (results.errors.length > 0 && results.invoiceIds.length === 0) {
        results.success = false;
      }
      
      console.log(`Successfully generated ${results.invoiceIds.length} invoices across ${Object.keys(results.propertyResults).length} properties`);
      
      return results;
    } catch (error) {
      console.error('Error generating invoices by property:', error);
      return {
        success: false,
        invoiceIds: [],
        propertyResults: {},
        errors: [{ error: error.message }]
      };
    }
  };
  
  // Count total readings
  const getTotalReadingsCount = () => {
    let count = 0;
    for (const propertyId in readingsByProperty) {
      const property = readingsByProperty[propertyId];
      for (const renteeId in property.rentees) {
        count += property.rentees[renteeId].readings.length;
      }
    }
    return count;
  };
  
  // Count total rentees
  const getTotalRenteesCount = () => {
    let count = 0;
    for (const propertyId in readingsByProperty) {
      count += Object.keys(readingsByProperty[propertyId].rentees).length;
    }
    return count;
  };
  
  // Get total invoice amount
  const getTotalAmount = () => {
    let total = 0;
    for (const propertyId in result?.propertyResults || {}) {
      total += result.propertyResults[propertyId].totalAmount;
    }
    return total;
  };
  
  // Render step 1: Property selection
  const renderStep1 = () => (
    <div>
      <h2 className="text-xl font-semibold mb-4">Step 1: Select Properties</h2>
      <div className="mb-6">
        <PropertySelector 
          multiSelect={true}
          value={selectedProperties}
          onChange={handlePropertySelect}
          label="Select Properties for Invoice Generation"
        />
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
          {error}
        </div>
      )}
      
      <div className="flex justify-end">
        <button
          onClick={handleNext}
          disabled={selectedProperties.length === 0}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:bg-gray-400"
        >
          Next
        </button>
      </div>
    </div>
  );
  
  // Render step 2: Review readings
  const renderStep2 = () => (
    <div>
      <h2 className="text-xl font-semibold mb-4">Step 2: Review Utility Readings</h2>
      
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading readings...</p>
        </div>
      ) : (
        <>
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
              {error}
            </div>
          )}
          
          {Object.keys(readingsByProperty).length === 0 ? (
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded relative mb-4">
              No pending readings found for the selected properties.
            </div>
          ) : (
            <div className="mb-6">
              <div className="mb-4 bg-blue-50 p-4 rounded">
                <p className="font-medium">Summary:</p>
                <ul className="list-disc list-inside ml-4">
                  <li>{Object.keys(readingsByProperty).length} properties</li>
                  <li>{getTotalRenteesCount()} rentees</li>
                  <li>{getTotalReadingsCount()} utility readings</li>
                </ul>
              </div>
              
              <div className="space-y-6">
                {Object.keys(readingsByProperty).map(propertyId => {
                  const property = readingsByProperty[propertyId];
                  const renteeCount = Object.keys(property.rentees).length;
                  let readingCount = 0;
                  
                  // Count readings for this property
                  for (const renteeId in property.rentees) {
                    readingCount += property.rentees[renteeId].readings.length;
                  }
                  
                  return (
                    <div key={propertyId} className="border rounded-lg overflow-hidden">
                      <div className="bg-gray-100 px-4 py-3 border-b">
                        <h3 className="font-medium">{property.propertyInfo.name}</h3>
                        <p className="text-sm text-gray-600">{property.propertyInfo.address}</p>
                      </div>
                      
                      <div className="p-4">
                        <p className="mb-2">
                          <span className="font-medium">Rentees:</span> {renteeCount}
                        </p>
                        <p className="mb-4">
                          <span className="font-medium">Readings:</span> {readingCount}
                        </p>
                        
                        <div className="mt-2">
                          <details>
                            <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                              View Details
                            </summary>
                            <div className="mt-2 pl-4 border-l-2 border-gray-200">
                              {Object.keys(property.rentees).map(renteeId => {
                                const rentee = property.rentees[renteeId];
                                return (
                                  <div key={renteeId} className="mb-4">
                                    <p className="font-medium">{rentee.renteeInfo.name}</p>
                                    <p className="text-sm text-gray-600">{rentee.renteeInfo.email}</p>
                                    
                                    <div className="mt-2">
                                      <p className="text-sm font-medium">Readings:</p>
                                      <ul className="mt-1 space-y-1">
                                        {rentee.readings.map(reading => (
                                          <li key={reading.id} className="text-sm">
                                            {reading.utilitytype} - {reading.readingdate}: 
                                            {reading.previousreading} → {reading.currentreading} 
                                            ({(reading.currentreading - reading.previousreading).toFixed(2)} units, 
                                            ${parseFloat(reading.calculatedbill).toFixed(2)})
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          <div className="flex justify-between">
            <button
              onClick={handlePrevious}
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded"
            >
              Previous
            </button>
            
            <button
              onClick={handleNext}
              disabled={Object.keys(readingsByProperty).length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:bg-gray-400"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
  
  // Render step 3: Invoice options
  const renderStep3 = () => (
    <div>
      <h2 className="text-xl font-semibold mb-4">Step 3: Invoice Options</h2>
      
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Billing Period
          </label>
          <input
            type="month"
            name="billingPeriod"
            value={formData.billingPeriod}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Due Date
          </label>
          <input
            type="date"
            name="dueDate"
            value={formData.dueDate}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        
        <div className="flex items-center">
          <input
            type="checkbox"
            id="includeRent"
            name="includeRent"
            checked={formData.includeRent}
            onChange={handleInputChange}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="includeRent" className="ml-2 block text-sm text-gray-700">
            Include Rent Component
          </label>
        </div>
        
        <div className="flex items-center">
          <input
            type="checkbox"
            id="sendNotifications"
            name="sendNotifications"
            checked={formData.sendNotifications}
            onChange={handleInputChange}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="sendNotifications" className="ml-2 block text-sm text-gray-700">
            Send Notifications to Rentees
          </label>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes (Optional)
          </label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            rows="3"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="Add any additional notes for the invoices"
          ></textarea>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
          {error}
        </div>
      )}
      
      <div className="flex justify-between">
        <button
          onClick={handlePrevious}
          className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded"
        >
          Previous
        </button>
        
        <button
          onClick={handleGenerateInvoices}
          disabled={loading}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:bg-gray-400 flex items-center"
        >
          {loading && (
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          Generate Invoices
        </button>
      </div>
    </div>
  );
  
  // Render step 4: Success
  const renderStep4 = () => (
    <div>
      <div className="text-center mb-6">
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="mt-3 text-lg font-medium text-gray-900">Success!</h2>
        <p className="mt-2 text-sm text-gray-500">
          Invoices were successfully generated.
        </p>
      </div>
      
      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        <h3 className="font-medium mb-2">Summary</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Total Invoices</p>
            <p className="text-lg font-semibold">{result?.invoiceIds?.length || 0}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Amount</p>
            <p className="text-lg font-semibold">${getTotalAmount().toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Properties</p>
            <p className="text-lg font-semibold">{Object.keys(result?.propertyResults || {}).length}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Billing Period</p>
            <p className="text-lg font-semibold">{formData.billingPeriod}</p>
          </div>
        </div>
      </div>
      
      <div className="mb-6">
        <h3 className="font-medium mb-2">Results by Property</h3>
        <div className="space-y-3">
          {Object.keys(result?.propertyResults || {}).map(propertyId => {
            const propertyResult = result.propertyResults[propertyId];
            const property = readingsByProperty[propertyId]?.propertyInfo;
            
            return (
              <div key={propertyId} className="border rounded p-3">
                <p className="font-medium">{property?.name || 'Unknown Property'}</p>
                <div className="grid grid-cols-2 gap-2 text-sm mt-1">
                  <div>
                    <span className="text-gray-500">Invoices:</span> {propertyResult.invoiceCount}
                  </div>
                  <div>
                    <span className="text-gray-500">Amount:</span> ${propertyResult.totalAmount.toFixed(2)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="flex justify-between">
        <button
          onClick={() => setCurrentStep(1)}
          className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded"
        >
          Start New Batch
        </button>
        
        <button
          onClick={() => navigate('/dashboard/invoices')}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
        >
          View All Invoices
        </button>
      </div>
    </div>
  );
  
  // Render current step
  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      case 4:
        return renderStep4();
      default:
        return null;
    }
  };
  
  return (
    <div className="max-w-3xl mx-auto">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex justify-between">
          {[1, 2, 3, 4].map((step) => (
            <div 
              key={step}
              className={`flex-1 text-center ${step < currentStep ? 'text-blue-600' : step === currentStep ? 'text-blue-600 font-medium' : 'text-gray-400'}`}
            >
              <div className="relative">
                <div 
                  className={`w-6 h-6 mx-auto rounded-full flex items-center justify-center border-2 ${
                    step < currentStep ? 'border-blue-600 bg-blue-600 text-white' : 
                    step === currentStep ? 'border-blue-600 text-blue-600' : 
                    'border-gray-300 text-gray-400'
                  }`}
                >
                  {step < currentStep ? (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    step
                  )}
                </div>
                {step < 4 && (
                  <div 
                    className={`hidden sm:block absolute top-0 w-full left-1/2 -mt-px ${
                      step < currentStep ? 'border-t-2 border-blue-600' : 'border-t-2 border-gray-300'
                    }`} 
                    style={{ height: '2px', top: '12px', left: '50%', width: '100%' }}
                  ></div>
                )}
              </div>
              <div className="text-xs mt-2">{
                step === 1 ? 'Select Properties' :
                step === 2 ? 'Review Readings' :
                step === 3 ? 'Invoice Options' :
                'Success'
              }</div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Step content */}
      <div className="bg-white rounded-lg shadow-md p-6">
        {renderCurrentStep()}
      </div>
    </div>
  );
};

export default InvoiceGenerationWizard; 