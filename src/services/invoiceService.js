import { platform as platformClient } from './platformClient';
import { calculateUtilityAmount } from './utilityBillingService';
import { formatErrorMessage } from '../utils/errorFormatting';
import { isMssqlApiEnabled, requestMssqlApi } from './mssqlApiClient';
import { listPendingInvoiceReadingPage, listPendingInvoiceProperties } from './pendingInvoiceDashboardReadClient';
import { requireInvoiceListRows } from './invoiceListReadContract';

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

  if (Array.isArray(options.status)) {
    options.status.forEach(status => query.append('status', status));
  } else if (options.status) {
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

  if (options.sortBy) query.set('sortBy', options.sortBy);
  if (options.sortOrder) query.set('sortOrder', options.sortOrder);

  return query.toString();
};

export const listInvoices = async (options = {}) => {
  // Match the compatibility client's empty IN-filter semantics on both transports.
  // An empty status selection means no invoices, never an unfiltered request.
  if (Array.isArray(options.status) && options.status.length === 0) {
    return { data: [], error: null };
  }
  if (isMssqlApiEnabled()) {
    try {
      const query = buildInvoiceQuery(options);
      const path = query ? `/api/mssql/invoices?${query}` : '/api/mssql/invoices';
      const data = await requestMssqlApi(path);
      const invoices = requireInvoiceListRows(data).map(normalizeInvoiceRecord);

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
      data: requireInvoiceListRows(data).map(normalizeInvoiceRecord),
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
 * Deprecated compatibility entrypoint. Invoice issue, utility linking and
 * totals must run exclusively through the governed monthly billing lifecycle.
 * Preserve the former result envelope for any unresolved manual callers,
 * but never attempt an invoice or utility_readings write here.
 */
export const generateInvoicesByProperty = async (_readingsByProperty, _options = {}) => {
  const error = billingLifecycleRequired();
  return {
    success: false,
    invoiceIds: [],
    propertyResults: {},
    errors: [{ code: error.code, error: error.message }],
    code: error.code
  };
};

/** Legacy alternative entrypoint: safely reject instead of creating invoices. */
export async function generateInvoices(_readings, _invoiceData) {
  const error = billingLifecycleRequired();
  return { data: null, error: error.message, code: error.code };
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
      const data = await listPendingInvoiceReadingPage(page, pageSize);
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
    const properties = await listPendingInvoiceProperties(propertyIds);

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
 * Deprecated compatibility helper.
 *
 * Its former implementation treated a missing staff profile as permission to
 * return all properties. Property access must instead be obtained from a
 * tenant-authenticated, server-authorized endpoint. Preserve the return
 * envelope for unresolved legacy/manual callers; never expand access here.
 */
export async function getCurrentUserPropertyAccess() {
  return {
    data: null,
    error: 'Property access must be resolved by the authenticated tenant-scoped API.',
    code: 'PROPERTY_ACCESS_AUTHORITY_REQUIRED'
  };
}
