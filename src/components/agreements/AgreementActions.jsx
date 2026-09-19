import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { platform as platformClient } from '../../services/platformClient';
import { sendDocumentForSignature, getSignatureStatus, downloadSignedDocument } from '../../services/eviaSignService';
import { STATUS } from '../../contexts/AgreementFormContext';
import { fetchAppUser } from '../../services/appUserService';
import { updateAgreementData } from '../../services/agreementService';
import { isMssqlApiEnabled } from '../../services/mssqlApiClient';
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

    if (isMssqlApiEnabled()) {
      return undefined;
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
    const agreementSubscription = platformClient
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
        platformClient.removeChannel(agreementSubscription);
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
      
      // If signed, download the final PDF and reconcile the canonical agreement.
      // Preserve documenturl as the original agreement generated before signing.
      if (result.status === 'completed') {
        const signedDoc = await downloadSignedDocument(agreement.eviasignreference);
        if (!signedDoc.success) {
          throw new Error(signedDoc.error || 'Failed to download signed document');
        }

        const completedAt = new Date().toISOString();
        let signatoriesStatus = [];
        try {
          const current = typeof agreement.signatories_status === 'string'
            ? JSON.parse(agreement.signatories_status)
            : agreement.signatories_status;
          if (Array.isArray(current)) {
            signatoriesStatus = current.map((signatory) => ({
              ...signatory,
              status: 'completed',
              signed_at: signatory.signed_at || signatory.signedAt || completedAt,
              signedAt: signatory.signedAt || signatory.signed_at || completedAt
            }));
          }
        } catch (_error) {
          signatoriesStatus = [];
        }
        
        await updateAgreementData(agreement.id, {
          status: STATUS.SIGNED,
          signature_status: 'completed',
          signature_completed_at: completedAt,
          signeddate: completedAt,
          signed_document_url: signedDoc.documentUrl,
          signeddocumenturl: signedDoc.documentUrl,
          signature_pdf_url: signedDoc.documentUrl,
          ...(signatoriesStatus.length > 0 ? { signatories_status: signatoriesStatus } : {}),
          updatedat: completedAt
        });
        
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

      if (!agreement.documenturl) {
        throw new Error('No document available for signature');
      }

      const renteeData = await fetchAppUser(agreement.renteeid);
      const landlordData = await fetchAppUser(agreement.landlordid);

      let webhookUrl = null;
      const isProduction = window.location.hostname !== 'localhost' && 
                         window.location.hostname !== '127.0.0.1';
                         
      if (isProduction) {
        webhookUrl = window.location.origin + '/api/evia/webhook';
        console.log('Using internal webhook URL:', webhookUrl);
      } else {
        console.log('Running in development environment - webhook notifications disabled');
      }

      const signatories = [
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
      ];

      const signatureData = {
        documentUrl: agreement.documenturl,
        title: `Rental Agreement - ${agreement.id}`,
        message: `Please sign this rental agreement between ${landlordData.name} and ${renteeData.name}`,
        signatories,
        ...(webhookUrl && {
          callbackUrl: webhookUrl,
          callbackTypes: [0],
          completedDocumentsAttached: true
        })
      };

      const result = await sendDocumentForSignature(signatureData);

      if (!result.success) {
        throw new Error(result.error || 'Failed to send document for signature');
      }

      const sentAt = new Date().toISOString();
      await updateAgreementData(agreement.id, {
        status: STATUS.PENDING_SIGNATURE,
        signature_status: 'pending',
        signature_sent_at: sentAt,
        eviasignreference: result.requestId,
        signatories_status: signatories.map((signatory) => ({
          name: signatory.name,
          email: signatory.email,
          type: signatory.identifier,
          status: 'pending',
          email_delivery_status: 'queued',
          email_status_updated_at: sentAt
        })),
        updatedat: sentAt
      });

      if (onStatusChange) {
        onStatusChange(STATUS.PENDING_SIGNATURE);
      }
      toast.success('Document sent for signature');
      
      setSignatureStatus('pending');
      setLastChecked(sentAt);
      
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
      
      await updateAgreementData(agreement.id, {
        status: STATUS.REVIEW,
        eviasignreference: null,
        updatedat: new Date().toISOString()
      });
      
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
    if (!eviaStatus) {
      return null;
    }
    
    // Convert to string to ensure safe comparison
    const statusStr = String(eviaStatus);
    
    switch (statusStr) {
      case 'pending':
      case 'pending_signature':
        return 'pending_signature';
      case 'in_progress':
      case 'partially_signed':
        return 'partially_signed';
      case 'completed':
        return 'signed';
      default:
        return statusStr;
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
            </div>
          </details>
        </div>
      )}

      {error && (
        <div className="mt-2 p-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
          {error}
        </div>
      )}

      <AgreementStatusDashboard agreement={agreement} signatureStatus={signatureStatus} />
    </div>
  );
};

export default AgreementActions;
