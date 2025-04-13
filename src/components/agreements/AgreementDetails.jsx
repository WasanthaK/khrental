import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { AGREEMENT_STATUS } from '../../constants/agreementStatus';
import StatusBadge from '../StatusBadge';

// Add a button to refresh the signature status
const RefreshStatusButton = ({ agreement }) => {
  const [loading, setLoading] = useState(false);
  
  // Only show for agreements in pending status
  if (agreement.status !== AGREEMENT_STATUS.PENDING || !agreement.eviasignreference) {
    return null;
  }
  
  const handleRefresh = async () => {
    try {
      setLoading(true);
      
      // Import the function dynamically
      const { updateAgreementSignatureStatus } = await import('../../services/eviaSignService');
      
      // Check the status
      const result = await updateAgreementSignatureStatus(
        agreement.id, 
        agreement.eviasignreference
      );
      
      if (result.success) {
        toast.success('Status updated successfully');
        // Force a refresh of the component
        loadAgreementData();
      } else {
        toast.error('Failed to update status: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error refreshing status:', error);
      toast.error('Error checking status: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <button 
      onClick={handleRefresh}
      disabled={loading}
      className="ml-2 inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20"
    >
      {loading ? 'Refreshing...' : 'Refresh Status'}
    </button>
  );
};

// ... existing code ...

// Add the refresh button component in the render method near the status badge

// ... existing code ...

{/* Add RefreshStatusButton next to the status badge */}
<div className="flex items-center">
  <StatusBadge status={agreement.status} />
  {agreement.signature_status && (
    <span className="ml-2 inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">
      {agreement.signature_status}
    </span>
  )}
  <RefreshStatusButton agreement={agreement} /> 
</div>

// ... existing code ... 