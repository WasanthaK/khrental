import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { supabase } from '../../services/supabaseClient';
import AgreementFormUI from './AgreementFormUI';
import { AGREEMENT_STATUS } from '../../constants/agreementStatus';
import SignatureForm from './SignatureForm.jsx';
import { saveMergedDocument } from '../../services/DocumentService';

// Helper function to generate UUID that works in all browsers
const generateUUID = () => {
  // Use native crypto.randomUUID if available (modern browsers)
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  
  // Fallback implementation for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const AgreementFormContainer = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [initialData, setInitialData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSignatureForm, setShowSignatureForm] = useState(false);
  const [formDataToSign, setFormDataToSign] = useState(null);
  const [agreement, setAgreement] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('User not found');
        }
        
        // Get the app_user record for the current user
        const { data: appUser, error: appUserError } = await supabase
          .from('app_users')
          .select('*')
          .eq('auth_id', user.id)
          .single();
          
        if (appUserError) {
          throw appUserError;
        }
        
        if (!appUser) {
          throw new Error('App user profile not found');
        }
        
        setCurrentUser(appUser);
      } catch (error) {
        console.error('Error loading user data:', error);
        toast.error('Failed to load user data');
      }
    };
    
    loadUserData();
    
    if (id) {
      loadAgreement();
    } else {
      setLoading(false);
    }
  }, [id]);

  const loadAgreement = async () => {
    try {
      const { data, error } = await supabase
        .from('agreements')
        .select(`
          *,
          property:properties(*),
          unit:property_units(*),
          rentee:app_users!agreements_renteeid_fkey(*)
        `)
        .eq('id', id)
        .single();

      if (error) {
        throw error;
      }
      
      setInitialData(data);
      setAgreement(data);
    } catch (error) {
      console.error('Error loading agreement:', error);
      toast.error('Failed to load agreement');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (formData, status = AGREEMENT_STATUS.DRAFT) => {
    try {
      console.log("Submitting agreement with status:", status);
      
      // If user wants to send for signature, show signature form
      if (status === AGREEMENT_STATUS.PENDING) {
        console.log("PENDING status detected - preparing for signature form display");
        
        // Save the agreement first to get an ID if it's a new agreement
        const savedAgreement = await saveAgreement(formData, AGREEMENT_STATUS.DRAFT);
        console.log("Agreement saved for signature with ID:", savedAgreement.id);
        
        // Set state for signature form
        setFormDataToSign(formData);
        setAgreement(savedAgreement);
        
        console.log("Setting showSignatureForm to true");
        setShowSignatureForm(true);
        return;
      }
      
      // Continue with normal saving for other statuses
      await saveAgreement(formData, status);
    } catch (error) {
      console.error('Error handling agreement submission:', error);
      toast.error('Failed to process agreement: ' + error.message);
    }
  };

  const saveAgreement = async (formData, status) => {
    try {
      // Make sure terms is properly saved as an object, not a character array
      const termsObject = typeof formData.terms === 'string' 
        ? JSON.parse(formData.terms)
        : formData.terms;
      
      // Generate a UUID for new agreements
      const agreementId = formData.id || generateUUID();
      console.log("Agreement ID:", agreementId, "is new:", !formData.id);
      
      // Prepare agreement data
      const agreementData = {
        id: agreementId,
        templateid: formData.templateid,
        propertyid: formData.propertyid,
        unitid: formData.unitid || null,
        renteeid: formData.renteeid,
        status: status,
        terms: termsObject,
        notes: formData.notes,
        documenturl: formData.processedContent,
        needs_document_generation: status === AGREEMENT_STATUS.REVIEW || status === AGREEMENT_STATUS.PENDING
      };

      console.log("Saving agreement with data:", agreementData);

      // Save agreement
      const { data: savedAgreement, error: saveError } = await supabase
        .from('agreements')
        .upsert([agreementData])
        .select()
        .single();

      if (saveError) {
        throw saveError;
      }

      console.log("Agreement saved successfully:", savedAgreement);

      // Only call DOCX generation for non-draft statuses that need document generation
      if (status !== AGREEMENT_STATUS.DRAFT && 
          agreementData.needs_document_generation && 
          status === AGREEMENT_STATUS.REVIEW) {
        console.log('Review status detected - generating DOCX document');
        await handleDocxGeneration(savedAgreement.id, {
          processedContent: formData.processedContent,
          id: savedAgreement.id
        });
      }

      toast.success('Agreement saved successfully');

      // Navigation strategy based on status
      if (status === AGREEMENT_STATUS.PENDING) {
        navigate('/dashboard/agreements');
      } else if (!id) {
        navigate('/dashboard/agreements');
      } else if (status === AGREEMENT_STATUS.REVIEW) {
        navigate(`/dashboard/agreements/${savedAgreement.id}`);
      } else {
        navigate(`/dashboard/agreements/${savedAgreement.id}`);
      }
      
      return savedAgreement;
    } catch (error) {
      console.error('Error saving agreement:', error);
      toast.error('Failed to save agreement: ' + error.message);
      throw error;
    }
  };

  const handleSignatureFormSuccess = async (signatureData) => {
    try {
      console.log("[AgreementFormContainer] Signature form submitted with data:", signatureData);
      console.log("[AgreementFormContainer] Current agreement state:", {
        id: agreement?.id,
        documenturl: agreement?.documenturl ? `${agreement.documenturl.substring(0, 30)}...` : 'Missing',
        signatories: signatureData?.signatories?.length || 0
      });
      
      if (!agreement?.id) {
        console.error('[AgreementFormContainer] Agreement ID is missing, cannot update agreement');
        throw new Error('Agreement ID is missing');
      }
      
      // Check if signatureData has required fields
      if (!signatureData) {
        console.error('[AgreementFormContainer] No signature data received');
        throw new Error('No signature data received from form');
      }
      
      if (!signatureData.signatories || signatureData.signatories.length === 0) {
        console.error('[AgreementFormContainer] No signatories provided');
        throw new Error('At least one signatory is required');
      }
      
      // IMPORTANT: Always generate a fresh DOCX file before sending for signature
      // This ensures we have a proper document format that Evia can process
      console.log('[AgreementFormContainer] Generating document file before sending for signature');
      
      // Get content from either documenturl or processedContent, regardless of format
      const documentContent = agreement.processedContent || agreement.documenturl;
      
      // Generate a DOCX document
      const docxUrl = await handleDocxGeneration(agreement.id, { 
        processedContent: documentContent,
        id: agreement.id 
      });
      
      if (!docxUrl) {
        console.error('[AgreementFormContainer] Failed to generate document file');
        throw new Error('Failed to generate document file for signature');
      }
      
      console.log('[AgreementFormContainer] Document generated successfully:', docxUrl);
      
      // Now we need to explicitly call the Evia Sign service
      console.log('[AgreementFormContainer] Calling Evia Sign service to send document for signature');
      
      try {
        const { sendDocumentForSignature } = await import('../../services/eviaSignService');
        
        // Validate the document URL
        if (!docxUrl || typeof docxUrl !== 'string' || !docxUrl.startsWith('http')) {
          console.error('[AgreementFormContainer] Invalid document URL:', docxUrl);
          throw new Error('Invalid document URL');
        }
        
        console.log('[AgreementFormContainer] Sending document for signature with URL:', docxUrl);
        
        const signatureResult = await sendDocumentForSignature({
          documentUrl: docxUrl,
          title: signatureData.title || "Rental Agreement",
          message: signatureData.message || "Please sign this rental agreement",
          signatories: signatureData.signatories,
          webhookUrl: import.meta.env.VITE_EVIA_WEBHOOK_URL || null
        });
        
        console.log('[AgreementFormContainer] Evia Sign API response:', signatureResult);
        
        if (!signatureResult.success) {
          throw new Error(signatureResult.error || 'Failed to send document for signature');
        }
        
        // Use the requestId returned from the Evia Sign API
        const eviaSignReference = signatureResult.requestId;
        console.log('[AgreementFormContainer] Evia Sign reference ID:', eviaSignReference);
        
        console.log("[AgreementFormContainer] Preparing to update agreement with ID:", agreement.id);
        console.log("[AgreementFormContainer] Update data:", { 
          status: AGREEMENT_STATUS.PENDING, 
          eviasignreference: eviaSignReference || null
        });

        // Update the agreement status to PENDING
        const { data: updatedAgreement, error: updateError } = await supabase
          .from('agreements')
          .update({ 
            status: AGREEMENT_STATUS.PENDING,
            eviasignreference: eviaSignReference || null,
            signature_status: 'pending'
          })
          .eq('id', agreement.id)
          .select();

        if (updateError) {
          console.error('[AgreementFormContainer] Error updating agreement in database:', updateError);
          throw updateError;
        }
        
        console.log('[AgreementFormContainer] Agreement updated successfully:', updatedAgreement);
        toast.success('Agreement sent for signature successfully');
        setShowSignatureForm(false);
        
        // Start checking signature status periodically
        if (eviaSignReference) {
          console.log('[AgreementFormContainer] Starting signature status monitoring');
          // Initial delay before first check
          setTimeout(() => {
            checkSignatureStatus(agreement.id, eviaSignReference);
          }, 15000); // Check after 15 seconds
        }
        
        // Navigate to agreements list
        console.log('[AgreementFormContainer] Navigating to agreements list');
        navigate('/dashboard/agreements');
      } catch (eviaError) {
        console.error('[AgreementFormContainer] Evia Sign API error:', eviaError);
        
        // More detailed error logging
        if (eviaError.response) {
          console.error('[AgreementFormContainer] API Response status:', eviaError.response.status);
          console.error('[AgreementFormContainer] API Response data:', eviaError.response.data);
        }
        
        throw new Error(`Evia Sign API error: ${eviaError.message}`);
      }
    } catch (error) {
      console.error('[AgreementFormContainer] Error processing signature:', error);
      toast.error('Failed to send for signature: ' + error.message);
    }
  };

  const handleDocxGeneration = async (agreementId, formData) => {
    try {
      // Get the processed HTML content
      const documentContent = formData.processedContent || formData.documenturl;
      
      if (!documentContent) {
        throw new Error('No document content available');
      }
      
      console.log('Starting DOCX document generation for agreement ID:', agreementId);
      
      // First save the document content as a DOCX file
      const docxUrl = await saveMergedDocument(documentContent, agreementId);
      
      if (!docxUrl) {
        throw new Error('Failed to generate DOCX document');
      }
      
      console.log('DOCX file saved successfully:', docxUrl);
      console.log('Document URL properties:', {
        url: docxUrl,
        isString: typeof docxUrl === 'string',
        length: docxUrl ? docxUrl.length : 0,
        startsWithHttp: docxUrl ? docxUrl.startsWith('http') : false,
        endsWithDocx: docxUrl ? docxUrl.toLowerCase().endsWith('.docx') : false
      });
      
      // Update the agreement with the document URL
      const { data: updatedAgreement, error: updateError } = await supabase
        .from('agreements')
        .update({ 
          documenturl: docxUrl,
          // Set the flag to show that this agreement has a saved document
          needs_document_generation: false
        })
        .eq('id', agreementId)
        .select();
        
      if (updateError) {
        throw updateError;
      }
      
      console.log('Agreement updated with document URL:', {
        id: updatedAgreement[0].id,
        documenturl: updatedAgreement[0].documenturl
      });
      
      toast.success('Document saved successfully');
      return docxUrl;
    } catch (error) {
      console.error('Error in DOCX document generation:', error);
      toast.error('Failed to generate document: ' + error.message);
      return false;
    }
  };

  const handleCancel = () => {
    navigate('/dashboard/agreements');
  };

  const handleSignatureFormCancel = () => {
    setShowSignatureForm(false);
  };

  // Function to periodically check signature status
  const checkSignatureStatus = async (agreementId, eviaSignReference) => {
    try {
      console.log('[AgreementFormContainer] Checking signature status for agreement:', agreementId);
      
      // Import the function dynamically to avoid circular dependencies
      const { updateAgreementSignatureStatus } = await import('../../services/eviaSignService');
      
      // Update the status
      const result = await updateAgreementSignatureStatus(agreementId, eviaSignReference);
      console.log('[AgreementFormContainer] Status update result:', result);
      
      // If API check failed with not found, check webhook events as a fallback
      if (result?.success === false && result?.status === 'unknown') {
        console.log('[AgreementFormContainer] API status check failed, checking webhook events...');
        
        try {
          // Check if we have any webhook events for this request ID
          const { data: webhookEvents } = await supabase
            .from('webhook_events')
            .select('*')
            .eq('request_id', eviaSignReference)
            .order('event_time', { ascending: false })
            .limit(5);
            
          if (webhookEvents && webhookEvents.length > 0) {
            console.log('[AgreementFormContainer] Found webhook events:', webhookEvents.length);
            
            // Process the latest webhook event
            const latestEvent = webhookEvents[0];
            if (latestEvent.event_id === 3) { // RequestCompleted
              console.log('[AgreementFormContainer] Found completed webhook event, updating agreement');
              
              // Update the agreement status to signed
              await supabase
                .from('agreements')
                .update({
                  status: 'signed',
                  signature_status: 'completed',
                  updatedat: new Date().toISOString()
                })
                .eq('id', agreementId);
                
              console.log('[AgreementFormContainer] Agreement updated to signed status from webhook event');
              return;
            }
          }
        } catch (webhookError) {
          console.error('[AgreementFormContainer] Error checking webhook events:', webhookError);
        }
      }
      
      // Check if the result has a status property indicating status
      if (result && (
          // Success states
          (result[0]?.signature_status === 'completed') || 
          // Error states that should stop polling
          (result.status === 'unknown') || 
          (result.success === false && result.message?.includes('not found'))
        )) {
        console.log('[AgreementFormContainer] Signature check complete or request not found, stopping polling');
        return;
      }
      
      // Schedule next check in 30 seconds if still in progress
      setTimeout(() => {
        checkSignatureStatus(agreementId, eviaSignReference);
      }, 30000); // 30 seconds
    } catch (error) {
      console.error('[AgreementFormContainer] Error checking signature status:', error);
      // Stop polling on error after a few retries
      if (error.retryCount && error.retryCount >= 3) {
        console.log('[AgreementFormContainer] Too many errors, stopping status checks');
        return;
      }
      
      // Retry with exponential backoff
      setTimeout(() => {
        // Add retry count to error for tracking
        error.retryCount = (error.retryCount || 0) + 1;
        checkSignatureStatus(agreementId, eviaSignReference);
      }, 30000 * (error.retryCount || 1)); // 30s, 60s, 90s backoff
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  console.log("Render debug - SignatureForm conditions:", {
    showSignatureForm,
    hasAgreement: !!agreement,
    hasCurrentUser: !!currentUser
  });

  return (
    <>
      <AgreementFormUI
        initialData={initialData}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        readOnly={initialData?.status === AGREEMENT_STATUS.SIGNED}
      />
      
      {/* Use the original SignatureForm component only */}
      {showSignatureForm && agreement && currentUser && (
        <SignatureForm
          agreement={agreement}
          currentUser={currentUser}
          onSuccess={handleSignatureFormSuccess}
          onCancel={handleSignatureFormCancel}
        />
      )}
    </>
  );
};

export default AgreementFormContainer; 