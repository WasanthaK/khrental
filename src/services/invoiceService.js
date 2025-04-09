import { supabase } from './supabaseClient';
import { calculateUtilityAmount } from './utilityBillingService';
import { formatErrorMessage } from '../utils/errorFormatting';

/**
 * Fetch utility readings ready for invoicing, grouped by property and rentee
 * @param {Array|string} propertyIds - Property IDs to filter by (array or single ID)
 * @param {Object} options - Additional filter options
 * @returns {Promise<Object>} - Grouped readings with property and rentee info
 */
export const fetchReadingsForInvoiceByProperty = async (propertyIds, options = {}) => {
  try {
    console.log('Fetching readings for invoice by property:', { propertyIds, options });
    
    // Handle single propertyId case
    const propertyIdsArray = Array.isArray(propertyIds) ? propertyIds : [propertyIds];
    
    // Start building the query
    let query = supabase
      .from('utility_readings')
      .select(`
        *,
        properties:propertyid(id, name, bank_name, bank_branch, bank_account_number, electricity_rate, water_rate),
        app_users:renteeid(id, name, email, contact_details)
      `)
      .in('propertyid', propertyIdsArray)
      .eq('billing_status', 'pending_invoice')
      .order('readingdate', { ascending: false });
      
    // Apply additional filters if provided
    if (options.renteeId) {
      query = query.eq('renteeid', options.renteeId);
    }
    
    if (options.utilityType) {
      query = query.eq('utilitytype', options.utilityType);
    }
    
    if (options.fromDate) {
      query = query.gte('readingdate', options.fromDate);
    }
    
    if (options.toDate) {
      query = query.lte('readingdate', options.toDate);
    }
    
    // Execute the query
    const { data, error } = await query;
    
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
        reading.calculatedbill = calculateUtilityAmount(reading);
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

/**
 * Fetches readings eligible for invoice generation (alternative implementation using new schema)
 * @param {Array} propertyIds - Array of property IDs to filter by
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} - Object containing data and error
 */
export async function fetchReadingsForInvoice(propertyIds, options = {}) {
  try {
    let query = supabase
      .from('utility_readings')
      .select(`
        id,
        reading_date,
        reading_value,
        utility_type,
        notes,
        status,
        billing_status,
        billing_data,
        property_id,
        rentee_id,
        properties:property_id (id, name, address),
        rentees:rentee_id (id, first_name, last_name, email)
      `)
      .eq('billing_status', 'pending_invoice');
    
    // Filter by property IDs if provided
    if (propertyIds && propertyIds.length > 0) {
      query = query.in('property_id', propertyIds);
    }
    
    // Filter by utility type if provided
    if (options.utilityType) {
      query = query.eq('utility_type', options.utilityType);
    }
    
    // Filter by date range if provided
    if (options.fromDate) {
      query = query.gte('reading_date', options.fromDate);
    }
    
    if (options.toDate) {
      query = query.lte('reading_date', options.toDate);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw new Error(formatErrorMessage(error));
    }
    
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching readings for invoice:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Generate invoices from utility readings for multiple properties
 * @param {Object} readingsByProperty - Readings grouped by property and rentee
 * @param {Object} options - Additional options for invoice generation
 * @returns {Promise<Object>} - Generated invoices with status
 */
export const generateInvoicesByProperty = async (readingsByProperty, options = {}) => {
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

/**
 * Generates invoices for the given properties and readings (alternative implementation)
 * @param {Array} readings - Array of readings to include in invoices
 * @param {Object} invoiceData - Invoice data (billing_period, due_date, etc.)
 * @returns {Promise<Object>} - Object containing generated invoices and error
 */
export async function generateInvoices(readings, invoiceData) {
  try {
    if (!readings || readings.length === 0) {
      return { data: [], error: 'No readings provided' };
    }
    
    // Group readings by rentee
    const readingsByRentee = {};
    
    readings.forEach(reading => {
      const renteeId = reading.rentee_id;
      if (!readingsByRentee[renteeId]) {
        readingsByRentee[renteeId] = [];
      }
      readingsByRentee[renteeId].push(reading);
    });
    
    const invoicesCreated = [];
    
    // Process each rentee's readings
    for (const renteeId in readingsByRentee) {
      const renteeReadings = readingsByRentee[renteeId];
      const propertyId = renteeReadings[0].property_id;
      
      // Calculate total amount
      let totalAmount = 0;
      
      renteeReadings.forEach(reading => {
        // Get amount from billing_data if available
        if (reading.billing_data && reading.billing_data.amount) {
          totalAmount += parseFloat(reading.billing_data.amount);
        }
      });
      
      // Create invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          rentee_id: renteeId,
          property_id: propertyId,
          type: 'utility',
          status: 'pending',
          amount: totalAmount,
          billing_period: invoiceData.billing_period,
          due_date: invoiceData.due_date,
          issue_date: new Date().toISOString(),
          notes: invoiceData.notes || 'Utility billing'
        })
        .select()
        .single();
      
      if (invoiceError) {
        throw new Error(formatErrorMessage(invoiceError));
      }
      
      // Update readings with invoice ID
      const readingIds = renteeReadings.map(reading => reading.id);
      
      const { error: updateError } = await supabase
        .from('utility_readings')
        .update({
          invoice_id: invoice.id,
          billing_status: 'billed'
        })
        .in('id', readingIds);
      
      if (updateError) {
        throw new Error(formatErrorMessage(updateError));
      }
      
      invoicesCreated.push({
        ...invoice,
        readingCount: renteeReadings.length
      });
    }
    
    return { data: invoicesCreated, error: null };
  } catch (error) {
    console.error('Error generating invoices:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Get invoice summary metrics grouped by property
 * @param {Array|string} propertyIds - Property IDs to include (optional)
 * @param {Object} options - Filter options like date range, status
 * @returns {Promise<Object>} - Summary metrics by property
 */
export async function getInvoiceSummaryByProperty(propertyIds, options = {}) {
  try {
    if (!propertyIds || propertyIds.length === 0) {
      return { data: {}, error: null };
    }
    
    let query = supabase
      .from('invoices')
      .select(`
        id,
        rentee_id,
        property_id,
        type,
        status,
        amount,
        due_date,
        issue_date,
        properties:property_id (id, name, address)
      `)
      .in('property_id', propertyIds);
    
    // Apply filters
    if (options.status && options.status !== 'all') {
      query = query.eq('status', options.status);
    }
    
    if (options.fromDate) {
      query = query.gte('issue_date', options.fromDate);
    }
    
    if (options.toDate) {
      query = query.lte('issue_date', options.toDate);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw new Error(formatErrorMessage(error));
    }
    
    // Group and summarize by property
    const summaryByProperty = {};
    
    propertyIds.forEach(propertyId => {
      summaryByProperty[propertyId] = {
        totalInvoices: 0,
        totalAmount: 0,
        pendingAmount: 0,
        paidAmount: 0
      };
    });
    
    data.forEach(invoice => {
      const propertyId = invoice.property_id;
      const amount = parseFloat(invoice.amount) || 0;
      
      summaryByProperty[propertyId].totalInvoices += 1;
      summaryByProperty[propertyId].totalAmount += amount;
      
      if (invoice.status === 'paid') {
        summaryByProperty[propertyId].paidAmount += amount;
      } else {
        summaryByProperty[propertyId].pendingAmount += amount;
      }
    });
    
    return { data: summaryByProperty, error: null };
  } catch (error) {
    console.error('Error getting invoice summary by property:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Get properties with pending utility readings that need invoicing
 * @returns {Promise<Object>} - List of properties with pending reading counts
 */
export async function getPropertiesWithPendingReadings() {
  try {
    // First get properties with pending readings
    const { data: propertiesData, error: propertiesError } = await supabase
      .from('utility_readings')
      .select('property_id')
      .eq('billing_status', 'pending_invoice')
      .is('invoice_id', null);
    
    if (propertiesError) {
      throw new Error(formatErrorMessage(propertiesError));
    }
    
    if (!propertiesData || propertiesData.length === 0) {
      return { data: [], error: null };
    }
    
    // Get unique property IDs
    const propertyIds = [...new Set(propertiesData.map(reading => reading.property_id))];
    
    // Get property details
    const { data: properties, error: propDetailsError } = await supabase
      .from('properties')
      .select('id, name, address')
      .in('id', propertyIds);
    
    if (propDetailsError) {
      throw new Error(formatErrorMessage(propDetailsError));
    }
    
    // Get count of pending readings for each property
    const counts = {};
    
    for (const property of properties) {
      const { count, error: countError } = await supabase
        .from('utility_readings')
        .select('id', { count: 'exact', head: false })
        .eq('property_id', property.id)
        .eq('billing_status', 'pending_invoice')
        .is('invoice_id', null);
      
      if (countError) {
        console.error(`Error getting reading count for property ${property.id}:`, countError);
        counts[property.id] = 0;
      } else {
        counts[property.id] = count;
      }
    }
    
    // Combine property data with counts
    const result = properties.map(property => ({
      ...property,
      pendingReadingsCount: counts[property.id] || 0
    }));
    
    return { data: result, error: null };
  } catch (error) {
    console.error('Error getting properties with pending readings:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Get invoices for multiple properties
 * @param {Array|string} propertyIds - Property IDs to filter by (optional)
 * @param {Object} options - Additional filter options
 * @returns {Promise<Object>} - List of invoices matching criteria
 */
export const getInvoicesByProperty = async (propertyIds, options = {}) => {
  try {
    console.log('Getting invoices by property:', { propertyIds, options });
    
    // Build query
    let query = supabase
      .from('invoices')
      .select(`
        *,
        properties:propertyid(id, name, address),
        app_users:renteeid(id, name, email, contact_details)
      `);
    
    // Filter by property if provided
    if (propertyIds) {
      const propertyIdsArray = Array.isArray(propertyIds) ? propertyIds : [propertyIds];
      query = query.in('propertyid', propertyIdsArray);
    }
    
    // Apply additional filters
    if (options.status) {
      if (Array.isArray(options.status)) {
        query = query.in('status', options.status);
      } else {
        query = query.eq('status', options.status);
      }
    }
    
    if (options.renteeId) {
      query = query.eq('renteeid', options.renteeId);
    }
    
    if (options.fromDate) {
      query = query.gte('createdat', options.fromDate);
    }
    
    if (options.toDate) {
      query = query.lte('createdat', options.toDate);
    }
    
    if (options.billingPeriod) {
      query = query.eq('billingperiod', options.billingPeriod);
    }
    
    // Add pagination
    if (options.page && options.pageSize) {
      const from = (options.page - 1) * options.pageSize;
      const to = from + options.pageSize - 1;
      query = query.range(from, to);
    }
    
    // Add sorting
    if (options.sortBy) {
      const order = options.sortOrder === 'asc' ? { ascending: true } : { ascending: false };
      query = query.order(options.sortBy, order);
    } else {
      // Default sort by creation date descending
      query = query.order('createdat', { ascending: false });
    }
    
    // Execute query
    const { data, error, count } = await query;
    
    if (error) {
      throw error;
    }
    
    // If we need a count for pagination, do a separate count query
    let totalCount = null;
    if (options.getTotalCount) {
      const countQuery = supabase
        .from('invoices')
        .select('id', { count: 'exact' });
      
      // Apply the same filters
      if (propertyIds) {
        const propertyIdsArray = Array.isArray(propertyIds) ? propertyIds : [propertyIds];
        countQuery.in('propertyid', propertyIdsArray);
      }
      
      if (options.status) {
        if (Array.isArray(options.status)) {
          countQuery.in('status', options.status);
        } else {
          countQuery.eq('status', options.status);
        }
      }
      
      if (options.renteeId) {
        countQuery.eq('renteeid', options.renteeId);
      }
      
      if (options.fromDate) {
        countQuery.gte('createdat', options.fromDate);
      }
      
      if (options.toDate) {
        countQuery.lte('createdat', options.toDate);
      }
      
      if (options.billingPeriod) {
        countQuery.eq('billingperiod', options.billingPeriod);
      }
      
      const { count: totalRecords } = await countQuery;
      totalCount = totalRecords;
    }
    
    console.log(`Successfully fetched ${data?.length || 0} invoices`);
    
    return { 
      data,
      count: totalCount,
      error: null,
      pagination: options.page && options.pageSize ? {
        page: options.page,
        pageSize: options.pageSize,
        totalCount
      } : null
    };
  } catch (error) {
    console.error('Error getting invoices by property:', error);
    return { data: null, error };
  }
};

/**
 * Gets property IDs that the current user has access to
 * @returns {Promise<Object>} - Object containing data and error
 */
export async function getCurrentUserPropertyAccess() {
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    
    if (userError) {
      throw new Error(formatErrorMessage(userError));
    }
    
    if (!userData?.user) {
      return { data: [], error: 'No authenticated user found' };
    }
    
    // Try to get staff profile first
    const { data: profile, error: profileError } = await supabase
      .from('staff')
      .select('id, user_id, role, properties_access')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    
    // If staff profile exists and has properties_access
    if (profile && !profileError) {
      // If admin or has full access, get all property IDs
      if (profile.role === 'admin' || !profile.properties_access || profile.properties_access.length === 0) {
        const { data: allProperties, error: propError } = await supabase
          .from('properties')
          .select('id');
        
        if (propError) {
          throw new Error(formatErrorMessage(propError));
        }
        
        return { data: allProperties.map(p => p.id), error: null };
      }
      
      // Otherwise, return the properties the user has access to
      return { data: profile.properties_access, error: null };
    }
    
    // Fallback to getting all properties
    // In a real implementation, you would check app_users or other tables for permissions
    const { data: allProperties, error: propError } = await supabase
      .from('properties')
      .select('id');
    
    if (propError) {
      throw new Error(formatErrorMessage(propError));
    }
    
    return { data: allProperties.map(p => p.id), error: null };
  } catch (error) {
    console.error('Error getting user property access:', error);
    return { data: null, error: error.message };
  }
} 