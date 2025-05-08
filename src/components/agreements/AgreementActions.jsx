import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '../../services/supabaseClient';
import { sendDocumentForSignature, getSignatureStatus, downloadSignedDocument } from '../../services/eviaSignService';
import { STATUS } from '../../contexts/AgreementFormContext';
import Button from '../ui/Button';
import SignatureStatusBadge from '../ui/SignatureStatusBadge';
import SignatureStatusTracker from '../ui/SignatureStatusTracker';
import SignatureStatusNotification from '../ui/SignatureStatusNotification';
import SignatureProcessDetails from '../ui/SignatureProcessDetails';
import AgreementStatusDashboard from './AgreementStatusDashboard';

const AgreementActions = ({ agreement, onStatusChange }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [signatureStatus, setSignatureStatus] = useState(null);
  const [prevSignatureStatus, setPrevSignatureStatus] = useState(null);
  const [showSignatureForm, setShowSignatureForm] = useState(false);
  const [signatureData, setSignatureData] = useState(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);
  
  // Track if we've already sent for signature
  const hasSentForSignature = !!agreement.eviasignreference;
  
  // Track if we should show the send button - only in review status
  const showSendButton = agreement.status === 'review' && agreement.documenturl;
  
  // Track if we should disable the send button
  const disableSendButton = loading || hasSentForSignature || 
    agreement.status === STATUS.SIGNED || agreement.status === STATUS.PENDING_SIGNATURE;

  useEffect(() => {
    // Check signature status when component mounts or reference changes
    if (agreement.eviasignreference) {
      checkSignatureStatus();
    }
  }, [agreement.eviasignreference]);
  
  // Set up automatic status checking every 2 minutes if we have a reference
  useEffect(() => {
    let intervalId = null;
    
    // We'll use polling as a fallback if we have a reference and status isn't completed
    if (agreement.eviasignreference && 
        (agreement.status !== STATUS.SIGNED && 
         signatureStatus !== 'completed')) {
      
      // Check every 2 minutes
      intervalId = setInterval(() => {
        console.log('Polling signature status...');
        checkSignatureStatus();
      }, 120000); // 2 minutes
      
      console.log('Set up polling for signature status updates');
    }
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [agreement.eviasignreference, agreement.status, signatureStatus]);
  
  // Update previous status when current status changes
  useEffect(() => {
    if (signatureStatus && signatureStatus !== prevSignatureStatus) {
      setPrevSignatureStatus(signatureStatus);
    }
  }, [signatureStatus]);

  // Add real-time subscription to agreement updates
  useEffect(() => {
    if (!agreement?.id) {
      return;
    }
    
    const handleAgreementUpdate = (payload) => {
      console.log('Real-time agreement update received:', payload);
      const updatedAgreement = payload.new;
      
      if (!updatedAgreement) {
        return;
      }
      
      // Update local status
      if (updatedAgreement.signature_status !== signatureStatus) {
        setPrevSignatureStatus(signatureStatus);
        setSignatureStatus(updatedAgreement.signature_status);
        setLastChecked(new Date().toISOString());
        
        // Show appropriate notification based on status
        if (updatedAgreement.signature_status === 'completed') {
          toast.success('Agreement has been fully signed!');
        } else if (updatedAgreement.signature_status === 'in_progress') {
          toast.info('A signatory has completed their signature');
        } else if (updatedAgreement.signature_status === 'pending') {
          toast.info('Signature request has been received');
        }
      }
      
      // Call parent handler if agreement status changed
      if (onStatusChange && updatedAgreement.status !== agreement.status) {
        onStatusChange(updatedAgreement.status);
      }
    };
    
    // Subscribe to agreement changes
    const agreementSubscription = supabase
      .channel(`agreement_${agreement.id}`)
      .on('postgres_changes', { 
        event: 'UPDATE',
        schema: 'public', 
        table: 'agreements',
        filter: `id=eq.${agreement.id}`
      }, handleAgreementUpdate)
      .subscribe();
    
    console.log(`Subscribed to real-time updates for agreement ${agreement.id}`);
    
    // Cleanup
    return () => {
      if (agreementSubscription) {
        supabase.removeChannel(agreementSubscription);
        console.log(`Unsubscribed from real-time updates for agreement ${agreement.id}`);
      }
    };
  }, [agreement?.id, onStatusChange]);

  const refreshSignatureStatus = async () => {
    if (!agreement.eviasignreference) {
      return;
    }
    
    try {
      setIsCheckingStatus(true);
      const result = await getSignatureStatus(agreement.eviasignreference);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to get signature status');
      }
      
      setSignatureStatus(result.status);
      setLastChecked(new Date().toISOString());
      
      // If status is completed but DB doesn't reflect it, update accordingly
      if (result.status === 'completed' && agreement.status !== STATUS.SIGNED) {
        await checkSignatureStatus(); // This will download the document and update DB
      }
      
      toast.success('Signature status refreshed');
    } catch (error) {
      console.error('Error refreshing signature status:', error);
      setError(error.message);
      toast.error('Failed to refresh signature status');
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const checkSignatureStatus = async () => {
    if (!agreement.eviasignreference) {
      return;
    }

    try {
      setIsCheckingStatus(true);
      const result = await getSignatureStatus(agreement.eviasignreference);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to get signature status');
      }
      
      setSignatureStatus(result.status);
      setLastChecked(new Date().toISOString());
      
      // If signed, download the document and update agreement
      if (result.status === 'completed') {
        const signedDoc = await downloadSignedDocument(agreement.eviasignreference);
        if (!signedDoc.success) {
          throw new Error(signedDoc.error || 'Failed to download signed document');
        }
        
        // Update agreement with signed document and status
        const { error: updateError } = await supabase
          .from('agreements')
          .update({
            status: STATUS.SIGNED,
            documenturl: signedDoc.documentUrl,
            updatedat: new Date().toISOString()
          })
          .eq('id', agreement.id);

        if (updateError) {
          throw updateError;
        }
        
        // Notify parent component of status change
        if (onStatusChange) {
          onStatusChange(STATUS.SIGNED);
        }
        toast.success('Agreement has been signed!');
      }
    } catch (error) {
      console.error('Error checking signature status:', error);
      setError(error.message);
      toast.error('Failed to check signature status');
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleSendForSignature = async () => {
    try {
      setLoading(true);
      setError(null);

      // First check if we have a document
      if (!agreement.documenturl) {
        throw new Error('No document available for signature');
      }

      // Get rentee details for signature request
      const { data: renteeData, error: renteeError } = await supabase
        .from('app_users')
        .select('name, email, contact_details')
        .eq('id', agreement.renteeid)
        .single();

      if (renteeError) {
        throw renteeError;
      }

      // Get landlord details
      const { data: landlordData, error: landlordError } = await supabase
        .from('app_users')
        .select('name, email, contact_details')
        .eq('id', agreement.landlordid)
        .single();

      if (landlordError) {
        throw landlordError;
      }

      // Use our own webhook endpoint instead of relying on environment variable
      // Only use webhooks in production environment or if specifically configured
      let webhookUrl = null;
      const isProduction = window.location.hostname !== 'localhost' && 
                         window.location.hostname !== '127.0.0.1';
                         
      if (isProduction) {
        webhookUrl = window.location.origin + '/api/evia-webhook';
        console.log('Using internal webhook URL:', webhookUrl);
      } else {
        console.log('Running in development environment - webhook notifications disabled');
      }

      // Prepare signature data
      const signatureData = {
        documentUrl: agreement.documenturl,
        title: `Rental Agreement - ${agreement.id}`,
        message: `Please sign this rental agreement between ${landlordData.name} and ${renteeData.name}`,
        signatories: [
          {
            name: landlordData.name,
            email: landlordData.email,
            identifier: 'landlord',
            textMarker: 'For Landlord:',
            mobile: landlordData.contact_details?.phone
          },
          {
            name: renteeData.name,
            email: renteeData.email,
            identifier: 'tenant',
            textMarker: 'For Tenant:',
            mobile: renteeData.contact_details?.phone
          }
        ],
        // Add webhook parameters for real-time status updates only if we have a URL
        ...(webhookUrl && {
          callbackUrl: webhookUrl,
          completedDocumentsAttached: true
        })
      };

      // Send directly for signature
      const result = await sendDocumentForSignature(signatureData);

      if (!result.success) {
        throw new Error(result.error || 'Failed to send document for signature');
      }

      // Update agreement with signature request ID
      const { error: updateError } = await supabase
        .from('agreements')
        .update({
          status: STATUS.PENDING_SIGNATURE,
          eviasignreference: result.requestId,
          updatedat: new Date().toISOString()
        })
        .eq('id', agreement.id);

      if (updateError) {
        throw updateError;
      }

      // Notify parent component of status change
      if (onStatusChange) {
        onStatusChange(STATUS.PENDING_SIGNATURE);
      }
      toast.success('Document sent for signature');
      
      // Refresh the signature status to show the pending state immediately
      setSignatureStatus('pending');
      setLastChecked(new Date().toISOString());
      
      // Set up webhook for status updates
      console.log('Signature request created with ID:', result.requestId);
      console.log('Status updates will be received via webhook at:', webhookUrl);

    } catch (error) {
      console.error('Error sending for signature:', error);
      setError(error.message);
      toast.error('Failed to send for signature: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDocument = () => {
    if (agreement.documenturl) {
      window.open(agreement.documenturl, '_blank');
    } else {
      toast.error('No document available');
    }
  };

  // Reset signature status for a new attempt
  const handleResetSignatureStatus = async () => {
    try {
      setLoading(true);
      
      const { error: updateError } = await supabase
        .from('agreements')
        .update({
          status: STATUS.REVIEW,
          eviasignreference: null,
          updatedat: new Date().toISOString()
        })
        .eq('id', agreement.id);

      if (updateError) {
        throw updateError;
      }
      
      // Clear local status state
      setSignatureStatus(null);
      setPrevSignatureStatus(null);
      
      // Notify parent component of status change
      if (onStatusChange) {
        onStatusChange(STATUS.REVIEW);
      }
      toast.success('Signature request has been reset');
    } catch (error) {
      console.error('Error resetting signature status:', error);
      setError(error.message);
      toast.error('Failed to reset signature status');
    } finally {
      setLoading(false);
    }
  };

  // Map Evia status to our status format
  const mapStatusForTracker = (eviaStatus) => {
    if (!eviaStatus) return null;
    
    switch (eviaStatus) {
      case 'pending':
      case 'pending_signature':
        return 'pending_signature';
      case 'in_progress':
      case 'partially_signed':
        return 'partially_signed';
      case 'completed':
        return 'signed';
      default:
        return eviaStatus;
    }
  };

  return (
    <div className="flex flex-col space-y-3">
      <div className="flex flex-wrap gap-2 items-center justify-end">
        {/* View Document Button */}
        {agreement.documenturl && (
          <Button
            size="sm"
            intent="secondary"
            className="min-w-[100px] text-xs sm:text-sm px-2 py-1 sm:px-3 sm:py-1.5 whitespace-nowrap"
            onClick={handleViewDocument}
          >
            View Document
          </Button>
        )}

        {/* Send for Signature Button - only shown in review status */}
        {showSendButton && (
          <Button
            size="sm"
            intent="primary"
            className="min-w-[140px] text-xs sm:text-sm px-2 py-1 sm:px-3 sm:py-1.5 whitespace-nowrap"
            onClick={handleSendForSignature}
            loading={loading}
            disabled={disableSendButton}
          >
            Send for Signature
          </Button>
        )}
        
        {/* Check Status Button - only shown when there's a signature in progress */}
        {agreement.eviasignreference && (
          <Button
            size="sm"
            intent="secondary"
            className="min-w-[120px] text-xs sm:text-sm px-2 py-1 sm:px-3 sm:py-1.5 whitespace-nowrap"
            onClick={refreshSignatureStatus}
            loading={isCheckingStatus}
          >
            Check Status
          </Button>
        )}
      </div>

      {/* Signature Status Section */}
      {signatureStatus && (
        <div className="mt-2 p-3 border border-gray-200 rounded-md bg-gray-50">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-600">Status:</span>
              <SignatureStatusBadge status={signatureStatus} />
            </div>
            <div className="text-xs text-gray-500">
              Last checked: {lastChecked ? new Date(lastChecked).toLocaleString() : 'Never'}
            </div>
          </div>
          
          <div className="mt-3">
            <SignatureStatusTracker status={mapStatusForTracker(signatureStatus)} />
          </div>
          
          {signatureStatus !== prevSignatureStatus && (
            <div className="mt-3">
              <SignatureStatusNotification 
                prevStatus={prevSignatureStatus} 
                currentStatus={signatureStatus} 
              />
            </div>
          )}
          
          {signatureData && (
            <div className="mt-4">
              <SignatureProcessDetails data={signatureData} />
            </div>
          )}
        </div>
      )}
      
      {/* Dev Tools - only show in development mode or for admin roles */}
      {(process.env.NODE_ENV === 'development' || agreement.status === 'pending_signature') && 
        agreement.eviasignreference && (
        <div className="mt-4 text-xs">
          <details className="p-2 border rounded border-gray-200">
            <summary className="cursor-pointer font-medium mb-2">Advanced Options</summary>
            <div className="space-y-2 pt-2">
              <p className="text-gray-500 mb-2">These options are for troubleshooting the signature process.</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="xs"
                  intent="danger"
                  variant="outline"
                  onClick={handleResetSignatureStatus}
                  className="text-xs px-2 py-1"
                >
                  Reset Signature
                </Button>
                <Button
                  size="xs"
                  intent="secondary"
                  variant="outline"
                  onClick={refreshSignatureStatus}
                  className="text-xs px-2 py-1"
                >
                  Force Refresh
                </Button>
              </div>
              <div className="text-gray-500 mt-2">
                <div>Reference: <code className="bg-gray-100 px-1 text-xs">{agreement.eviasignreference}</code></div>
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  );
};

export default AgreementActions; 