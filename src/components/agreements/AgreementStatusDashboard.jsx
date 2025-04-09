import React from 'react';
import { FiFileText, FiUser, FiHome, FiCalendar, FiCheck, FiClock, FiAlertTriangle } from 'react-icons/fi';

/**
 * AgreementStatusDashboard - Displays detailed status information for an agreement
 */
const AgreementStatusDashboard = ({ agreement, rentee, property }) => {
  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) {
      return 'Not set';
    }
    return new Date(dateString).toLocaleDateString();
  };

  // Get status from agreement data
  const getStatusInfo = () => {
    const status = agreement.status || '';
    const signatureStatus = agreement.signature_status || '';
    
    // Priority order for status display
    if (status === 'rejected') {
      return {
        icon: FiAlertTriangle,
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        borderColor: 'border-red-600',
        label: 'Rejected'
      };
    } else if (status === 'expired' || status === 'cancelled') {
      return {
        icon: FiAlertTriangle,
        color: 'text-orange-600',
        bgColor: 'bg-orange-100',
        borderColor: 'border-orange-600',
        label: status === 'expired' ? 'Expired' : 'Cancelled'
      };
    } else if (status === 'active' || status === 'signed' || status === 'completed' || signatureStatus === 'signing_complete') {
      return {
        icon: FiCheck,
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        borderColor: 'border-green-600',
        label: 'Active'
      };
    } else if (status === 'pending_activation' || signatureStatus.startsWith('signed_by_') || status === 'partially_signed' || status === 'in_progress') {
      return {
        icon: FiClock,
        color: 'text-blue-600',
        bgColor: 'bg-blue-100', 
        borderColor: 'border-blue-600',
        label: 'Partially Signed'
      };
    } else if (signatureStatus === 'send_for_signature' || status === 'pending_signature' || status === 'pending') {
      return {
        icon: FiClock,
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
        borderColor: 'border-yellow-600',
        label: 'Pending Signature'
      };
    } else if (status === 'draft' || status === 'created') {
      return {
        icon: FiFileText,
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        borderColor: 'border-gray-600',
        label: 'Draft'
      };
    } else if (status === 'review') {
      return {
        icon: FiFileText,
        color: 'text-indigo-600',
        bgColor: 'bg-indigo-100',
        borderColor: 'border-indigo-600',
        label: 'In Review'
      };
    } else {
      return {
        icon: FiFileText,
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        borderColor: 'border-gray-400',
        label: status || 'Unknown'
      };
    }
  };
  
  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;
  
  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <div className="flex items-center mb-4">
        <div className={`p-2 rounded-full ${statusInfo.bgColor} mr-3`}>
          <StatusIcon className={`h-6 w-6 ${statusInfo.color}`} />
        </div>
        <div>
          <h3 className="text-lg font-semibold">{agreement.title || `Agreement #${agreement.id.substring(0, 8)}`}</h3>
          <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.bgColor} ${statusInfo.color}`}>
            {statusInfo.label}
          </div>
          {agreement.signature_status && (
            <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 ml-2">
              {agreement.signature_status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
            </div>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-500 mb-1">Start Date</p>
            <p className="font-medium">{formatDate(agreement.startdate)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">End Date</p>
            <p className="font-medium">{formatDate(agreement.enddate)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Created</p>
            <p className="font-medium">{formatDate(agreement.createdat)}</p>
          </div>
        </div>
        
        <div className="space-y-3">
          {property && (
            <div>
              <p className="text-sm text-gray-500 mb-1">Property</p>
              <div className="flex items-center">
                <FiHome className="mr-2 text-gray-400" />
                <p className="font-medium">{property.name}</p>
              </div>
            </div>
          )}
          
          {rentee && (
            <div>
              <p className="text-sm text-gray-500 mb-1">Tenant</p>
              <div className="flex items-center">
                <FiUser className="mr-2 text-gray-400" />
                <p className="font-medium">{rentee.name}</p>
              </div>
            </div>
          )}
          
          {agreement.eviasignreference && (
            <div>
              <p className="text-sm text-gray-500 mb-1">Signature Reference</p>
              <p className="font-mono text-xs bg-gray-100 p-1 rounded">{agreement.eviasignreference}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgreementStatusDashboard; 