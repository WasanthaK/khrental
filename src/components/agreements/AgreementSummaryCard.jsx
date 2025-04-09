import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '../../utils/helpers';
import { FiFileText, FiUser, FiHome, FiCalendar, FiCheck, FiClock, FiAlertTriangle, FiDownload, FiX, FiUsers, FiEye, FiLayout } from 'react-icons/fi';
import SignatureProgressTracker from '../ui/SignatureProgressTracker';
import AgreementDocument from './AgreementDocument';
import { toast } from 'react-hot-toast';

/**
 * AgreementSummaryCard - Displays a summary of an agreement with signature status
 */
const AgreementSummaryCard = ({ agreement, rentee, property, signatories = [], onViewClick, onCancelClick }) => {
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);
  
  // Ensure dates are properly formatted
  const startDate = agreement.startdate ? formatDate(agreement.startdate) : 'Not set';
  const endDate = agreement.enddate ? formatDate(agreement.enddate) : 'Not set';

  // Get status from agreement data
  const getStatus = () => {
    // First check signature_status, which comes from webhooks and is more accurate
    if (agreement.signature_status) {
      return agreement.signature_status;
    }
    
    // Fall back to agreement.status
    return agreement.status;
  };

  const signatureStatus = agreement.signature_status || '';
  const agreementState = agreement.status || '';
  const status = getStatus();
  
  // Get signed document URL - try different possible fields
  const signedDocumentUrl = agreement.signed_document_url || agreement.signatureurl || agreement.pdfurl || agreement.documenturl;
  
  // Prepare signatory data for display
  const signatoriesData = signatories.length > 0 ? signatories : [];
  
  // Check if any signatures have been completed based on actual data
  const hasAnySignatures = signatoriesData.some(sig => sig.completed) || 
                         signatureStatus.startsWith('signed_by_');
  
  // Determine if view button should be disabled
  const disableViewButton = false; // We now allow viewing any agreement
  
  // create a mock representation of partial completion
  if ((status === 'in_progress' || status === 'partially_signed') && signatoriesData.length === 0) {
    signatoriesData.push(
      { id: 'landlord', name: 'Landlord', completed: true },
      { id: 'tenant', name: 'Tenant', completed: false }
    );
  }
  
  // Get color and icon based on status for the card border and header styling
  const getStatusInfo = () => {
    // Priority order for status display
    if (agreementState === 'rejected') {
      return {
        icon: FiAlertTriangle,
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        borderColor: 'border-l-4 border-red-600',
        label: 'Rejected'
      };
    } else if (agreementState === 'expired' || agreementState === 'cancelled') {
      return {
        icon: FiAlertTriangle,
        color: 'text-orange-600',
        bgColor: 'bg-orange-100',
        borderColor: 'border-l-4 border-orange-600',
        label: agreementState === 'expired' ? 'Expired' : 'Cancelled'
      };
    } else if (agreementState === 'active' || status === 'signed' || status === 'completed' || signatureStatus === 'signing_complete') {
      return {
        icon: FiCheck,
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        borderColor: 'border-l-4 border-green-600',
        label: 'Active'
      };
    } else if (hasAnySignatures || signatureStatus.startsWith('signed_by_')) {
      return {
        icon: FiClock,
        color: 'text-blue-600',
        bgColor: 'bg-blue-100', 
        borderColor: 'border-l-4 border-blue-600',
        label: 'Partially Signed'
      };
    } else if (status === 'send_for_signature' || status === 'pending_signature' || status === 'pending' || status === 'pending_activation') {
      return {
        icon: FiClock,
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
        borderColor: 'border-l-4 border-yellow-600',
        label: 'Pending Signature'
      };
    } else if (status === 'review') {
      return {
        icon: FiFileText,
        color: 'text-indigo-600',
        bgColor: 'bg-indigo-100',
        borderColor: 'border-l-4 border-indigo-600',
        label: 'In Review'
      };
    } else {
      return {
        icon: FiFileText,
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        borderColor: 'border-l-4 border-gray-400',
        label: status || 'Unknown'
      };
    }
  };
  
  const statusInfo = getStatusInfo();

  // Handle cancel button click
  const handleCancelClick = () => {
    // For completed agreements, show modal requesting reason
    if (agreementState === 'active' || agreementState === 'completed' || agreementState === 'signed') {
      setShowCancelModal(true);
    } else if (window.confirm('Are you sure you want to cancel this agreement?')) {
      // For pending agreements, confirm and proceed directly
      onCancelClick(agreement.id);
    }
  };

  // Handle final cancel confirmation with reason
  const handleConfirmCancel = () => {
    if (!cancelReason.trim()) {
      toast.error('Please provide a reason for cancellation');
      return;
    }

    setIsSubmitting(true);
    // Call the parent component's cancel handler with the reason
    onCancelClick(agreement.id, cancelReason);
    setShowCancelModal(false);
    setIsSubmitting(false);
  };

  // Toggle document viewer
  const handleViewDocument = (e) => {
    e.preventDefault();
    setShowDocumentViewer(true);
  };

  const closeDocumentViewer = () => {
    setShowDocumentViewer(false);
  };

  return (
    <div className={`border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow ${statusInfo.borderColor}`}>
      <div className="p-4">
        <div className="flex flex-wrap md:flex-nowrap items-start justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 mb-2 md:mb-0">
            {agreement.title || `Agreement #${agreement.id.substring(0, 8)}`}
          </h3>
          
          <div className="flex flex-col w-full md:w-auto md:flex-row md:items-center space-y-2 md:space-y-0 md:space-x-3">
            {/* Agreement state badge */}
            <div className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.bgColor} ${statusInfo.color} flex items-center`}>
              <statusInfo.icon className="mr-1 h-3 w-3" />
              <span>{statusInfo.label}</span>
            </div>
            
            {/* Signature status badge */}
            {signatureStatus && (
              <div className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                {signatureStatus.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
              </div>
            )}
            
            {/* Add the compact signature progress tracker */}
            <SignatureProgressTracker 
              status={agreementState}
              signature_status={signatureStatus}
              signatories={signatoriesData}
              compact={true}
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
          {property && (
            <div className="flex items-center text-sm text-gray-600">
              <FiHome className="mr-1 h-4 w-4 text-gray-400" />
              <span>{property.name}</span>
            </div>
          )}
          
          {agreement.property_units && (
            <div className="flex items-center text-sm text-gray-600">
              <FiLayout className="mr-1 h-4 w-4 text-gray-400" />
              <span>Unit: {agreement.property_units.unitnumber}
              {agreement.property_units.floor && ` (Floor: ${agreement.property_units.floor})`}</span>
            </div>
          )}
          
          {rentee && (
            <div className="flex items-center text-sm text-gray-600">
              <FiUser className="mr-1 h-4 w-4 text-gray-400" />
              <span>{rentee.name}</span>
            </div>
          )}
          
          <div className="flex items-center text-sm text-gray-600">
            <FiCalendar className="mr-1 h-4 w-4 text-gray-400" />
            <span>Start: {startDate}</span>
          </div>
          
          <div className="flex items-center text-sm text-gray-600">
            <FiCalendar className="mr-1 h-4 w-4 text-gray-400" />
            <span>End: {endDate}</span>
          </div>
        </div>
        
        {/* Signatories section */}
        <div className="mt-3 mb-3">
          <div className="flex items-center mb-2">
            <FiUsers className="mr-1 h-4 w-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">Signatories</span>
          </div>
          <div className="divide-y divide-gray-100 bg-gray-50 rounded-md overflow-hidden">
            {signatoriesData.map((signatory, index) => (
              <div key={signatory.id || index} className="px-3 py-2 flex justify-between items-center">
                <div className="text-sm">
                  <span className="font-medium">{signatory.name}</span>
                  {signatory.email && <span className="text-xs text-gray-500 ml-1">({signatory.email})</span>}
                </div>
                <div className={`flex items-center text-xs px-2 py-0.5 rounded ${
                  signatory.completed 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {signatory.completed 
                    ? <><FiCheck className="mr-1 h-3 w-3" /> Signed</> 
                    : <><FiClock className="mr-1 h-3 w-3" /> Pending</>}
                  {signatory.signedAt && <span className="ml-1">({formatDate(signatory.signedAt)})</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {agreement.eviasignreference && (
          <div className="text-xs text-gray-500 mb-3">
            <span className="font-mono">Ref: {agreement.eviasignreference.substring(0, 12)}...</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-between items-center border-t pt-3 mt-3 px-4 pb-4">
        <div className="text-xs text-gray-500">
          Created: {formatDate(agreement.createdat)}
        </div>
        
        <div className="flex space-x-2 mt-2 sm:mt-0">
          {/* Signed document button - now opens viewer instead of direct link */}
          {signedDocumentUrl && (
            <button
              onClick={handleViewDocument}
              className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors flex items-center"
            >
              <FiEye className="mr-1 h-3 w-3" />
              View Document
            </button>
          )}
          
          {/* Cancel button - available for all agreements, but with different behavior */}
          {onCancelClick && (
            <button
              onClick={handleCancelClick}
              className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors flex items-center"
            >
              <FiX className="mr-1 h-3 w-3" />
              Cancel
            </button>
          )}
          
          {/* View Details button - always available */}
          <button
            onClick={onViewClick}
            className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
            disabled={disableViewButton}
          >
            View Details
          </button>
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-5">
            <h3 className="text-lg font-medium mb-4">Cancel Active Agreement</h3>
            <p className="mb-4 text-gray-600">
              This agreement is already active/completed. 
              Please provide a reason for cancellation:
            </p>
            <textarea
              className="w-full border rounded-md p-2 mb-4 h-24"
              placeholder="Reason for cancellation..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            ></textarea>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={isSubmitting}
                className={`px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 ${
                  isSubmitting ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              >
                {isSubmitting ? 'Processing...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      {showDocumentViewer && signedDocumentUrl && (
        <AgreementDocument 
          documentUrl={signedDocumentUrl} 
          onClose={closeDocumentViewer} 
        />
      )}
    </div>
  );
};

export default AgreementSummaryCard; 