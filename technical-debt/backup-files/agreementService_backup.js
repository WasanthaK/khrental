import { supabase } from './supabaseClient';
import { toast } from 'react-toastify';
import { saveMergedDocument, generatePdfForSignature } from './DocumentService';
import { STORAGE_BUCKETS, BUCKET_FOLDERS } from './fileService';
import { populateMergeFields } from '../utils/documentUtils';

/**
 * Saves an agreement with the provided data
 * @param {Object} agreement - The agreement data to save
 * @returns {Promise<Object>} - The saved agreement
 */
export const saveAgreement = async (agreement) => {
  console.log('Saving agreement:', { agreementId: agreement.id, status: agreement.status });
  
  try {
    // Prepare the data to save
    const agreementData = {
      ...agreement,
      updated_at: new Date()
    };
    
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
    
    // Remove the deleted fields from the data
    if (agreement.deletefields && agreement.deletefields.length > 0) {
      // Create a deep copy of the agreement object without the deletefields property
      const { deletefields, ...dataToSave } = agreementData;
      agreementData = dataToSave;
    }
    
    // Save the agreement to the database
    const { data: savedAgreement, error } = await supabase
      .from('agreements')
      .upsert(agreementData)
      .select('*')
      .single();
      
    if (error) {
      console.error('Error saving agreement:', error);
      toast.error('Error saving agreement: ' + error.message);
      throw error;
    }
    
    console.log('Agreement saved successfully:', savedAgreement.id);
    
    // If the status is "review", generate a document from the template
    if (savedAgreement.status === 'review') {
      try {
        console.log('Status is "review" - generating document...');
        
        // Check if we have template content and the saved agreement
        if (templateContent && savedAgreement) {
          console.log('Getting merge data for template...');
          
          // Get the merge data for this agreement
          const mergeData = await getMergeDataForAgreement(savedAgreement);
          
          // Merge the template content with the data
          console.log('Populating merge fields in template...');
          const mergedContent = await populateMergeFields(templateContent, mergeData);
          console.log('Merged content length:', mergedContent.length);
          
          // Always save the fully merged content to maintain all formatting
          console.log('Saving the fully merged document...');
          const documentUrl = await saveMergedDocument(mergedContent, savedAgreement);
          
          // Update the agreement with the document URL
          console.log('Updating agreement with document URL...');
          const { error: updateError } = await supabase
            .from('agreements')
            .update({ documenturl: documentUrl })
            .eq('id', savedAgreement.id);
            
          if (updateError) {
            console.error('Error updating agreement with document URL:', updateError);
          }
        } else {
          console.warn('Cannot generate document: Missing template content or saved agreement');
        }
      } catch (docError) {
        console.error('Error generating document:', docError);
        toast.error('Error generating document: ' + docError.message);
        // Continue with the save operation even if document generation fails
      }
    } else if (savedAgreement && templateContent) {
      // For other statuses, still generate a document but don't require it for saving
      try {
        console.log('Generating document for non-review status...');
        
        // Get the merge data for this agreement
        const mergeData = await getMergeDataForAgreement(savedAgreement);
        
        // Merge the template content with the data
        console.log('Populating merge fields in template...');
        const mergedContent = await populateMergeFields(templateContent, mergeData);
        console.log('Merged content length:', mergedContent.length);
        
        // Always save the fully merged content to maintain all formatting
        console.log('Saving the fully merged document...');
        const documentUrl = await saveMergedDocument(mergedContent, savedAgreement);
        
        // Update the agreement with the document URL
        console.log('Updating agreement with document URL...');
        const { error: updateError } = await supabase
          .from('agreements')
          .update({ documenturl: documentUrl })
          .eq('id', savedAgreement.id);
          
        if (updateError) {
          console.error('Error updating agreement with document URL:', updateError);
        }
      } catch (docError) {
        console.error('Error generating document for non-review status:', docError);
        // Don't show an error toast for non-review status
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
    terms: agreement.terms || {}
  };

  try {
    // Fetch property details
    if (agreement.propertyid) {
      const { data: propertyData, error: propertyError } = await supabase
        .from('properties')
        .select('*')
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
        
      if (!unitError) {
        mergeData.unit = unitData;
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
    
    console.log('Prepared merge data for agreement:', {
      hasProperty: !!mergeData.property,
      hasUnit: !!mergeData.unit,
      hasRentee: !!mergeData.rentee
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
 * @param {boolean} generatePdf - Whether to generate a PDF
 * @returns {Promise<boolean>} - Success status
 */
export const handleDocumentGeneration = async (agreementId, templateContent, generatePdf = false) => {
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
      
    if (error) throw error;
    
    // Save the document as DOCX
    const docUrl = await saveMergedDocument(templateContent, agreement);
    
    // Update the agreement with the new document URL
    const { error: updateError } = await supabase
      .from("agreements")
      .update({ documenturl: docUrl })
      .eq("id", agreementId);
      
    if (updateError) throw updateError;
    
    // Generate PDF if requested
    if (generatePdf) {
      const pdfUrl = await generatePdfForSignature(agreementId);
      
      if (pdfUrl) {
        const { error: pdfUpdateError } = await supabase
          .from("agreements")
          .update({ pdfurl: pdfUrl })
          .eq("id", agreementId);
          
        if (pdfUpdateError) {
          console.error("Error updating agreement with PDF URL:", pdfUpdateError);
          toast.warning("Document generated but PDF update failed");
        }
      }
    }
    
    toast.success("Document generated successfully");
    return true;
  } catch (error) {
    console.error("Error generating document:", error);
    toast.error("Document generation failed: " + error.message);
    return false;
  }
};

export const getTemplate = async (templateId) => {
  try {
    const { data, error } = await supabase
      .from('agreement_templates')
      .select('*')
      .eq('id', templateId)
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching template:', error);
    return null;
  }
}; 
