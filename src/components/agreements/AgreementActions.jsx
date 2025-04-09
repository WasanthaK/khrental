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
    
    if (agreement.eviasignreference && 
        agreement.status !== STATUS.SIGNED && 
        agreement.status !== STATUS.REJECTED) {
      intervalId = setInterval(() => {
        refreshSignatureStatus();
      }, 120000); // Check every 2 minutes
    }
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [agreement.eviasignreference, agreement.status]);
  
  // Update previous status when current status changes
  useEffect(() => {
    if (signatureStatus && signatureStatus !== prevSignatureStatus) {
      setPrevSignatureStatus(signatureStatus);
    }
  }, [signatureStatus]);

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
        // Add webhook URL explicitly from env
        webhookUrl: import.meta.env.VITE_EVIA_WEBHOOK_URL
      };

      // Log webhook URL for debugging
      console.log('Using webhook URL:', import.meta.env.VITE_EVIA_WEBHOOK_URL);

      // Send directly for signature instead of showing form
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
      console.log('Status updates will be received via internal webhook endpoint at:', import.meta.env.VITE_EVIA_WEBHOOK_URL);

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
    <div className="space-y-4">
      {/* Status change notification - non-visual component */}
      <SignatureStatusNotification 
        status={mapStatusForTracker(signatureStatus)} 
        prevStatus={mapStatusForTracker(prevSignatureStatus)}
        requestId={agreement.eviasignreference}
      />
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Show status dashboard if already sent for signature */}
      {agreement.eviasignreference && (
        <AgreementStatusDashboard
          agreement={agreement}
          signatureStatus={signatureStatus}
          isRefreshing={isCheckingStatus}
          lastChecked={lastChecked}
          error={error}
          onRefresh={refreshSignatureStatus}
        />
      )}
      
      {/* Show signature details */}
      {agreement.eviasignreference && (
        <SignatureProcessDetails 
          status={mapStatusForTracker(signatureStatus)}
          requestId={agreement.eviasignreference}
        />
      )}

      {/* Buttons */}
      <div className="flex space-x-3 mt-6">
        {/* Send for Signature button - only show in review status with document */}
        {showSendButton && (
          <Button
            onClick={handleSendForSignature}
            disabled={disableSendButton}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {loading ? 'Sending...' : 'Send for Signature'}
          </Button>
        )}

        {/* View Document button - show if document exists */}
        {agreement.documenturl && (
          <Button
            onClick={handleViewDocument}
            className="bg-gray-600 hover:bg-gray-700 text-white"
          >
            View Document
          </Button>
        )}

        {/* Reset signature status button - show for non-complete statuses */}
        {hasSentForSignature && signatureStatus && signatureStatus !== 'completed' && (
          <Button
            onClick={handleResetSignatureStatus}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Reset Signature Request
          </Button>
        )}
      </div>
    </div>
  );
};

export default AgreementActions; 