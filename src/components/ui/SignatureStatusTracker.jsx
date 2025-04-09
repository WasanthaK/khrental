import React from 'react';
import { FiFileText, FiClock, FiUserCheck, FiCheck, FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';

/**
 * Component to visually display the signature process status
 */
const SignatureStatusTracker = ({ status, isRefreshing, lastChecked, error }) => {
  // Define the steps in the signature process
  const steps = [
    { key: 'document', label: 'Document Prepared', icon: FiFileText, complete: true },
    { 
      key: 'pending', 
      label: 'Waiting for Signatures', 
      icon: FiClock,
      complete: status === 'pending_signature' || status === 'pending' || status === 'partially_signed' || status === 'in_progress' || status === 'signed' || status === 'completed',
      active: status === 'pending_signature' || status === 'pending'
    },
    { 
      key: 'partial', 
      label: 'Partially Signed', 
      icon: FiUserCheck,
      complete: status === 'partially_signed' || status === 'in_progress' || status === 'signed' || status === 'completed',
      active: status === 'partially_signed' || status === 'in_progress'
    },
    { 
      key: 'complete', 
      label: 'Fully Signed', 
      icon: FiCheck,
      complete: status === 'signed' || status === 'completed',
      active: status === 'signed' || status === 'completed'
    }
  ];

  // Helper function to get a user-friendly status message
  const getStatusMessage = () => {
    switch(status) {
      case 'pending_signature':
      case 'pending':
        return 'The document has been sent for signature and is awaiting signatures from all parties.';
      case 'partially_signed': 
      case 'in_progress':
        return 'The document has been signed by some parties but is still awaiting others.';
      case 'signed':
      case 'completed':
        return 'The document has been fully signed by all parties. The process is complete.';
      default:
        return 'The document is being prepared for signature.';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-4">
      {/* Main status indicator */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <h3 className="text-xl font-bold mr-3">Signature Status</h3>
          <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
            status === 'signed' || status === 'completed'
              ? 'bg-green-100 text-green-800' 
              : status === 'partially_signed' || status === 'in_progress'
                ? 'bg-blue-100 text-blue-800' 
                : status === 'pending_signature' || status === 'pending'
                  ? 'bg-yellow-100 text-yellow-800' 
                  : 'bg-gray-100 text-gray-800'
          }`}>
            {status === 'signed' || status === 'completed'
              ? 'Signed ✓' 
              : status === 'partially_signed' || status === 'in_progress'
                ? 'Partially Signed' 
                : status === 'pending_signature' || status === 'pending'
                  ? 'Awaiting Signatures' 
                  : 'Not Started'}
          </div>
        </div>
        
        {isRefreshing && (
          <div className="flex items-center text-blue-500 animate-pulse">
            <FiRefreshCw className="animate-spin mr-2" />
            <span>Refreshing...</span>
          </div>
        )}
      </div>
      
      {/* Status description */}
      <div className="mb-6 px-4 py-3 bg-blue-50 border-l-4 border-blue-500 text-blue-700">
        <p>{getStatusMessage()}</p>
      </div>
      
      {/* Status steps timeline */}
      <div className="flex justify-between mb-8">
        {steps.map((step, index) => (
          <div key={step.key} className="flex flex-col items-center relative">
            {/* Connecting line between steps */}
            {index < steps.length - 1 && (
              <div 
                className={`absolute h-1 top-5 left-10 w-16 md:w-24 lg:w-32 -z-10 ${
                  step.complete ? 'bg-green-500' : 'bg-gray-300'
                }`}
              ></div>
            )}
            
            {/* Step icon */}
            <div 
              className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                step.active 
                  ? 'border-blue-500 bg-blue-100 text-blue-500' 
                  : step.complete 
                    ? 'border-green-500 bg-green-500 text-white' 
                    : 'border-gray-300 bg-gray-100 text-gray-400'
              }`}
            >
              <step.icon className="w-5 h-5" />
            </div>
            
            {/* Step label */}
            <span 
              className={`text-sm mt-2 text-center ${
                step.active 
                  ? 'font-semibold text-blue-500' 
                  : step.complete 
                    ? 'font-medium text-green-600' 
                    : 'text-gray-500'
              }`}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>
      
      {/* Last updated information */}
      {lastChecked && (
        <div className="text-right text-xs text-gray-500 mt-2">
          Last updated: {new Date(lastChecked).toLocaleString()}
        </div>
      )}
      
      {/* Error message if present */}
      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600 flex items-center">
          <FiAlertTriangle className="mr-2 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default SignatureStatusTracker; 