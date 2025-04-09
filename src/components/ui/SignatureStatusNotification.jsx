import React, { useEffect } from 'react';
import { toast } from 'react-toastify';
import { FiFileText, FiUserCheck, FiCheck, FiAlertTriangle } from 'react-icons/fi';

/**
 * Component that handles showing toast notifications for signature status updates
 * This is a non-visual component that manages notifications
 */
const SignatureStatusNotification = ({ status, prevStatus, requestId }) => {
  useEffect(() => {
    // Only show notifications when status changes
    if (status && prevStatus && status !== prevStatus) {
      // Define notification content based on status
      let icon = null;
      let title = '';
      let message = '';
      let type = 'info';

      switch (status) {
        case 'pending_signature':
        case 'pending':
          icon = <FiFileText className="text-blue-500 mr-2" />;
          title = 'Signature Request Sent';
          message = `Signature request ${requestId} has been sent to all signatories.`;
          type = 'info';
          break;
          
        case 'partially_signed':
        case 'in_progress':
          icon = <FiUserCheck className="text-blue-500 mr-2" />;
          title = 'Document Partially Signed';
          message = `One or more signatories have completed the signing process.`;
          type = 'info';
          break;
          
        case 'signed':
        case 'completed':
          icon = <FiCheck className="text-green-500 mr-2" />;
          title = 'Document Fully Signed!';
          message = `All signatories have completed the signing process. The document is now fully signed.`;
          type = 'success';
          break;
          
        case 'error':
          icon = <FiAlertTriangle className="text-red-500 mr-2" />;
          title = 'Signature Process Error';
          message = `There was a problem with the signature process. Please check the details.`;
          type = 'error';
          break;
          
        default:
          // No notification for other statuses
          return;
      }

      // Show the toast notification
      toast[type](
        <div>
          <div className="font-semibold flex items-center">
            {icon} {title}
          </div>
          <div className="mt-1 text-sm">{message}</div>
        </div>,
        {
          position: "top-right",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
        }
      );
    }
  }, [status, prevStatus, requestId]);

  // This is a non-visual component, so return null
  return null;
};

export default SignatureStatusNotification; 