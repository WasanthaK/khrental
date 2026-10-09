import { platform as platformClient } from './platformClient';
import { calculateUtilityAmount } from './utilityBillingService';
import { formatErrorMessage } from '../utils/errorFormatting';
import { isMssqlApiEnabled, requestMssqlApi } from './mssqlApiClient';

const normalizeInvoiceRecord = (invoice) => {
  if (!invoice) {
    return invoice;
  }

  return {
    ...invoice,
    totalAmount: invoice.totalAmount ?? invoice.totalamount ?? invoice.amount ?? 0,
    paymentProofUrl: invoice.paymentProofUrl ?? invoice.paymentproofurl ?? null,
    reminderDate: invoice.reminderDate ?? invoice.reminderdate ?? invoice.remindersentat ?? null
  };
};

const buildInvoiceQuery = (options = {}) => {
  const query = new URLSearchParams();

  if (options.propertyId) {
    query.set('propertyId', options.propertyId);
  }

  if (options.renteeId) {
    query.set('renteeId', options.renteeId);
  }

  if (options.status && !Array.isArray(options.status)) {
    query.set('status', options.status);
  }

  if (options.billingPeriod) {
    query.set('billingPeriod', options.billingPeriod);
  }

  if (options.fromDate) {
    query.set('fromDate', options.fromDate);
  }

  if (options.toDate) {
    query.set('toDate', options.toDate);
  }

  if (options.page) {
    query.set('page', options.page);
  }

  if (options.pageSize) {
    query.set('pageSize', options.pageSize);
  }

  return query.toString();
};

export const listInvoices = async (options = {}) => {
  if (isMssqlApiEnabled()) {
    try {
      const query = buildInvoiceQuery(options);
      const path = query ? `/api/mssql/invoices?${query}` : '/api/mssql/invoices';
      const data = await requestMssqlApi(path);
      const invoices = Array.isArray(data) ? data.map(normalizeInvoiceRecord) : [];

      return { data: invoices, error: null };
    } catch (mssqlError) {
      console.error('Error loading invoices from MSSQL:', mssqlError);
      // Never retry under a different transport after an authoritative API failure.
      // In particular, an authorization or tenant-scope error must remain denied.
      return { data: null, error: mssqlError };
    }
  }

  try {
    let query = platformClient
      .from('invoices')
      .select('*');

    if (options.propertyId) {
      query = query.eq('propertyid', options.propertyId);
    }

    if (options.renteeId) {
      query = query.eq('renteeid', options.renteeId);
    }

    if (options.status) {
      if (Array.isArray(options.status)) {
        query = query.in('status', options.status);
      } else {
        query = query.eq('status', options.status);
      }
    }

    if (options.billingPeriod) {
      query = query.eq('billingperiod', options.billingPeriod);
    }

    if (options.fromDate) {
      query = query.gte('createdat', options.fromDate);
    }

    if (options.toDate) {
      query = query.lte('createdat', options.toDate);
    }

    if (options.page && options.pageSize) {
      const from = (options.page - 1) * options.pageSize;
      const to = from + options.pageSize - 1;
      query = query.range(from, to);
    }

    query = query.order(options.sortBy || 'createdat', {
      ascending: options.sortOrder === 'asc'
    });

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return {
      data: (data || []).map(normalizeInvoiceRecord),
      error: null
    };
  } catch (error) {
    console.error('Error loading invoices:', error);
    return { data: null, error };
  }
};

// Invoice and payment mutations are owned by the dedicated billing lifecycle API.
// Do not retry a rejected MSSQL request through the generic platform client:
// that could turn a denied or ambiguous request into an unintended write.
const billingLifecycleRequired = () => {
  const error = new Error('Invoice mutations must use the dedicated billing lifecycle API.');
  error.status = 409;
  error.code = 'BILLING_LIFECYCLE_REQUIRED';
  return error;
};

export const createInvoiceRecord = async (_invoiceData = {}) => {
  throw billingLifecycleRequired();
};

export const updateInvoiceRecord = async (_invoiceId, _updates = {}) => {
  throw billingLifecycleRequired();
};

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
    let query = platformClient
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
    let query = platformClient
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
          const { data: invoice, error: invoiceError } = await platformClient
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
          const { error: updateError } = await platformClient
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
      const { data: invoice, error: invoiceError } = await platformClient
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
      
      const { error: updateError } = await platformClient
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

    const invoiceGroups = await Promise.all(
      propertyIds.map(async (propertyId) => {
        // Read every page so the dashboard never silently undercounts large properties.
        // Fail closed on a page error or an unexpected response, instead of showing
        // partial financial totals as though the query completed.
        const pageSize = 500;
        const invoices = [];
        let page = 1;
        for (;;) {
          const { data, error } = await listInvoices({
            propertyId,
            status: options.status && options.status !== 'all' ? options.status : undefined,
            fromDate: options.fromDate,
            toDate: options.toDate,
            page,
            pageSize
          });
          if (error) throw error;
          if (!Array.isArray(data)) {
            throw new Error('Invoice list returned an invalid response.');
          }
          invoices.push(...data);
          if (data.length < pageSize) break;
          page += 1;
          if (page > 1000) {
            throw new Error('Invoice summary exceeded the supported pagination limit.');
          }
        }
        return { propertyId, invoices };
      })
    );
    
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

    invoiceGroups.forEach(({ propertyId, invoices }) => {
      invoices.forEach((invoice) => {
        const amount = parseFloat(invoice.totalamount ?? invoice.totalAmount ?? invoice.amount) || 0;
      
        summaryByProperty[propertyId].totalInvoices += 1;
        summaryByProperty[propertyId].totalAmount += amount;
      
        if (invoice.status === 'paid') {
          summaryByProperty[propertyId].paidAmount += amount;
        } else {
          summaryByProperty[propertyId].pendingAmount += amount;
        }
      });
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
    // The MSSQL utility_readings schema uses propertyid (not property_id).
    // Fetch all authorized pending rows in stable pages; the central platform
    // query enforces tenant and property scope for each request.
    const pageSize = 500;
    const propertiesData = [];
    for (let page = 0; page < 1000; page += 1) {
      const { data, error } = await platformClient
        .from('utility_readings')
        .select('id, propertyid')
        .eq('billing_status', 'pending_invoice')
        .is('invoice_id', null)
        .order('id', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) throw new Error(formatErrorMessage(error));
      if (!Array.isArray(data)) {
        throw new Error('Pending utility readings returned an invalid response.');
      }
      propertiesData.push(...data);
      if (data.length < pageSize) break;
      if (page === 999) {
        throw new Error('Pending utility readings exceeded the supported pagination limit.');
      }
    }

    if (propertiesData.length === 0) {
      return { data: [], error: null };
    }

    const propertyIds = [...new Set(propertiesData.map(reading => reading.propertyid).filter(Boolean))];
    if (propertyIds.length === 0) return { data: [], error: null };
    
    // Get property details
    const { data: properties, error: propDetailsError } = await platformClient
      .from('properties')
      .select('id, name, address')
      .in('id', propertyIds);
    
    if (propDetailsError) {
      throw new Error(formatErrorMessage(propDetailsError));
    }
    
    // Count from the same authorized pending-reading result set used to discover
    // properties. Avoid separate per-property queries and misleading zero counts.
    const counts = {};
    for (const reading of propertiesData) {
      if (reading.propertyid) {
        counts[reading.propertyid] = (counts[reading.propertyid] || 0) + 1;
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
    const propertyIdsArray = propertyIds
      ? (Array.isArray(propertyIds) ? propertyIds : [propertyIds])
      : [undefined];

    const responses = await Promise.all(
      propertyIdsArray.map((propertyId) => listInvoices({
        ...options,
        propertyId,
        pageSize: options.pageSize || 1000
      }))
    );

    const errors = responses.map((response) => response.error).filter(Boolean);
    if (errors.length > 0) {
      throw errors[0];
    }

    const data = responses.flatMap((response) => response.data || []);
    const totalCount = options.getTotalCount ? data.length : null;
    
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
    const { data: userData, error: userError } = await platformClient.auth.getUser();
    
    if (userError) {
      throw new Error(formatErrorMessage(userError));
    }
    
    if (!userData?.user) {
      return { data: [], error: 'No authenticated user found' };
    }
    
    // Try to get staff profile first
    const { data: profile, error: profileError } = await platformClient
      .from('staff')
      .select('id, user_id, role, properties_access')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    
    // If staff profile exists and has properties_access
    if (profile && !profileError) {
      // If admin or has full access, get all property IDs
      if (profile.role === 'admin' || !profile.properties_access || profile.properties_access.length === 0) {
        const { data: allProperties, error: propError } = await platformClient
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
    const { data: allProperties, error: propError } = await platformClient
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