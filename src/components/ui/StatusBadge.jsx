import React from 'react';
import { STATUS } from '../../contexts/AgreementFormContext';

const StatusBadge = ({ status, signatureStatus }) => {
  // Define color schemes for different statuses
  const getStatusConfig = () => {
    switch (status) {
      case STATUS.DRAFT:
        return { 
          bgColor: 'bg-gray-200', 
          textColor: 'text-gray-800',
          label: 'Draft',
          icon: '📝'
        };
      case STATUS.REVIEW:
        return { 
          bgColor: 'bg-blue-200', 
          textColor: 'text-blue-800',
          label: 'Ready for Signature',
          icon: '✓'
        };
      case STATUS.PENDING_SIGNATURE:
        return { 
          bgColor: 'bg-yellow-200', 
          textColor: 'text-yellow-800',
          label: signatureStatus === 'rejected' 
            ? 'Signature Rejected' 
            : signatureStatus === 'expired'
              ? 'Signature Expired'
              : 'Awaiting Signature',
          icon: '⏱️'
        };
      case STATUS.SIGNED:
        return { 
          bgColor: 'bg-green-200', 
          textColor: 'text-green-800',
          label: 'Signed',
          icon: '✅'
        };
      case STATUS.CANCELLED:
        return { 
          bgColor: 'bg-red-200', 
          textColor: 'text-red-800',
          label: 'Cancelled',
          icon: '❌'
        };
      default:
        return { 
          bgColor: 'bg-gray-200', 
          textColor: 'text-gray-800',
          label: status || 'Unknown',
          icon: '❓'
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${config.bgColor} ${config.textColor}`}>
      <span className="mr-1">{config.icon}</span>
      {config.label}
    </div>
  );
};

export default StatusBadge; 