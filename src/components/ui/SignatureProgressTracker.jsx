import React from 'react';
import { FiCheck, FiClock, FiUserCheck, FiUsers, FiAlertTriangle } from 'react-icons/fi';

/**
 * A component that shows detailed progress of the signature process
 * including which signatories have signed in a user-friendly way
 * 
 * @param {Object} props
 * @param {string} props.status - The agreement status from the database 
 * @param {string} props.signature_status - The signature status from the database
 * @param {Array} props.signatories - Array of signatories with their status
 * @param {number} props.totalSignatories - Total number of signatories required
 * @param {number} props.completedSignatories - Number of signatories who have completed
 * @param {boolean} props.compact - Whether to show a compact version
 */
const SignatureProgressTracker = ({ 
  status, 
  signature_status,
  signatories = [], 
  totalSignatories = 0,
  completedSignatories = 0,
  compact = false 
}) => {
  // If signatories are provided but counts aren't, calculate them
  const total = totalSignatories || signatories.length;
  const completed = completedSignatories || signatories.filter(s => s.completed).length;
  
  // Determine the visual progress state based on both status fields
  const getProgressState = () => {
    // First check agreement status for terminal states
    if (status === 'rejected' || status === 'cancelled') {
      return {
        icon: FiAlertTriangle,
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        borderColor: 'border-red-500',
        label: status === 'rejected' ? 'Rejected' : 'Cancelled',
        message: status === 'rejected' 
          ? 'The agreement was rejected.' 
          : 'The agreement was cancelled.'
      };
    } else if (status === 'expired') {
      return {
        icon: FiAlertTriangle,
        color: 'text-orange-600',
        bgColor: 'bg-orange-100',
        borderColor: 'border-orange-500',
        label: 'Expired',
        message: 'The agreement has expired.'
      };
    }
    
    // Check signature status first as it's more specific
    if (signature_status === 'signing_complete' || signature_status === 'signed' || status === 'signed' || status === 'completed' || status === 'active') {
      return {
        icon: FiCheck,
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        borderColor: 'border-green-500',
        label: 'Completed',
        message: 'All signatories have signed the document.'
      };
    } else if (signature_status?.startsWith('signed_by_')) {
      // Extract the signer's name from the status
      const signerName = signature_status.replace('signed_by_', '').replace(/_/g, ' ');
      
      return {
        icon: FiUserCheck,
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        borderColor: 'border-blue-500',
        label: `${completed} of ${total} Signed`,
        message: `Signed by ${signerName}`
      };
    } else if (signature_status === 'send_for_signature' || status === 'pending_signature' || status === 'pending' || status === 'pending_activation') {
      return {
        icon: FiClock,
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
        borderColor: 'border-yellow-500',
        label: '0 of ' + total + ' Signed',
        message: 'The document is awaiting signatures.'
      };
    } else if (status === 'draft' || status === 'created' || status === 'review') {
      return {
        icon: FiClock,
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        borderColor: 'border-gray-500',
        label: status === 'review' ? 'In Review' : 'Draft',
        message: status === 'review' 
          ? 'The agreement is being reviewed.' 
          : 'The agreement is in draft mode.'
      };
    } else {
      return {
        icon: FiClock,
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        borderColor: 'border-gray-500',
        label: signature_status || status || 'Unknown',
        message: 'Current agreement status.'
      };
    }
  };

  const progressState = getProgressState();
  const ProgressIcon = progressState.icon;
  
  // Compact view for cards and smaller UI elements
  if (compact) {
    return (
      <div className="flex items-center space-x-2">
        <div className={`p-1 rounded-full ${progressState.bgColor}`}>
          <ProgressIcon className={`w-4 h-4 ${progressState.color}`} />
        </div>
        <span className={`text-sm font-medium ${progressState.color}`}>
          {progressState.label}
        </span>
      </div>
    );
  }
  
  // Generate a list of signatories with their status
  const renderSignatoryList = () => {
    if (!signatories.length) {
      return (
        <div className="flex items-center p-3 bg-gray-50 rounded-md">
          <FiUsers className="mr-2 text-gray-500" />
          <span className="text-gray-600">No signatory information available</span>
        </div>
      );
    }
    
    return (
      <div className="space-y-2 mt-3">
        {signatories.map((signatory, index) => (
          <div 
            key={signatory.id || index}
            className={`flex items-center justify-between p-3 rounded-md ${
              signatory.completed ? 'bg-green-50 border-l-4 border-green-500' : 'bg-gray-50'
            }`}
          >
            <div className="flex items-center">
              <span className="font-medium">{index + 1}. {signatory.name || 'Signatory'}</span>
              {signatory.email && <span className="ml-2 text-sm text-gray-500">({signatory.email})</span>}
            </div>
            <div className="flex items-center">
              {signatory.completed ? (
                <>
                  <span className="text-green-600 mr-2">Signed</span>
                  <FiCheck className="text-green-600" />
                </>
              ) : (
                <>
                  <span className="text-gray-500 mr-2">Pending</span>
                  <FiClock className="text-gray-500" />
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Full view with detailed information
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center mb-3">
        <div className={`p-2 rounded-full ${progressState.bgColor} mr-3`}>
          <ProgressIcon className={`w-5 h-5 ${progressState.color}`} />
        </div>
        <div>
          <h3 className="font-semibold">{progressState.label}</h3>
          <p className="text-sm text-gray-600">{progressState.message}</p>
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
        <div 
          className={`h-2.5 rounded-full ${
            (signature_status === 'signing_complete' || status === 'signed' || status === 'completed' || status === 'active')
              ? 'bg-green-500'
              : status === 'rejected' || status === 'cancelled'
                ? 'bg-red-500'
                : status === 'expired'
                  ? 'bg-orange-500'
                  : 'bg-blue-500'
          }`}
          style={{ width: `${Math.min(100, (completed / Math.max(1, total)) * 100)}%` }}
        ></div>
      </div>
      
      {/* Signatory list */}
      {renderSignatoryList()}
    </div>
  );
};

export default SignatureProgressTracker; 