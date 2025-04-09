import React from 'react';
import { FiUser, FiMail, FiCheck, FiClock, FiX, FiChevronRight, FiLink } from 'react-icons/fi';

/**
 * Component to display details about the signature process including signatories
 */
const SignatureProcessDetails = ({ signatories, status, requestId }) => {
  // Mock data for display purposes - in a real implementation, this would come from the API
  const mockSignatories = signatories || [
    { 
      name: 'John Smith (Landlord)', 
      email: 'john@example.com',
      status: status === 'partially_signed' || status === 'in_progress' || status === 'signed' || status === 'completed' ? 'signed' : 'pending',
      signedAt: status === 'partially_signed' || status === 'in_progress' || status === 'signed' || status === 'completed' ? new Date().toISOString() : null
    },
    { 
      name: 'Jane Doe (Tenant)', 
      email: 'jane@example.com',
      status: status === 'signed' || status === 'completed' ? 'signed' : 'pending',
      signedAt: status === 'signed' || status === 'completed' ? new Date().toISOString() : null
    }
  ];

  const getStatusText = (signatory) => {
    if (signatory.status === 'signed') {
      return `Signed on ${new Date(signatory.signedAt).toLocaleDateString()} at ${new Date(signatory.signedAt).toLocaleTimeString()}`;
    } else if (signatory.status === 'rejected') {
      return 'Rejected signature request';
    } else if (signatory.status === 'viewed') {
      return 'Opened document, not yet signed';
    } else {
      return 'Awaiting signature';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-xl font-bold mb-4">Signature Details</h3>
      
      {requestId && (
        <div className="mb-5 bg-gray-50 p-3 rounded-md">
          <div className="flex items-center">
            <FiLink className="text-gray-500 mr-2" />
            <p className="text-sm text-gray-700 font-medium">Request ID:</p>
          </div>
          <p className="text-sm font-mono mt-1 text-gray-600">{requestId}</p>
        </div>
      )}
      
      <div className="mb-4">
        <h4 className="text-md font-semibold text-gray-800 mb-3 flex items-center">
          <FiUser className="mr-2 text-blue-500" />
          Signatories
        </h4>
        
        <div className="divide-y border-t border-b">
          {mockSignatories.map((signatory, index) => (
            <div key={index} className="py-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center">
                    <span className="font-medium text-gray-900">{signatory.name}</span>
                    {signatory.status === 'signed' && (
                      <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                        Signed
                      </span>
                    )}
                  </div>
                  <div className="flex items-center mt-1 text-sm text-gray-500">
                    <FiMail className="text-gray-400 mr-2" />
                    <span>{signatory.email}</span>
                  </div>
                  
                  <div className="mt-2 text-sm">
                    <div className={`flex items-center ${
                      signatory.status === 'signed'
                        ? 'text-green-600' 
                        : signatory.status === 'rejected'
                          ? 'text-red-600'
                          : 'text-yellow-600'
                    }`}>
                      {signatory.status === 'signed' ? (
                        <FiCheck className="mr-1" />
                      ) : signatory.status === 'rejected' ? (
                        <FiX className="mr-1" />
                      ) : (
                        <FiClock className="mr-1" />
                      )}
                      <span>{getStatusText(signatory)}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex-shrink-0 ml-4">
                  {/* Visual order indicator */}
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-blue-700 font-medium">{index + 1}</span>
                  </div>
                </div>
              </div>
              
              {/* Signing activity timeline - only show for signed documents */}
              {signatory.status === 'signed' && (
                <div className="mt-3 pl-4 border-l-2 border-green-200">
                  <div className="text-xs text-gray-500 flex items-baseline">
                    <FiChevronRight className="mr-1 text-green-500" />
                    <span>Document opened</span>
                    <span className="ml-auto">
                      {new Date(signatory.signedAt).toLocaleString(undefined, {
                        timeStyle: 'short',
                        dateStyle: 'short'
                      })}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 flex items-baseline">
                    <FiChevronRight className="mr-1 text-green-500" />
                    <span>Signature completed</span>
                    <span className="ml-auto">
                      {new Date(signatory.signedAt).toLocaleString(undefined, {
                        timeStyle: 'short',
                        dateStyle: 'short'
                      })}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* Status update actions */}
      <div className="mt-4 p-3 bg-blue-50 rounded-md">
        <p className="text-sm text-blue-800">
          <span className="font-medium">What happens next?</span>{' '}
          {status === 'signed' || status === 'completed'
            ? 'All parties have signed the document. You can now view and download the signed document.' 
            : status === 'partially_signed' || status === 'in_progress'
              ? 'Some parties have signed. Waiting for remaining signatures to complete the process.'
              : 'The document has been sent to all signatories. You will be notified when they sign.'}
        </p>
      </div>
      
      {status === 'error' && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">
            There was a problem with the signature process. Please try again or contact support.
          </p>
        </div>
      )}
      
      {status === 'expired' && (
        <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
          <p className="text-sm text-orange-700">
            This signature request has expired. Please create a new signature request.
          </p>
        </div>
      )}
    </div>
  );
};

export default SignatureProcessDetails; 