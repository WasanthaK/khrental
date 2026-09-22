/**
 * Agreement Lifecycle States:
 * ---------------------------
 * created: Agreement is created but not yet sent for signature
 * pending_activation: Agreement is sent for signature and waiting for all signatories to complete
 * active: All signatories have signed, agreement is in effect
 * rejected: Agreement was rejected by a signatory
 * expired: Agreement has reached its end date
 * cancelled: Agreement was manually cancelled
 * 
 * Signature Status Flow:
 * ---------------------
 * send_for_signature: Document sent to signatories
 * in_progress: General status for partially signed agreements
 * signed_by_landlord: Landlord has signed
 * signed_by_tenant: Tenant has signed
 * signing_complete: All required signatories have signed
 * rejected: A signatory has rejected the agreement
 * 
 * Evia Sign Event Mapping:
 * -----------------------
 * EventId 1 (SignRequestReceived): status -> pending_activation, signature_status -> send_for_signature
 * EventId 2 (SignatoryCompleted): signature_status -> signed_by_landlord / signed_by_tenant / in_progress
 * EventId 3 (RequestCompleted): status -> active, signature_status -> signing_complete
 * EventId 5 (RequestRejected): status -> rejected, signature_status -> rejected
 */

import { platform as platformClient } from './platformClient';
import { toast } from 'react-toastify';
import { saveMergedDocument } from './DocumentService';
import { populateMergeFields } from '../utils/documentUtils';
import { toDatabaseFormat } from '../utils/dataUtils';
import { fetchAppUser, updateAppUser } from './appUserService';
import { isMssqlApiEnabled, requestMssqlApi } from './mssqlApiClient';
import { uploadTenantFile } from './storageApiService';

const isSchemaUnavailableError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('invalid object name')
    || message.includes('invalid column name')
    || message.includes('schema_not_available')
    || message.includes('are not available in the current local mssql schema');
};

const toNullableNumber = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value).replace(/[^0-9.-]/g, '');
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const fetchAgreementRecord = async (agreementId) => {
  const { data, error } = await platformClient
    .from('agreements')
    .select('*')
    .eq('id', agreementId)
    .single();

  if (error) {
    throw error;
  }

  return data;
};

const fetchPropertyRecord = async (propertyId) => {
  const { data, error } = await platformClient
    .from('properties')
    .select(`
      *,
      property_units (*)
    `)
    .eq('id', propertyId)
    .single();

  if (error) {
    throw error;
  }

  return data;
};

const fetchPropertyUnitRecord = async (unitId) => {
  const { data, error } = await platformClient
    .from('property_units')
    .select('*')
    .eq('id', unitId)
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const fetchAgreement = async (agreementId) => {
  if (isMssqlApiEnabled()) {
    try {
      return await requestMssqlApi(`/api/mssql/agreements/${agreementId}`);
    } catch (mssqlError) {
      console.error('Error loading agreement from MSSQL, falling back to the local compatibility layer:', mssqlError);
    }
  }

  return fetchAgreementRecord(agreementId);
};

export const updateAgreementData = async (agreementId, updates) => {
  if (isMssqlApiEnabled()) {
    try {
      return await requestMssqlApi(`/api/mssql/agreements/${agreementId}`, {
        method: 'PUT',
        body: updates
      });
    } catch (mssqlError) {
      console.error('Error updating agreement in MSSQL, falling back to the local compatibility layer:', mssqlError);
    }
  }

  const { data, error } = await platformClient
    .from('agreements')
    .update(updates)
    .eq('id', agreementId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const fetchProperty = async (propertyId) => {
  if (isMssqlApiEnabled()) {
    try {
      return await requestMssqlApi(`/api/mssql/properties/${propertyId}`);
    } catch (mssqlError) {
      console.error('Error loading property from MSSQL, falling back to the local compatibility layer:', mssqlError);
    }
  }

  return fetchPropertyRecord(propertyId);
};

export const listProperties = async () => {
  if (isMssqlApiEnabled()) {
    try {
      return await requestMssqlApi('/api/mssql/properties?pageSize=500');
    } catch (mssqlError) {
      console.error('Error loading properties from MSSQL, falling back to the local compatibility layer:', mssqlError);
    }
  }

  const { data, error } = await platformClient
    .from('properties')
    .select('*')
    .order('name');

  if (error) {
    throw error;
  }

  return data || [];
};

export const updatePropertyData = async (propertyId, updates) => {
  if (isMssqlApiEnabled()) {
    try {
      return await requestMssqlApi(`/api/mssql/properties/${propertyId}`, {
        method: 'PUT',
        body: updates
      });
    } catch (mssqlError) {
      console.error('Error updating property in MSSQL, falling back to the local compatibility layer:', mssqlError);
    }
  }

  const { data, error } = await platformClient
    .from('properties')
    .update(updates)
    .eq('id', propertyId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const fetchPropertyUnit = async (unitId) => {
  if (isMssqlApiEnabled()) {
    try {
      return await requestMssqlApi(`/api/mssql/property-units/${unitId}`);
    } catch (mssqlError) {
      console.error('Error loading property unit from MSSQL, falling back to the local compatibility layer:', mssqlError);
    }
  }

  return fetchPropertyUnitRecord(unitId);
};

export const listPropertyUnits = async (propertyId) => {
  if (!propertyId) {
    return [];
  }

  if (isMssqlApiEnabled()) {
    try {
      return await requestMssqlApi(`/api/mssql/property-units?propertyId=${encodeURIComponent(propertyId)}&pageSize=500`);
    } catch (mssqlError) {
      console.error('Error loading property units from MSSQL, falling back to the local compatibility layer:', mssqlError);
    }
  }

  const { data, error } = await platformClient
    .from('property_units')
    .select('*')
    .eq('propertyid', propertyId)
    .order('unitnumber');

  if (error) {
    throw error;
  }

  return data || [];
};

/**
 * Saves an agreement with the provided data
 * @param {Object} agreement - The agreement data to save
 * @returns {Promise<Object>} - The saved agreement
 */
export const saveAgreement = async (agreement) => {
  console.log('Saving agreement:', { agreementId: agreement.id, status: agreement.status });
  
  try {
    const isNewAgreement = !agreement?.id;

    // Prepare the data to save
    let agreementData = {
      ...agreement,
      updated_at: new Date()
    };
    
    // Generate UUID for new agreements
    if (!agreementData.id) {
      agreementData.id = crypto.randomUUID();
      console.log('Generated new agreement ID:', agreementData.id);
    }
    
    // Extract the content of the agreement template if available
    let templateContent = null;
    
    // If there is a template ID, get the template content
    if (agreement.templateid) {
      const template = await getTemplate(agreement.templateid);
      if (template) {
        console.log('Template found:', template.name);
        templateContent = template.content;
      }
    }
    
    // If status is being set to review but we don't have a document URL,
    // temporarily set it back to draft to avoid constraint violation
    if (agreementData.status === 'review' && !agreementData.documenturl) {
      console.log('Setting temporary draft status for document generation');
      agreementData.status = 'draft';
      agreementData.needs_document_generation = true;
    }
    
    // Remove the deleted fields from the data
    if (agreement.deletefields && agreement.deletefields.length > 0) {
      const { deletefields, ...dataToSave } = agreementData;
      agreementData = dataToSave;
    }
    
    // Convert any client-side property names to match database column names
    agreementData = toDatabaseFormat(agreementData);

    const derivedTerms = agreementData.terms || {};
    agreementData = {
      ...agreementData,
      startdate: agreementData.startdate || derivedTerms.startDate || null,
      enddate: agreementData.enddate || derivedTerms.endDate || null,
      rentamount: agreementData.rentamount ?? toNullableNumber(derivedTerms.monthlyRent),
      depositamount: agreementData.depositamount ?? toNullableNumber(derivedTerms.depositAmount)
    };
    
    // Filter out properties that don't exist in the database schema
    const validColumns = [
      'id', 'templateid', 'renteeid', 'propertyid', 'unitid', 'status',
      'signeddate', 'startdate', 'enddate', 'eviasignreference',
      'documenturl', 'signeddocumenturl', 'signed_document_url', 'pdfurl',
      'signatureurl', 'signature_pdf_url', 'evia_document_id',
      'title', 'content', 'processedcontent',
      'rentamount', 'depositamount', 'createdat', 'updatedat', 'terms', 'notes',
      'needs_document_generation',
      // New fields for enhanced signature status tracking
      'signature_status', 'signature_sent_at', 'signature_completed_at',
      'signed_document_url', 'signatories_status'
    ];

    // Create a new object with only valid columns
    const filteredData = {};
    for (const key of validColumns) {
      if (key in agreementData) {
        filteredData[key] = agreementData[key];
      }
    }

    // Set default signature_status based on agreement status if not provided
    if (agreementData.status && !agreementData.signature_status) {
      switch (agreementData.status) {
        case 'draft':
        case 'review':
          // No signature status needed for draft/review
          break;
        case 'pending_activation':
          filteredData.signature_status = 'send_for_signature';
          break;
        case 'active':
          filteredData.signature_status = 'signing_complete';
          break;
        case 'rejected':
          filteredData.signature_status = 'rejected';
          break;
      }
    }

    // Ensure terms data is properly structured
    if (agreementData.terms) {
      // Get unit rental values if available
      let unitRentalValues = {};
      if (agreementData.unitid) {
        const unitData = await fetchPropertyUnit(agreementData.unitid).catch((error) => {
          console.error('Error fetching unit rental values:', error);
          return null;
        });
          
        if (unitData?.rentalvalues) {
          unitRentalValues = {
            monthlyRent: unitData.rentalvalues.rent || unitData.rentalvalues.monthlyRent,
            depositAmount: unitData.rentalvalues.deposit || unitData.rentalvalues.depositAmount
          };
        }
      }

      filteredData.terms = {
        ...agreementData.terms,
        // Use unit rental values if available, otherwise use provided values
        monthlyRent: unitRentalValues.monthlyRent || agreementData.terms.monthlyRent || '',
        depositAmount: unitRentalValues.depositAmount || agreementData.terms.depositAmount || '',
        paymentDueDay: agreementData.terms.paymentDueDay || '5',
        noticePeriod: agreementData.terms.noticePeriod || '30',
        specialConditions: agreementData.terms.specialConditions || ''
      };
    }

    // If we have a signature_pdf_url in the data, store it in both pdfurl and signed_document_url fields
    if (agreementData.signature_pdf_url) {
      filteredData.pdfurl = agreementData.signature_pdf_url;
      filteredData.signed_document_url = agreementData.signature_pdf_url;
      console.log('Stored signature_pdf_url in pdfurl and signed_document_url fields');
    }

    console.log('Saving agreement with filtered data:', filteredData);
    
    let savedAgreement = null;

    if (isNewAgreement) {
      if (isMssqlApiEnabled()) {
        try {
          savedAgreement = await requestMssqlApi('/api/mssql/agreements', {
            method: 'POST',
            body: filteredData
          });
        } catch (mssqlError) {
          console.error('Error creating agreement in MSSQL, falling back to the local compatibility layer:', mssqlError);
        }
      }

      if (!savedAgreement) {
        const { data, error } = await platformClient
          .from('agreements')
          .upsert(filteredData)
          .select('*')
          .single();

        if (error) {
          console.error('Error saving agreement:', error);
          toast.error('Error saving agreement: ' + error.message);
          throw error;
        }

        savedAgreement = data;
      }
    } else {
      savedAgreement = await updateAgreementData(agreementData.id, filteredData);
    }
    
    console.log('Agreement saved successfully:', savedAgreement.id);
    
    // If needs_document_generation is true, generate the document and update to review status
    if (savedAgreement.needs_document_generation && templateContent) {
      try {
        console.log('Generating document for review status...');
        
        // Get merge data for the agreement
        const mergeData = await getMergeDataForAgreement(savedAgreement);
        
        // Merge the template content with the data
        console.log('Populating merge fields in template...');
        const mergedContent = await populateMergeFields(templateContent, mergeData);
        console.log('Merged content length:', mergedContent.length);
        
        // Save the merged document
        console.log('Saving the merged document...');
        const documentUrl = await saveMergedDocument(mergedContent, savedAgreement);
        
        // Update the agreement with the document URL and review status
        console.log('Updating agreement with document URL and review status...');
        const updatedAgreement = await updateAgreementData(savedAgreement.id, {
          documenturl: documentUrl,
          status: 'review',
          needs_document_generation: false,
          updatedat: new Date().toISOString()
        });
        
        // Return the updated agreement with the document URL
        return updatedAgreement;
      } catch (docError) {
        console.error('Error generating document:', docError);
        toast.error('Error generating document: ' + docError.message);
        // Return the saved agreement even if document generation fails
        return savedAgreement;
      }
    }
    
    // Return the saved agreement
    return savedAgreement;
  } catch (error) {
    console.error('Error in saveAgreement:', error);
    throw error;
  }
};

/**
 * Fetches and prepares all necessary data for merge fields in an agreement
 * @param {Object} agreement - The agreement object
 * @returns {Promise<Object>} - Object containing all merge data
 */
async function getMergeDataForAgreement(agreement) {
  const mergeData = {
    agreement: {
      startDate: agreement.startdate,
      endDate: agreement.enddate,
      currentDate: new Date(),
      agreementId: agreement.id || 'New Agreement'
    },
    terms: {
      ...agreement.terms,
      // Initialize with agreement terms, ensuring values are properly formatted even if zero
      monthlyRent: '',
      depositAmount: '',
      paymentDueDay: agreement.terms?.paymentDueDay || '5',
      noticePeriod: agreement.terms?.noticePeriod || '30',
      specialConditions: agreement.terms?.specialConditions || ''
    }
  };

  try {
    console.log('getMergeDataForAgreement - input agreement:', { 
      id: agreement.id, 
      propertyid: agreement.propertyid,
      unitid: agreement.unitid,
      hasRenteeid: !!agreement.renteeid,
      hasTerms: !!agreement.terms
    });
    
    // Fetch property details with units
    if (agreement.propertyid) {
      try {
        const propertyData = await fetchProperty(agreement.propertyid);
        mergeData.property = propertyData;
        console.log('Property data fetched successfully:', { 
          name: propertyData.name, 
          propertytype: propertyData.propertytype,
          hasUnits: !!propertyData.property_units && propertyData.property_units.length > 0 
        });
        
        // For non-apartment properties, set unit to empty object with empty strings instead of null
        if (propertyData.propertytype !== 'apartment') {
          console.log('Non-apartment property detected, setting unit data to empty object');
          mergeData.unit = { 
            id: '',
            name: '',
            description: '',
            floor: '',
            rentalvalues: { rent: '', deposit: '' }
          };
        }
      } catch (propertyError) {
        console.error('Error fetching property data:', propertyError);
      }
    }
    
    // Fetch unit details if available
    if (agreement.unitid) {
      try {
        const unitData = await fetchPropertyUnit(agreement.unitid);
      
        if (unitData) {
        console.log('Unit data fetched successfully:', {
          id: unitData.id,
          unitnumber: unitData.unitnumber,
          hasRentalValues: !!unitData.rentalvalues,
          rentalvalues: unitData.rentalvalues
        });
        
        mergeData.unit = unitData;
        // Update terms with unit rental values if available
        if (unitData.rentalvalues) {
          const monthlyRent = unitData.rentalvalues.rent || unitData.rentalvalues.monthlyRent || 0;
          const depositAmount = unitData.rentalvalues.deposit || unitData.rentalvalues.depositAmount || monthlyRent || 0;
          
          mergeData.terms = {
            ...mergeData.terms,
            monthlyRent: `Rs. ${parseFloat(monthlyRent).toLocaleString('si-LK')}`,
            depositAmount: `Rs. ${parseFloat(depositAmount).toLocaleString('si-LK')}`
          };
          
          console.log('Updated terms with unit rental values:', {
            monthlyRent: mergeData.terms.monthlyRent,
            depositAmount: mergeData.terms.depositAmount
          });
        } else {
          console.warn('Unit has no rental values defined');
        }
        }
      } catch (unitError) {
        console.error('Error fetching unit data:', unitError);
      }
    } else {
      console.log('No unit ID provided in agreement');
    }
    
    // Fetch rentee details
    if (agreement.renteeid) {
      try {
        mergeData.rentee = await fetchAppUser(agreement.renteeid);
      } catch (renteeError) {
        console.error('Error fetching rentee data:', renteeError);
      }
    }
    
    // If we still don't have rental values, try to get them from the agreement terms
    // Always format the values, even if they're zero
    if (!mergeData.terms.monthlyRent || mergeData.terms.monthlyRent === 'Rs. 0') {
      const monthlyRentValue = agreement.terms?.monthlyRent !== undefined && agreement.terms?.monthlyRent !== null
        ? agreement.terms.monthlyRent
        : 0;
      mergeData.terms.monthlyRent = `Rs. ${parseFloat(monthlyRentValue).toLocaleString('si-LK')}`;
    }
    
    if (!mergeData.terms.depositAmount || mergeData.terms.depositAmount === 'Rs. 0') {
      const depositValue = agreement.terms?.depositAmount !== undefined && agreement.terms?.depositAmount !== null
        ? agreement.terms.depositAmount
        : 0;
      mergeData.terms.depositAmount = `Rs. ${parseFloat(depositValue).toLocaleString('si-LK')}`;
    }
    
    console.log('Final merge data prepared:', {
      hasProperty: !!mergeData.property,
      propertyType: mergeData.property?.propertytype,
      hasUnit: !!mergeData.unit,
      unitNumber: mergeData.unit?.unitnumber || 'none',
      hasRentee: !!mergeData.rentee,
      terms: {
        monthlyRent: mergeData.terms.monthlyRent,
        depositAmount: mergeData.terms.depositAmount
      }
    });
    
    return mergeData;
  } catch (error) {
    console.error('Error preparing merge data:', error);
    return mergeData; // Return what we have so far
  }
}

/**
 * Handle document generation for an agreement
 * @param {string} agreementId - ID of the agreement
 * @param {string} templateContent - Content of the template
 * @returns {Promise<boolean>} - Success status
 */
export const handleDocumentGeneration = async (agreementId, templateContent) => {
  console.log("Generating document for:", agreementId);
  try {
    if (!agreementId) {
      throw new Error("Agreement ID is required");
    }
    
    if (!templateContent) {
      throw new Error("Template content is required");
    }
    
    // Get the agreement data
    const agreement = await fetchAgreement(agreementId);
    
    // Get merge data for the agreement
    const mergeData = await getMergeDataForAgreement(agreement);
    
    // Merge the template content with the data
    console.log('Populating merge fields in template...');
    const mergedContent = await populateMergeFields(templateContent, mergeData);
    console.log('Merged content length:', mergedContent.length);
    
    // Debug info for content inspection
    console.log('HTML formatting analysis:', {
      hasParagraphs: mergedContent.includes('<p'),
      hasBold: mergedContent.includes('<strong') || mergedContent.includes('<b'),
      hasItalic: mergedContent.includes('<em') || mergedContent.includes('<i'),
      hasLists: mergedContent.includes('<ul') || mergedContent.includes('<ol')
    });
    
    // Save the merged document
    const docUrl = await saveMergedDocument(mergedContent, agreement);
    
    // Update the agreement with the new document URL
    await updateAgreementData(agreementId, { documenturl: docUrl });
    
    toast.success("Document generated successfully");
    return true;
  } catch (error) {
    console.error("Error generating document:", error);
    toast.error("Document generation failed: " + error.message);
    return false;
  }
};

/**
 * Fetches a template by ID
 * @param {string} templateId - ID of the template to fetch
 * @returns {Promise<Object|null>} - The template data or null if not found
 */
export const getTemplate = async (templateId) => {
  try {
    if (isMssqlApiEnabled()) {
      try {
        return await requestMssqlApi(`/api/mssql/agreement-templates/${templateId}`);
      } catch (mssqlError) {
        if (isSchemaUnavailableError(mssqlError)) {
          return null;
        }
        console.error('Error fetching template from MSSQL, falling back to the local compatibility layer:', mssqlError);
      }
    }

    const { data, error } = await platformClient
      .from('agreement_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error fetching template:', error);
    return null;
  }
};

export const listTemplates = async ({ language } = {}) => {
  if (isMssqlApiEnabled()) {
    try {
      const query = language
        ? `/api/mssql/agreement-templates?language=${encodeURIComponent(language)}&pageSize=500`
        : '/api/mssql/agreement-templates?pageSize=500';
      return await requestMssqlApi(query);
    } catch (mssqlError) {
      if (isSchemaUnavailableError(mssqlError)) {
        return [];
      }
      console.error('Error loading templates from MSSQL, falling back to the local compatibility layer:', mssqlError);
    }
  }

  let request = platformClient
    .from('agreement_templates')
    .select('*');

  if (language) {
    request = request.eq('language', language);
  }

  const { data, error } = await request.order('name');

  if (error) {
    throw error;
  }

  return data || [];
};

export const createTemplate = async (templateData) => {
  if (isMssqlApiEnabled()) {
    try {
      return await requestMssqlApi('/api/mssql/agreement-templates', {
        method: 'POST',
        body: templateData
      });
    } catch (mssqlError) {
      if (isSchemaUnavailableError(mssqlError)) {
        throw new Error('Agreement templates are not available in the current local MSSQL schema.');
      }
      console.error('Error creating template in MSSQL, falling back to the local compatibility layer:', mssqlError);
    }
  }

  const { data, error } = await platformClient
    .from('agreement_templates')
    .insert(templateData)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const updateTemplate = async (templateId, templateData) => {
  if (isMssqlApiEnabled()) {
    try {
      return await requestMssqlApi(`/api/mssql/agreement-templates/${templateId}`, {
        method: 'PUT',
        body: templateData
      });
    } catch (mssqlError) {
      if (isSchemaUnavailableError(mssqlError)) {
        throw new Error('Agreement templates are not available in the current local MSSQL schema.');
      }
      console.error('Error updating template in MSSQL, falling back to the local compatibility layer:', mssqlError);
    }
  }

  const { data, error } = await platformClient
    .from('agreement_templates')
    .update(templateData)
    .eq('id', templateId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const deleteTemplate = async (templateId) => {
  if (isMssqlApiEnabled()) {
    try {
      return await requestMssqlApi(`/api/mssql/agreement-templates/${templateId}`, {
        method: 'DELETE'
      });
    } catch (mssqlError) {
      if (isSchemaUnavailableError(mssqlError)) {
        throw new Error('Agreement templates are not available in the current local MSSQL schema.');
      }
      console.error('Error deleting template in MSSQL, falling back to the local compatibility layer:', mssqlError);
    }
  }

  const { data, error } = await platformClient
    .from('agreement_templates')
    .delete()
    .eq('id', templateId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
};

/**
 * Cancel an agreement and update its status
 * @param {string} agreementId - The ID of the agreement to cancel
 * @param {string} cancelReason - Optional reason for cancellation
 * @returns {Promise<Object>} - The cancelled agreement
 */
export const cancelAgreement = async (agreementId, cancelReason = '') => {
  console.log('Cancelling agreement:', agreementId);
  
  try {
    const existingAgreement = await fetchAgreement(agreementId);

    if (!existingAgreement) {
      throw new Error('Agreement not found');
    }
    
    // Prepare update data
    const updateData = {
      status: 'cancelled',
      cancellation_reason: cancelReason,
      updatedat: new Date().toISOString(),
      notes: cancelReason ? 
        `${existingAgreement.notes || ''}\n\nCancellation reason (${new Date().toLocaleDateString()}): ${cancelReason}` : 
        existingAgreement.notes
    };
    
    const updatedAgreement = await updateAgreementData(agreementId, updateData);

    if (
      existingAgreement.propertyid &&
      ['active', 'signed', 'completed'].includes(existingAgreement.status)
    ) {
      await updatePropertyData(existingAgreement.propertyid, {
        status: 'available',
        updatedat: new Date().toISOString()
      });
    }
    
    console.log('Agreement cancelled successfully:', updatedAgreement.id);
    return updatedAgreement;
  } catch (error) {
    console.error('Error in cancelAgreement:', error);
    toast.error('Error cancelling agreement: ' + error.message);
    throw error;
  }
};

/**
 * Delete an agreement
 * @param {string} agreementId - The ID of the agreement to delete
 * @returns {Promise<Object|null>} - The deleted agreement
 */
export const deleteAgreement = async (agreementId) => {
  try {
    if (isMssqlApiEnabled()) {
      try {
        return await requestMssqlApi(`/api/mssql/agreements/${agreementId}`, {
          method: 'DELETE'
        });
      } catch (mssqlError) {
        console.error('Error deleting agreement in MSSQL, falling back to the local compatibility layer:', mssqlError);
      }
    }

    const { data, error } = await platformClient
      .from('agreements')
      .delete()
      .eq('id', agreementId)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error deleting agreement:', error);
    throw error;
  }
};

/**
 * Mark an agreement as signed
 * @param {string} agreementId - The ID of the agreement to sign
 * @returns {Promise<Object>} - The updated agreement
 */
export const markAgreementAsSigned = async (agreementId) => {
  try {
    if (isMssqlApiEnabled()) {
      try {
        return await requestMssqlApi(`/api/mssql/agreements/${agreementId}/sign`, {
          method: 'POST'
        });
      } catch (mssqlError) {
        console.error('Error signing agreement in MSSQL, falling back to the local compatibility layer:', mssqlError);
      }
    }

    const agreement = await fetchAgreement(agreementId);

    if (!agreement) {
      throw new Error('Agreement not found');
    }

    const updatedAgreement = await updateAgreementData(agreementId, {
      status: 'signed',
      signeddate: new Date().toISOString(),
      updatedat: new Date().toISOString()
    });

    if (agreement.propertyid) {
      await updatePropertyData(agreement.propertyid, {
        status: 'available',
        updatedat: new Date().toISOString()
      });
    }

    if (agreement.unitid) {
      const { error: unitError } = await platformClient
        .from('property_units')
        .update({
          status: 'occupied',
          updatedat: new Date().toISOString()
        })
        .eq('id', agreement.unitid);

      if (unitError) {
        console.error('Error updating unit status:', unitError);
      }
    }

    if (agreement.renteeid && agreement.propertyid) {
      const userResult = await fetchAppUser(agreement.renteeid);

      if (userResult) {
        const currentProperties = userResult.associated_property_ids || [];

        if (!currentProperties.includes(agreement.propertyid)) {
          const updateResult = await updateAppUser(agreement.renteeid, {
            associated_property_ids: [...currentProperties, agreement.propertyid],
            updatedat: new Date().toISOString()
          });

          if (!updateResult?.success) {
            console.error('Error updating rentee associated properties:', updateResult?.error);
          }
        }
      }
    }

    return updatedAgreement;
  } catch (error) {
    console.error('Error marking agreement as signed:', error);
    throw error;
  }
};

/**
 * Handle webhook events from Evia Sign
 * @param {Object} webhookPayload - The webhook payload from Evia Sign
 * @returns {Promise<Object>} - Result of the webhook processing
 */
export const handleEviaSignWebhook = async (webhookPayload) => {
  try {
    const { RequestId, EventId, EventDescription, Documents, Email, UserName } = webhookPayload;
    
    if (!RequestId) {
      return { success: false, error: 'Missing request ID' };
    }

    // Find the agreement by Evia Sign reference
    const { data: agreements, error: searchError } = await platformClient
      .from('agreements')
      .select('*')
      .eq('eviasignreference', RequestId)
      .single();

    if (searchError) {
      console.error('Error finding agreement:', searchError);
      return { success: false, error: 'Error finding agreement' };
    }

    if (!agreements) {
      console.error('No agreement found with Evia Sign reference:', RequestId);
      return { success: false, error: 'Agreement not found' };
    }

    const agreement = agreements;
    const updateData = {
      updatedat: new Date().toISOString()
    };
    
    // Determine signatory if email is available
    let signedBy = null;
    if (Email) {
      const email = Email.toLowerCase();
      const name = (UserName || '').toLowerCase();
      
      if (email.includes('landlord') || name.includes('landlord') || email.includes('owner')) {
        signedBy = 'landlord';
      } else if (email.includes('tenant') || name.includes('tenant') || email.includes('renter')) {
        signedBy = 'tenant';
      } else {
        // Default based on business flow
        signedBy = 'tenant';
      }
    }

    // Handle different signature events
    switch (EventId) {
      case 1: // SignRequestReceived
        updateData.status = 'pending_activation';
        updateData.signature_status = 'send_for_signature';
        updateData.signature_sent_at = new Date().toISOString();
        break;

      case 2: // SignatoryCompleted - Partially signed
        // Update signature status based on who signed
        if (signedBy === 'landlord') {
          updateData.signature_status = 'signed_by_landlord';
        } else if (signedBy === 'tenant') {
          updateData.signature_status = 'signed_by_tenant';
        } else {
          updateData.signature_status = 'in_progress';
        }
        
        // Update signatories status if we have signatory info
        if (Email && (UserName || Email)) {
          // Get current signatories if they exist
          const currentSignatories = agreement.signatories_status || [];
          
          // Create or update the signatory status
          const updatedSignatoryIndex = currentSignatories.findIndex(s => 
            s.email === Email || s.name === UserName);
          
          if (updatedSignatoryIndex >= 0) {
            // Update existing signatory
            currentSignatories[updatedSignatoryIndex] = {
              ...currentSignatories[updatedSignatoryIndex],
              status: 'signed',
              signed_at: new Date().toISOString(),
              role: signedBy || 'unknown'
            };
          } else {
            // Add new signatory
            currentSignatories.push({
              email: Email,
              name: UserName || 'Unknown',
              status: 'signed',
              signed_at: new Date().toISOString(),
              role: signedBy || 'unknown'
            });
          }
          
          // Update the field with the modified array
          updateData.signatories_status = currentSignatories;
        }
        break;

      case 3: // RequestCompleted - All signatures complete
        updateData.status = 'active';
        updateData.signature_status = 'signing_complete';
        updateData.signeddate = new Date().toISOString();
        updateData.signature_completed_at = new Date().toISOString();

        // If completed document is attached, save it
        if (Documents && Documents.length > 0) {
          const signedDoc = Documents[0];
          // Save the signed document through the explicit tenant-scoped storage API
          try {
            const signedPath = `agreements/${agreement.id}/signed_agreement.pdf`;
            const uploadedDocument = await uploadTenantFile({
              bucket: 'files',
              path: signedPath,
              file: Buffer.from(signedDoc.DocumentContent, 'base64')
            });
            const signedDocumentUrl = uploadedDocument?.url;

            updateData.signed_document_url = signedDocumentUrl;
            updateData.pdfurl = signedDocumentUrl; // For backward compatibility
          } catch (uploadError) {
            console.error('Error uploading signed document:', uploadError);
          }
        }
        break;
        
      case 5: // RequestRejected
        updateData.status = 'rejected';
        updateData.signature_status = 'rejected';
        break;

      default:
        console.warn('Unknown event type:', EventId);
        return { success: false, error: 'Unknown event type' };
    }

    // Update the agreement
    const { data: updatedAgreement, error: updateError } = await platformClient
      .from('agreements')
      .update(updateData)
      .eq('id', agreement.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating agreement:', updateError);
      return { success: false, error: 'Error updating agreement' };
    }

    return { success: true, data: updatedAgreement };
  } catch (error) {
    console.error('Error handling webhook:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Check for agreements that have passed their end date and mark them as expired
 * This would typically be called by a scheduled job
 * @returns {Promise<Object>} - Result of the operation
 */
export const checkAndUpdateExpiredAgreements = async () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log(`Checking for agreements that expired before ${today}`);

    let expiredAgreements = [];

    if (isMssqlApiEnabled()) {
      try {
        const agreements = await requestMssqlApi('/api/mssql/agreements?status=active&pageSize=500');
        expiredAgreements = (agreements || []).filter((agreement) => agreement.enddate && agreement.enddate < today);
      } catch (mssqlError) {
        console.error('Error finding expired agreements in MSSQL, falling back to the local compatibility layer:', mssqlError);
      }
    }

    if (expiredAgreements.length === 0) {
      const { data, error } = await platformClient
        .from('agreements')
        .select('id, enddate')
        .eq('status', 'active')
        .lt('enddate', today);

      if (error) {
        console.error(`Error finding expired agreements: ${error.message}`);
        return { success: false, error: error.message };
      }

      expiredAgreements = data || [];
    }
    
    if (!expiredAgreements || expiredAgreements.length === 0) {
      console.log('No expired agreements found');
      return { success: true, count: 0 };
    }
    
    console.log(`Found ${expiredAgreements.length} expired agreements to update`);
    
    // Update each expired agreement
    const results = [];
    for (const agreement of expiredAgreements) {
      let updateError = null;

      try {
        await updateAgreementData(agreement.id, {
          status: 'expired',
          updatedat: new Date().toISOString()
        });
      } catch (error) {
        updateError = error;
      }
      
      results.push({
        agreementId: agreement.id,
        success: !updateError,
        error: updateError ? updateError.message : null
      });
      
      if (updateError) {
        console.error(`Error expiring agreement ${agreement.id}: ${updateError.message}`);
      } else {
        console.log(`Agreement ${agreement.id} marked as expired`);
      }
    }
    
    return {
      success: true,
      results,
      count: expiredAgreements.length
    };
  } catch (error) {
    console.error(`Exception in checkAndUpdateExpiredAgreements: ${error.message}`);
    return { success: false, error: error.message };
  }
}; 