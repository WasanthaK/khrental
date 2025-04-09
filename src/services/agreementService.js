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

import { supabase } from './supabaseClient';
import { toast } from 'react-toastify';
import { saveMergedDocument } from './DocumentService';
import { STORAGE_BUCKETS, BUCKET_FOLDERS } from './fileService';
import { populateMergeFields } from '../utils/documentUtils';
import { toDatabaseFormat } from '../utils/dataUtils';

/**
 * Saves an agreement with the provided data
 * @param {Object} agreement - The agreement data to save
 * @returns {Promise<Object>} - The saved agreement
 */
export const saveAgreement = async (agreement) => {
  console.log('Saving agreement:', { agreementId: agreement.id, status: agreement.status });
  
  try {
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
    
    // Filter out properties that don't exist in the database schema
    const validColumns = [
      'id', 'templateid', 'renteeid', 'propertyid', 'unitid', 'status',
      'signeddate', 'startdate', 'enddate', 'eviasignreference',
      'documenturl', 'pdfurl', 'createdat', 'updatedat', 'terms', 'notes',
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
        const { data: unitData } = await supabase
          .from('property_units')
          .select('rentalvalues')
          .eq('id', agreementData.unitid)
          .single();
          
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
    
    // Save the agreement to the database
    const { data: savedAgreement, error } = await supabase
      .from('agreements')
      .upsert(filteredData)
      .select('*')
      .single();
      
    if (error) {
      console.error('Error saving agreement:', error);
      toast.error('Error saving agreement: ' + error.message);
      throw error;
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
        const { data: updatedAgreement, error: updateError } = await supabase
          .from('agreements')
          .update({ 
            documenturl: documentUrl,
            status: 'review',
            needs_document_generation: false,
            updatedat: new Date().toISOString()
          })
          .eq('id', savedAgreement.id)
          .select('*')
          .single();
            
        if (updateError) {
          console.error('Error updating agreement with document URL:', updateError);
          throw updateError;
        }
        
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
      // Initialize with agreement terms
      monthlyRent: '',
      depositAmount: '',
      paymentDueDay: agreement.terms?.paymentDueDay || '5',
      noticePeriod: agreement.terms?.noticePeriod || '30',
      specialConditions: agreement.terms?.specialConditions || ''
    }
  };

  try {
    // Fetch property details with units
    if (agreement.propertyid) {
      const { data: propertyData, error: propertyError } = await supabase
        .from('properties')
        .select(`
          *,
          property_units (*)
        `)
        .eq('id', agreement.propertyid)
        .single();
        
      if (!propertyError) {
        mergeData.property = propertyData;
      }
    }
    
    // Fetch unit details if available
    if (agreement.unitid) {
      const { data: unitData, error: unitError } = await supabase
        .from('property_units')
        .select('*')
        .eq('id', agreement.unitid)
        .single();
        
      if (!unitError && unitData) {
        mergeData.unit = unitData;
        // Update terms with unit rental values if available
        if (unitData.rentalvalues) {
          const monthlyRent = unitData.rentalvalues.rent || unitData.rentalvalues.monthlyRent || '';
          const depositAmount = unitData.rentalvalues.deposit || unitData.rentalvalues.depositAmount || monthlyRent || '';
          
          mergeData.terms = {
            ...mergeData.terms,
            monthlyRent: monthlyRent ? `Rs. ${parseFloat(monthlyRent).toLocaleString('si-LK')}` : '',
            depositAmount: depositAmount ? `Rs. ${parseFloat(depositAmount).toLocaleString('si-LK')}` : ''
          };
        }
      }
    }
    
    // Fetch rentee details
    if (agreement.renteeid) {
      const { data: renteeData, error: renteeError } = await supabase
        .from('app_users')
        .select('*')
        .eq('id', agreement.renteeid)
        .single();
        
      if (!renteeError) {
        mergeData.rentee = renteeData;
      }
    }
    
    // If we still don't have rental values, try to get them from the agreement terms
    if (!mergeData.terms.monthlyRent && agreement.terms?.monthlyRent) {
      mergeData.terms.monthlyRent = `Rs. ${parseFloat(agreement.terms.monthlyRent).toLocaleString('si-LK')}`;
    }
    if (!mergeData.terms.depositAmount && agreement.terms?.depositAmount) {
      mergeData.terms.depositAmount = `Rs. ${parseFloat(agreement.terms.depositAmount).toLocaleString('si-LK')}`;
    }
    
    console.log('Prepared merge data for agreement:', {
      hasProperty: !!mergeData.property,
      hasUnit: !!mergeData.unit,
      hasRentee: !!mergeData.rentee,
      terms: mergeData.terms
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
    const { data: agreement, error } = await supabase
      .from("agreements")
      .select("*")
      .eq("id", agreementId)
      .single();
      
    if (error) {
      throw error;
    }
    
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
    const { error: updateError } = await supabase
      .from("agreements")
      .update({ documenturl: docUrl })
      .eq("id", agreementId);
      
    if (updateError) {
      throw updateError;
    }
    
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
    const { data, error } = await supabase
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

/**
 * Cancel an agreement and update its status
 * @param {string} agreementId - The ID of the agreement to cancel
 * @param {string} cancelReason - Optional reason for cancellation
 * @returns {Promise<Object>} - The cancelled agreement
 */
export const cancelAgreement = async (agreementId, cancelReason = '') => {
  console.log('Cancelling agreement:', agreementId);
  
  try {
    // Check if agreement exists
    const { data: existingAgreement, error: fetchError } = await supabase
      .from('agreements')
      .select('*')
      .eq('id', agreementId)
      .single();
    
    if (fetchError) {
      console.error('Error fetching agreement for cancellation:', fetchError);
      throw new Error(`Agreement not found: ${fetchError.message}`);
    }
    
    // Prepare update data
    const updateData = {
      status: 'cancelled',
      updatedat: new Date().toISOString(),
      notes: cancelReason ? 
        `${existingAgreement.notes || ''}\n\nCancellation reason (${new Date().toLocaleDateString()}): ${cancelReason}` : 
        existingAgreement.notes
    };
    
    // Update the agreement
    const { data: updatedAgreement, error: updateError } = await supabase
      .from('agreements')
      .update(updateData)
      .eq('id', agreementId)
      .select('*')
      .single();
    
    if (updateError) {
      console.error('Error cancelling agreement:', updateError);
      throw new Error(`Failed to cancel agreement: ${updateError.message}`);
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
    const { data: agreements, error: searchError } = await supabase
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
          // Save the signed document to storage
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('files')
            .upload(
              `agreements/${agreement.id}/signed_agreement.pdf`,
              Buffer.from(signedDoc.DocumentContent, 'base64'),
              {
                contentType: 'application/pdf',
                upsert: true
              }
            );

          if (uploadError) {
            console.error('Error uploading signed document:', uploadError);
          } else {
            // Get the public URL
            const { data: { publicUrl } } = supabase.storage
              .from('files')
              .getPublicUrl(`agreements/${agreement.id}/signed_agreement.pdf`);

            updateData.signed_document_url = publicUrl;
            updateData.pdfurl = publicUrl; // For backward compatibility
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
    const { data: updatedAgreement, error: updateError } = await supabase
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
    
    // Find active agreements with end date in the past
    const { data: expiredAgreements, error } = await supabase
      .from('agreements')
      .select('id, enddate')
      .eq('status', 'active')
      .lt('enddate', today);
    
    if (error) {
      console.error(`Error finding expired agreements: ${error.message}`);
      return { success: false, error: error.message };
    }
    
    if (!expiredAgreements || expiredAgreements.length === 0) {
      console.log('No expired agreements found');
      return { success: true, count: 0 };
    }
    
    console.log(`Found ${expiredAgreements.length} expired agreements to update`);
    
    // Update each expired agreement
    const results = [];
    for (const agreement of expiredAgreements) {
      // Update the agreement
      const { data: updatedAgreement, error: updateError } = await supabase
        .from('agreements')
        .update({ 
          status: 'expired',
          updatedat: new Date().toISOString()
        })
        .eq('id', agreement.id)
        .select('*')
        .single();
      
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