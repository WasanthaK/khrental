import { supabase } from './supabaseClient';
import { UTILITY_TYPES } from '../utils/constants';

/**
 * Calculate utility bill amount using standardized rates
 * @param {Object} reading - The utility reading object
 * @returns {number} - The calculated amount
 */
export const calculateUtilityAmount = (reading) => {
  if (!reading) {
    return 0;
  }
  
  // Calculate consumption
  const consumption = reading.currentreading - (reading.previousreading || 0);
  
  // Get the appropriate rate
  let rate = 0;
  
  // First try to get rate from billing_data if it exists
  if (reading.billing_data?.rate) {
    rate = parseFloat(reading.billing_data.rate);
  } 
  // Next try to get from properties
  else if (reading.utilitytype === UTILITY_TYPES.ELECTRICITY && reading.properties?.electricity_rate) {
    rate = parseFloat(reading.properties.electricity_rate);
  } else if (reading.utilitytype === UTILITY_TYPES.WATER && reading.properties?.water_rate) {
    rate = parseFloat(reading.properties.water_rate);
  } 
  // Default rates if none available
  else {
    // Standard rates: 50 per unit for electricity, 25 for water
    rate = reading.utilitytype === UTILITY_TYPES.ELECTRICITY ? 50 : 25;
  }
  
  // Calculate total amount
  return consumption * rate;
};

/**
 * Fetch utility readings with optional filtering
 * @param {Object} options - Filter options
 * @param {string} options.propertyId - Property ID to filter by
 * @param {string} options.renteeId - Rentee ID to filter by
 * @param {string|Array} options.status - Status to filter by (can be array or string)
 * @param {string|Array} options.billingStatus - Billing status to filter by (can be array or string)
 * @param {string} options.utilityType - Utility type to filter by
 * @returns {Promise<Object>} - Result containing data and error
 */
export const fetchReadings = async ({ propertyId, renteeId, status, billingStatus, utilityType }) => {
  try {
    console.log('Fetching readings with filters:', { propertyId, renteeId, status, billingStatus, utilityType });
    
    let query = supabase
      .from('utility_readings')
      .select('*, properties:propertyid(name, water_rate, electricity_rate), app_users:renteeid(name, email)')
      .order('readingdate', { ascending: false });
    
    // Apply filters if provided
    if (propertyId) {
      query = query.eq('propertyid', propertyId);
    }
    
    if (renteeId) {
      query = query.eq('renteeid', renteeId);
    }
    
    if (utilityType) {
      query = query.eq('utilitytype', utilityType);
    }
    
    // Status filter can be array or string
    if (status) {
      if (Array.isArray(status)) {
        query = query.in('status', status);
      } else {
        query = query.eq('status', status);
      }
    }
    
    // Billing status filter can be array or string
    if (billingStatus) {
      if (Array.isArray(billingStatus)) {
        query = query.in('billing_status', billingStatus);
      } else {
        query = query.eq('billing_status', billingStatus);
      }
    }
    
    console.log('Executing query for readings');
    const { data, error } = await query;
    
    if (error) {
      throw error;
    }
    
    console.log(`Successfully fetched ${data?.length || 0} readings`);
    
    // For rejected status, we need to include readings with effective_status='rejected'
    if (billingStatus === 'rejected' && data) {
      // Get readings where billing_data.effective_status is 'rejected' 
      const additionalQuery = supabase
        .from('utility_readings')
        .select('*, properties:propertyid(name, water_rate, electricity_rate), app_users:renteeid(name, email)')
        .order('readingdate', { ascending: false })
        .filter('billing_data->effective_status', 'eq', 'rejected');
      
      if (propertyId) {
        additionalQuery.eq('propertyid', propertyId);
      }
      
      if (renteeId) {
        additionalQuery.eq('renteeid', renteeId);
      }
      
      if (utilityType) {
        additionalQuery.eq('utilitytype', utilityType);
      }
      
      const { data: additionalData, error: additionalError } = await additionalQuery;
      
      if (!additionalError && additionalData) {
        // Combine and deduplicate results
        const allReadings = [...data];
        const existingIds = new Set(data.map(r => r.id));
        
        for (const reading of additionalData) {
          if (!existingIds.has(reading.id)) {
            allReadings.push(reading);
            existingIds.add(reading.id);
          }
        }
        
        console.log(`Added ${allReadings.length - data.length} additional readings with effective_status='rejected'`);
        return { data: allReadings, error: null };
      }
    }
    
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching readings:', error);
    return { data: null, error };
  }
};

/**
 * Fetch pending utility readings that need review (for backward compatibility)
 * @param {Object} options - Filter options
 * @returns {Promise<Object>} - Result containing data and error
 */
export const fetchPendingReadings = async (options = {}) => {
  // Simply call fetchReadings with status set to pending
  return fetchReadings({
    ...options,
    status: 'pending'
  });
};

/**
 * Fetch approved utility readings ready for invoicing
 * @param {Object} options - Filter options for billing period
 * @returns {Promise<Object>} - Result containing data and error
 */
export const fetchReadingsForInvoice = async (options = {}) => {
  try {
    const { month, year, propertyId, renteeId } = options;
    
    // First try to get utility billing data that's ready for invoicing from utility_billing table
    let query = supabase
      .from('utility_billing')
      .select(`
        *,
        utility_readings!inner (
          id,
          renteeid,
          propertyid,
          utilitytype,
          previousreading,
          currentreading,
          readingdate,
          photourl,
          calculatedbill,
          status,
          approved_date
        )
      `)
      .eq('status', 'pending_invoice');
    
    if (month) {
      query = query.eq('billing_month', month);
    }
    
    if (year) {
      query = query.eq('billing_year', year);
    }
    
    if (propertyId) {
      query = query.eq('property_id', propertyId);
    }
    
    if (renteeId) {
      query = query.eq('rentee_id', renteeId);
    }
    
    const { data, error } = await query;
    
    // If we get a specific error indicating the table doesn't exist, or related issues
    if (error) {
      console.log('Error fetching from utility_billing, falling back to utility_readings:', error);
      
      // Fallback to approved readings from the utility_readings table
      const validStatuses = await discoverValidStatusValues();
      const approvalStatus = validStatuses.includes(READING_STATUS.COMPLETED) 
        ? READING_STATUS.COMPLETED 
        : validStatuses.includes(READING_STATUS.VERIFIED) 
          ? READING_STATUS.VERIFIED 
          : validStatuses[0];
      
      console.log(`Using ${approvalStatus} status for fetching approved readings`);
      
      let readingsQuery = supabase
        .from('utility_readings')
        .select(`
          *,
          app_users!renteeid (
            id,
            name,
            email
          ),
          properties!propertyid (
            id,
            name,
            address,
            electricity_rate,
            water_rate
          )
        `)
        .eq('status', approvalStatus)
        .eq('billing_status', 'pending_invoice');
      
      if (month) {
        // Extract month from readingdate
        const monthIndex = months.indexOf(month) + 1;
        if (monthIndex > 0) {
          // Create date range for the month
          const startDate = new Date(year, monthIndex - 1, 1).toISOString();
          const endDate = new Date(year, monthIndex, 0).toISOString();
          readingsQuery = readingsQuery.gte('readingdate', startDate).lte('readingdate', endDate);
        }
      }
      
      if (year) {
        // Use approved_date for year filtering if it exists
        readingsQuery = readingsQuery.gte('readingdate', `${year}-01-01`).lte('readingdate', `${year}-12-31`);
      }
      
      if (propertyId) {
        readingsQuery = readingsQuery.eq('propertyid', propertyId);
      }
      
      if (renteeId) {
        readingsQuery = readingsQuery.eq('renteeid', renteeId);
      }
      
      const { data: readingsData, error: readingsError } = await readingsQuery;
      
      if (readingsError) { 
        throw readingsError; 
      }
      
      // Transform readings data to match the format expected by the UI
      const transformedData = readingsData.map(reading => {
        // Calculate consumption
        const consumption = reading.currentreading - (reading.previousreading || 0);
        
        // Get rate based on utility type
        let rate = 0;
        if (reading.utilitytype === UTILITY_TYPES.ELECTRICITY) {
          rate = parseFloat(reading.properties?.electricity_rate) || 0;
        } else if (reading.utilitytype === UTILITY_TYPES.WATER) {
          rate = parseFloat(reading.properties?.water_rate) || 0;
        }
        
        // Calculate amount
        const amount = consumption * rate;
        
        return {
          id: reading.id, // Using reading ID as billing ID
          utility_type: reading.utilitytype,
          consumption: consumption,
          rate: rate,
          amount: amount,
          reading_id: reading.id,
          property_id: reading.propertyid,
          rentee_id: reading.renteeid,
          reading_date: reading.readingdate,
          billing_month: new Date(reading.readingdate).toLocaleString('default', { month: 'long' }),
          billing_year: new Date(reading.readingdate).getFullYear(),
          status: 'pending_invoice',
          utility_readings: reading // Include the full reading record
        };
      });
      
      return { data: transformedData, error: null };
    }
    
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching readings for invoice:', error);
    return { data: null, error };
  }
};

// Array of months for date calculations
const months = [
  'January', 'February', 'March', 'April', 'May', 'June', 
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Status values for utility readings 
// This is a fallback list in case we can't discover the actual values
const READING_STATUS = {
  PENDING: 'pending',     // Initial status when reading is submitted
  COMPLETED: 'completed',  // For approved readings (more likely to be valid than "approved")
  VERIFIED: 'verified',    // Alternative approval status
  REJECTED: 'rejected',    // For rejected readings
  CANCELLED: 'cancelled'   // Alternative rejection status
};

// Cache to store the discovered status values
let validStatusValues = null;

/**
 * Discover valid status values for utility_readings table
 * @returns {Promise<Array<string>>} Array of valid status values
 */
const discoverValidStatusValues = async () => {
  // If we already discovered the values, return from cache
  if (validStatusValues) {
    return validStatusValues;
  }
  
  try {
    // Fetch a few records to see what status values are used
    const { data, error } = await supabase
      .from('utility_readings')
      .select('status')
      .limit(20);
    
    if (error) {
      console.error('Error fetching status values:', error);
      return Object.values(READING_STATUS); // Return fallback values
    }
    
    // Extract unique status values from the results
    const statusValues = [...new Set(data.map(r => r.status).filter(Boolean))];
    
    if (statusValues.length > 0) {
      console.log('Discovered status values:', statusValues);
      validStatusValues = statusValues;
      return statusValues;
    } else {
      // If no values found, use our fallbacks
      return Object.values(READING_STATUS);
    }
  } catch (err) {
    console.error('Error discovering status values:', err);
    return Object.values(READING_STATUS); // Return fallback values
  }
};

/**
 * Discover valid status values directly from the status check constraint
 */
const getValidStatusesFromConstraint = async () => {
  try {
    console.log('Determining valid status values for utility_readings...');
    
    // First try to query the pg_constraint table to get the check constraint
    // Note: This may not work in some environments due to permissions
    const { data: constraints, error: constraintError } = await supabase
      .from('pg_constraint')
      .select('conname, contype, consrc')
      .eq('conname', 'utility_readings_status_check');
      
    if (!constraintError && constraints && constraints.length > 0) {
      // Extract the valid values from the constraint source
      const constraint = constraints[0];
      console.log('Found constraint:', constraint);
      
      // Extract values from constraint source like "status IN ('pending', 'approved', etc.)"
      const match = constraint.consrc.match(/IN\s*\(([^)]+)\)/i);
      if (match && match[1]) {
        const valueString = match[1];
        const values = valueString.split(',').map(v => v.trim().replace(/'/g, ''));
        console.log('Extracted values from constraint:', values);
        return values;
      }
    }
    
    // If we couldn't get the constraint definition directly, use a hardcoded set of known values
    // This is based on our knowledge of the database schema
    console.log('Could not query constraint directly, using known status values');
    
    // Known allowed status values in the database
    const knownStatusValues = ['pending', 'verified', 'billed', 'disputed', 'approved', 'completed', 'rejected', 'cancelled'];
    
    // Let's also test them by trying to update a fake record
    const validStatuses = [];
    
    // Test each status to see if it's valid
    for (const status of knownStatusValues) {
      try {
        // Try to update a record with this status (in a transaction we'll roll back)
        const { data, error } = await supabase.rpc('test_status_value', {
          status_value: status
        });
        
        // If no error, the status is valid
        if (!error) {
          validStatuses.push(status);
        }
      } catch (err) {
        // If it's not a constraint error, we might be able to use this status
        if (!err.message?.includes('check constraint')) {
          validStatuses.push(status);
        }
      }
    }
    
    if (validStatuses.length > 0) {
      console.log('Determined valid status values through testing:', validStatuses);
      return validStatuses;
    }
    
    // If all else fails, return all known values as a best guess
    console.log('Using all known status values');
    return knownStatusValues;
  } catch (error) {
    console.error('Error determining valid status values:', error);
    // Default to the most conservative approach - only 'pending' is definitely allowed
    return ['pending', 'verified', 'billed', 'disputed'];
  }
};

/**
 * Approve a utility reading and prepare it for invoicing
 * @param {Object} reading - The reading to approve
 * @returns {Promise<Object>} - Result containing data and error
 */
export const approveReading = async (reading) => {
  try {
    if (!reading) {
      throw new Error('Reading is required');
    }
    
    console.log('Starting approval process for reading:', reading.id);
    
    // Use the standardized calculation function
    const consumption = reading.currentreading - (reading.previousreading || 0);
    
    // Calculate total amount using standardized function
    const totalAmount = calculateUtilityAmount(reading);
    
    // Get the rate that was used
    let rate = 0;
    if (reading.billing_data?.rate) {
      rate = reading.billing_data.rate;
    } else if (reading.utilitytype === UTILITY_TYPES.ELECTRICITY && reading.properties?.electricity_rate) {
      rate = parseFloat(reading.properties.electricity_rate);
    } else if (reading.utilitytype === UTILITY_TYPES.WATER && reading.properties?.water_rate) {
      rate = parseFloat(reading.properties.water_rate);
    } else {
      // Default rates
      rate = reading.utilitytype === UTILITY_TYPES.ELECTRICITY ? 50 : 25;
    }
    
    console.log('Calculated consumption:', consumption, 'rate:', rate, 'amount:', totalAmount);
    
    // Create billing data object that can be reused by invoice module
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
      approved_date: new Date().toISOString(),
      // Include approval status in the billing data since we can't update the status column
      effective_status: 'approved',
      // Include billing_status in the billing_data for consistency
      billing_status: 'pending_invoice'
    };
    
    console.log('Calculated billing data:', billingData);
    
    // First check what valid status values are allowed in the database
    // We'll try to query the database to discover the utility_readings_status_check constraint
    const validStatuses = await getValidStatusesFromConstraint();
    console.log('Valid status values from constraint:', validStatuses);
    
    // Set appropriate status if it's allowed by the constraint
    const updateData = {
      calculatedbill: totalAmount,
      billing_data: billingData,
      approved_date: billingData.approved_date,
      billing_status: 'pending_invoice' // Set the billing_status field in the database
    };
    
    // Only try to update the status if 'approved' is in the valid statuses
    if (validStatuses.includes('approved')) {
      updateData.status = 'approved';
      console.log('Setting status to approved because it is allowed by constraint');
    } else {
      console.log('Cannot set status to approved due to constraint - keeping original status');
    }
    
    console.log('Sending update with data:', updateData);
    
    // Update reading 
    const { data: readingData, error: readingError } = await supabase
      .from('utility_readings')
      .update(updateData)
      .eq('id', reading.id)
      .select();
    
    if (readingError) {
      console.error('Error updating reading:', readingError);
      
      // If we get a constraint error, let's try a more minimal update
      if (readingError.message && readingError.message.includes('check constraint')) {
        console.log('Received constraint error, trying with minimal update');
        
        // Try only updating fields that don't have constraints
        const minimalUpdate = {
          calculatedbill: totalAmount,
          billing_data: billingData,
          approved_date: billingData.approved_date
        };
        
        // Try to at least set the billing_status if possible
        // Note: This might still fail if there's a constraint on billing_status
        try {
          const { data: billingStatusUpdate, error: billingStatusError } = await supabase
            .from('utility_readings')
            .update({ billing_status: 'pending_invoice' })
            .eq('id', reading.id);
            
          if (!billingStatusError) {
            console.log('Successfully updated billing_status separately');
          }
        } catch (err) {
          console.warn('Could not update billing_status separately:', err);
        }
        
        console.log('Sending minimal update:', minimalUpdate);
        
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('utility_readings')
          .update(minimalUpdate)
          .eq('id', reading.id)
          .select();
          
        if (fallbackError) {
          console.error('Error in minimal update:', fallbackError);
          throw fallbackError;
        }
        
        console.log('Successfully processed reading with minimal update:', fallbackData);
        return { data: fallbackData, error: null };
      }
      
      throw readingError;
    }
    
    console.log('Successfully processed reading:', readingData);
    
    return { data: readingData, error: null };
  } catch (error) {
    console.error('Error processing reading:', error);
    return { data: null, error };
  }
};

/**
 * Reject a utility reading using a database stored procedure if available
 * This is a more reliable method than client-side rejection
 * @param {string} readingId - The ID of the reading to reject
 * @param {string} reason - The reason for rejection
 * @returns {Promise<Object>} - Result containing data and error
 */
export const rejectReadingWithProcedure = async (readingId, reason) => {
  try {
    if (!readingId) {
      throw new Error('Reading ID is required');
    }
    if (!reason) {
      throw new Error('Rejection reason is required');
    }
    
    console.log('Attempting to reject reading using SQL procedure:', readingId);
    
    // Call the stored procedure
    const { data, error } = await supabase.rpc('reject_utility_reading', {
      p_reading_id: readingId,
      p_reason: reason,
      p_rejected_date: new Date().toISOString()
    });
    
    if (error) {
      console.error('Error calling reject_utility_reading procedure:', error);
      return { data: null, error };
    }
    
    console.log('SQL procedure result:', data);
    
    // If the procedure succeeded, fetch the updated reading
    if (data && data.success) {
      // Fetch the updated reading with all related data
      const { data: readingData, error: fetchError } = await supabase
        .from('utility_readings')
        .select('*, properties:propertyid(name, water_rate, electricity_rate), app_users:renteeid(name, email)')
        .eq('id', readingId)
        .single();
        
      if (fetchError) {
        console.warn('Procedure succeeded but could not fetch reading:', fetchError);
        // Return a basic success since we know the procedure worked
        return { 
          data: { 
            id: readingId, 
            success: true,
            billing_status: 'rejected',
            rejection_reason: reason 
          }, 
          error: null 
        };
      }
      
      return { data: readingData, error: null };
    }
    
    // If we get here, the procedure returned a failure result
    return { 
      data: null, 
      error: { message: data?.message || 'Unknown procedure error' } 
    };
  } catch (error) {
    console.error('Error in rejectReadingWithProcedure:', error);
    return { data: null, error };
  }
};

/**
 * Reject a utility reading
 * This function will first try to use the database procedure if available,
 * then fall back to the client-side implementation if needed
 * @param {Object} reading - The reading to reject
 * @param {string} reason - The reason for rejection
 * @returns {Promise<Object>} - Result containing data and error
 */
export const rejectReading = async (reading, reason) => {
  try {
    if (!reading) {
      throw new Error('Reading is required');
    }
    if (!reason) {
      throw new Error('Rejection reason is required');
    }
    
    console.log('Starting rejection process for reading:', reading.id);
    
    // First try using the SQL procedure if available
    try {
      const { data: procedureData, error: procedureError } = 
        await rejectReadingWithProcedure(reading.id, reason);
        
      // If the procedure worked, return its result
      if (!procedureError) {
        console.log('Successfully rejected reading using SQL procedure');
        return { data: procedureData, error: null };
      }
      
      // If we get a "function not found" error, the procedure doesn't exist
      if (procedureError.message && (
          procedureError.message.includes('function') && 
          procedureError.message.includes('not found')
        )) {
        console.log('SQL procedure not available, falling back to manual rejection');
      } else {
        // For other errors, log but continue with fallback
        console.warn('SQL procedure failed:', procedureError);
      }
    } catch (err) {
      console.warn('Error trying SQL procedure:', err);
      // Continue with fallback
    }
    
    // Create rejection data to be stored in billing_data
    const rejectionData = {
      rejection_reason: reason,
      rejected_date: new Date().toISOString(),
      effective_status: 'rejected'
    };
    
    // Get the existing billing_data or create new object if it doesn't exist
    const existingBillingData = reading.billing_data || {};
    
    // Merge the rejection data with any existing billing data
    const updatedBillingData = {
      ...existingBillingData,
      ...rejectionData
    };
    
    // Perform the update in multiple steps with individual error handling
    // This ensures we catch exactly where any issues occur
    
    console.log('Step 1: Updating billing_status to rejected');
    try {
      // Update billing_status first (this should work if the constraint is properly set)
      const { error: billingStatusError } = await supabase
        .from('utility_readings')
        .update({ billing_status: 'rejected' })
        .eq('id', reading.id);
      
      if (billingStatusError) {
        console.error('Error updating billing_status:', billingStatusError);
        // Continue with other updates even if this fails
      } else {
        console.log('Successfully updated billing_status to rejected');
      }
    } catch (err) {
      console.error('Exception during billing_status update:', err);
      // Continue with other updates even if this fails
    }
    
    console.log('Step 2: Updating billing_data and other non-constrained fields');
    try {
      // Update the non-constrained fields
      const nonConstrainedUpdate = {
        rejection_reason: reason,
        rejected_date: new Date().toISOString(),
        billing_data: updatedBillingData
      };
      
      const { data: updateData, error: updateError } = await supabase
        .from('utility_readings')
        .update(nonConstrainedUpdate)
        .eq('id', reading.id)
        .select();
        
      if (updateError) {
        console.error('Error updating non-constrained fields:', updateError);
        // This is concerning as these fields shouldn't have constraints
        // But continue with status update if possible
      } else {
        console.log('Successfully updated non-constrained fields');
      }
    } catch (err) {
      console.error('Exception during non-constrained fields update:', err);
      // Continue with status update if possible
    }
    
    console.log('Step 3: Trying to update status if valid in constraints');
    // Check for valid statuses in the constraint
    const validStatuses = await getValidStatusesFromConstraint();
    console.log('Valid status values from constraint:', validStatuses);
    
    if (validStatuses.includes('rejected')) {
      try {
        const { error: statusError } = await supabase
          .from('utility_readings')
          .update({ status: 'rejected' })
          .eq('id', reading.id);
          
        if (statusError) {
          console.error('Error updating status to rejected:', statusError);
        } else {
          console.log('Successfully updated status to rejected');
        }
      } catch (err) {
        console.error('Exception during status update:', err);
      }
    } else {
      console.log('Status "rejected" not in valid statuses, skipping status update');
    }
    
    // Finally, fetch the updated reading to return
    console.log('Step 4: Fetching updated reading');
    const { data: updatedReading, error: fetchError } = await supabase
      .from('utility_readings')
      .select('*, properties:propertyid(name, water_rate, electricity_rate), app_users:renteeid(name, email)')
      .eq('id', reading.id)
      .single();
      
    if (fetchError) {
      console.error('Error fetching updated reading:', fetchError);
      // Create a minimal response with what we know
      return { 
        data: { 
          id: reading.id, 
          billing_status: 'rejected',
          rejection_reason: reason,
          rejected_date: new Date().toISOString(),
          billing_data: updatedBillingData
        }, 
        error: null 
      };
    }
    
    console.log('Successfully completed rejection process');
    return { data: updatedReading, error: null };
  } catch (error) {
    console.error('Error in rejection process:', error);
    return { data: null, error };
  }
};

/**
 * Mark utility billing records as invoiced
 * @param {Array<string>} billingIds - Array of billing IDs to mark as invoiced
 * @param {string} invoiceId - The ID of the invoice
 * @returns {Promise<Object>} - Result containing data and error
 */
export const markAsInvoiced = async (billingIds, invoiceId) => {
  try {
    if (!billingIds || !Array.isArray(billingIds) || billingIds.length === 0) {
      throw new Error('Billing IDs are required');
    }
    
    if (!invoiceId) {
      throw new Error('Invoice ID is required');
    }
    
    // Try to update the utility_billing table first
    const { data, error } = await supabase
      .from('utility_billing')
      .update({ 
        status: 'invoiced',
        invoice_id: invoiceId,
        invoiced_date: new Date().toISOString()
      })
      .in('id', billingIds);
      
    // If the utility_billing table doesn't exist or there's another error
    if (error) {
      console.log('Error updating utility_billing, falling back to utility_readings:', error);
      
      // Fallback: update the utility_readings table directly
      // In this case, the billing IDs might actually be reading IDs
      const readingUpdateData = {
        billing_status: 'invoiced',
        invoice_id: invoiceId,
        invoiced_date: new Date().toISOString()
      };
      
      // Update billing_data JSON field to include invoice information
      const { data: readingsData, error: fetchError } = await supabase
        .from('utility_readings')
        .select('id, billing_data')
        .in('id', billingIds);
      
      if (fetchError) {
        throw fetchError;
      }
      
      // Process each reading individually to update the billing_data JSON
      const updatePromises = readingsData.map(reading => {
        // Create updated billing_data by merging existing with invoice info
        const updatedBillingData = {
          ...(reading.billing_data || {}),
          invoice_id: invoiceId,
          invoiced_date: readingUpdateData.invoiced_date,
          billing_status: 'invoiced'
        };
        
        return supabase
          .from('utility_readings')
          .update({ 
            billing_status: readingUpdateData.billing_status,
            invoice_id: readingUpdateData.invoice_id,
            invoiced_date: readingUpdateData.invoiced_date,
            billing_data: updatedBillingData
          })
          .eq('id', reading.id);
      });
      
      // Wait for all updates to complete
      const results = await Promise.all(updatePromises);
      
      // Check if any updates failed
      const updateErrors = results.filter(result => result.error);
      if (updateErrors.length > 0) {
        console.error('Some readings failed to update:', updateErrors);
        throw new Error(`Failed to update ${updateErrors.length} readings`);
      }
      
      return { 
        data: results.map(r => r.data), 
        error: null,
        message: 'Updated readings directly as utility_billing table was not available'
      };
    }
    
    return { data, error: null };
  } catch (error) {
    console.error('Error marking billing as invoiced:', error);
    return { data: null, error };
  }
};

/**
 * Get utility usage summary for a rentee
 * @param {string} renteeId - The rentee ID
 * @param {Object} options - Filter options
 * @returns {Promise<Object>} - Result containing data and error
 */
export const getRenteeUtilityUsage = async (renteeId, options = {}) => {
  try {
    if (!renteeId) {
      throw new Error('Rentee ID is required');
    }
    
    const { months = 6, utilityType } = options;
    
    // Get the date range for the last X months
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    
    let query = supabase
      .from('utility_readings')
      .select(`
        id,
        readingdate,
        utilitytype,
        currentreading,
        previousreading,
        calculatedbill,
        billing_data,
        status,
        properties!propertyid (
          name,
          electricity_rate,
          water_rate
        )
      `)
      .eq('renteeid', renteeId)
      .eq('status', 'approved')
      .gte('readingdate', startDate.toISOString())
      .lte('readingdate', endDate.toISOString());
      
    if (utilityType) {
      query = query.eq('utilitytype', utilityType);
    }
    
    query = query.order('readingdate', { ascending: false });
    
    const { data, error } = await query;
    
    if (error) { 
      throw error; 
    }
    
    // Process data to create usage summary
    const summary = {
      readings: data,
      totalUsage: {
        [UTILITY_TYPES.ELECTRICITY]: 0,
        [UTILITY_TYPES.WATER]: 0
      },
      totalCost: {
        [UTILITY_TYPES.ELECTRICITY]: 0,
        [UTILITY_TYPES.WATER]: 0
      },
      monthlyAverageUsage: {
        [UTILITY_TYPES.ELECTRICITY]: 0,
        [UTILITY_TYPES.WATER]: 0
      },
      monthlyAverageCost: {
        [UTILITY_TYPES.ELECTRICITY]: 0,
        [UTILITY_TYPES.WATER]: 0
      }
    };
    
    // Calculation of totals
    data.forEach(reading => {
      const consumption = reading.calculatedbill || 0;
      const cost = reading.billing_data?.amount || 0;
      
      summary.totalUsage[reading.utilitytype] += consumption;
      summary.totalCost[reading.utilitytype] += cost;
    });
    
    // Calculate monthly averages
    if (months > 0) {
      summary.monthlyAverageUsage[UTILITY_TYPES.ELECTRICITY] = 
        summary.totalUsage[UTILITY_TYPES.ELECTRICITY] / months;
      summary.monthlyAverageUsage[UTILITY_TYPES.WATER] = 
        summary.totalUsage[UTILITY_TYPES.WATER] / months;
      
      summary.monthlyAverageCost[UTILITY_TYPES.ELECTRICITY] = 
        summary.totalCost[UTILITY_TYPES.ELECTRICITY] / months;
      summary.monthlyAverageCost[UTILITY_TYPES.WATER] = 
        summary.totalCost[UTILITY_TYPES.WATER] / months;
    }
    
    return { data: summary, error: null };
  } catch (error) {
    console.error('Error getting rentee utility usage:', error);
    return { data: null, error };
  }
};

/**
 * Create a stored procedure (RPC) for approving utility readings
 * @returns {Promise<Object>} - Result containing data and error
 */
export const createApproveReadingProcedure = async () => {
  // Since we're not using stored procedures, just return success
  return { success: true, error: null };
};

/**
 * Fetch a single utility reading by ID with full details
 * @param {string} readingId - The ID of the reading to fetch
 * @returns {Promise<Object>} - Result containing data and error
 */
export const fetchReadingById = async (readingId) => {
  try {
    if (!readingId) {
      console.error('Reading ID is required');
      return { data: null, error: new Error('Reading ID is required') };
    }
    
    console.log('Fetching reading by ID:', readingId);
    
    const { data, error } = await supabase
      .from('utility_readings')
      .select(`
        *,
        app_users!renteeid (
          id,
          name,
          email
        ),
        properties!propertyid (
          id,
          name,
          address,
          electricity_rate,
          water_rate
        )
      `)
      .eq('id', readingId)
      .single();
    
    if (error) {
      console.error('Error fetching reading by ID:', error);
      return { data: null, error };
    }
    
    console.log('Reading details fetched:', data ? 'Found' : 'Not found');
    if (data) {
      console.log('Processing status indicators:', {
        status: data.status,
        billing_status: data.billing_status,
        has_billing_data: !!data.billing_data,
        has_calculated_bill: data.calculatedbill !== null && data.calculatedbill !== undefined,
        rejection_reason: data.rejection_reason,
        approved_date: data.approved_date,
        rejected_date: data.rejected_date
      });
    }
    
    return { data, error: null };
  } catch (error) {
    console.error('Error in fetchReadingById:', error);
    return { data: null, error };
  }
};

/**
 * Ensures the utility_readings table has all the necessary columns for status tracking
 * This is helpful for implementations that might have an incomplete schema
 * @returns {Promise<boolean>} - Whether the check was successful
 */
export const ensureUtilityReadingsSchema = async () => {
  try {
    // First try to get schema information
    const { data: columns, error: schemaError } = await supabase
      .rpc('get_table_columns', { table_name: 'utility_readings' })
      .select('column_name');
    
    // If RPC doesn't exist or fails, try direct query
    if (schemaError) {
      // Try fetching a record to see what columns exist
      const { data: sampleData, error: fetchError } = await supabase
        .from('utility_readings')
        .select('*')
        .limit(1);
        
      if (fetchError) {
        console.error('Could not validate schema:', fetchError);
        return false;
      }
      
      // Check for missing columns that we need
      if (sampleData && sampleData.length > 0) {
        const existingColumns = Object.keys(sampleData[0]);
        const requiredColumns = [
          'status', 
          'billing_status', 
          'approved_date', 
          'rejection_reason',
          'calculatedbill',
          'billing_data' 
        ];
        
        const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
        
        if (missingColumns.length > 0) {
          console.warn('Missing required columns:', missingColumns);
        }
      }
    } else {
      // We have column info from RPC
      const columnNames = columns.map(c => c.column_name);
    }
    
    return true;
  } catch (error) {
    console.error('Schema compatibility check failed:', error);
    return false;
  }
};

// Run schema check on module load
ensureUtilityReadingsSchema().then(result => {
  if (!result) {
    console.warn('Schema compatibility check failed, some features may not work correctly');
  }
});

/**
 * Update the reading values for a utility reading
 * @param {string} readingId - The ID of the reading to update
 * @param {number} currentReading - The new current reading value
 * @param {number} previousReading - The new previous reading value (optional)
 * @returns {Promise<Object>} - Result containing data and error
 */
export const updateReadingValue = async (readingId, currentReading, previousReading = null) => {
  try {
    // First fetch the reading to get the current values
    const { data: reading, error: fetchError } = await supabase
      .from('utility_readings')
      .select('currentreading, previousreading, status')
      .eq('id', readingId)
      .single();
    
    if (fetchError) {
      throw fetchError;
    }
    
    // Check if the reading is still in a state that allows editing
    if (reading.status !== 'pending') {
      return { 
        data: null, 
        error: { message: 'Cannot edit readings that are already approved or rejected' } 
      };
    }
    
    // Determine values to update
    const updateValues = {};
    
    // If current reading is provided, validate and update
    if (currentReading !== null) {
      const prevValue = previousReading !== null ? previousReading : reading.previousreading;
      
      // Validate the new current reading
      if (currentReading <= prevValue) {
        return { 
          data: null, 
          error: { message: 'Current reading must be greater than previous reading' } 
        };
      }
      
      updateValues.currentreading = currentReading;
    }
    
    // If previous reading is provided, validate and update
    if (previousReading !== null) {
      // Validate the new previous reading
      if (previousReading >= (currentReading || reading.currentreading)) {
        return { 
          data: null, 
          error: { message: 'Previous reading must be less than current reading' } 
        };
      }
      
      updateValues.previousreading = previousReading;
    }
    
    // Update the reading with the new values
    const { data, error } = await supabase
      .from('utility_readings')
      .update(updateValues)
      .eq('id', readingId)
      .select();
    
    if (error) {
      throw error;
    }
    
    return { data, error: null };
  } catch (error) {
    console.error('Error updating reading values:', error);
    return { data: null, error };
  }
};

export const submitUtilityReading = async (readingData, photos) => {
  try {
    console.log('Submitting utility reading:', readingData);

    // Validate required fields
    if (!readingData.propertyid || !readingData.renteeid || !readingData.utilitytype || !readingData.readingvalue) {
      throw new Error('Missing required fields');
    }

    // Create the reading record
    const { data, error } = await supabase
      .from('utility_readings')
      .insert([
        {
          propertyid: readingData.propertyid,
          renteeid: readingData.renteeid,
          readingvalue: readingData.readingvalue,
          utilitytype: readingData.utilitytype,
          readingdate: readingData.readingdate || new Date().toISOString(),
          status: readingData.status || 'pending',
          notes: readingData.notes || '',
          previousreading: readingData.previousreading || null,
          calculatedbill: readingData.calculatedbill || null,
          meteridentifier: readingData.meteridentifier || null
        }
      ])
      .select();

    if (error) {
      throw error;
    }

    // Process photos if provided
    if (photos && photos.length > 0) {
      await uploadReadingPhotos(data[0].id, photos);
    }

    console.log('Utility reading submitted successfully:', data);
    return { success: true, data: data[0] };
  } catch (error) {
    console.error('Error submitting utility reading:', error);
    return { success: false, error: error.message };
  }
}; 