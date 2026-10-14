import { platform as platformClient } from './platformClient';
import { UTILITY_TYPES } from '../utils/constants';
import { listUtilityInvoicePreviewRows } from './utilityInvoicePreviewReadClient';

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
    
    let query = platformClient
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
      const additionalQuery = platformClient
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
    const data = await listUtilityInvoicePreviewRows(options);
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching readings for invoice preview:', error);
    return { data: null, error };
  }
};

// Array of months for date calculations
const months = [
  'January', 'February', 'March', 'April', 'May', 'June', 
  'July', 'August', 'September', 'October', 'November', 'December'
];

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
    
    let query = platformClient
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
    
    const { data, error } = await platformClient
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
    const { data: columns, error: schemaError } = await platformClient.rpc('get_table_columns', { table_name: 'utility_readings' });
    
    // If RPC doesn't exist or fails, try direct query
    if (schemaError) {
      // Try fetching a record to see what columns exist
      const { data: sampleData, error: fetchError } = await platformClient
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
      const columnNames = (columns || []).map((column) => typeof column === 'string' ? column : column.column_name).filter(Boolean);
      if (columnNames.length === 0) {
        return true;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Schema compatibility check failed:', error);
    return false;
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
    const { data, error } = await platformClient
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