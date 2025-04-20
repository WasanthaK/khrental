import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { checkUserAuthStatus } from '../../services/userManagement';

/**
 * Component to display a user's invitation status
 * @param {Object} props
 * @param {string} props.userId - The user ID to check status for
 * @param {boolean} props.hideLabel - Whether to hide the text label
 */
const InvitationStatusBadge = ({ userId, hideLabel = false }) => {
  const [status, setStatus] = useState('loading');
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const checkStatus = async () => {
      if (!userId) {
        setStatus('unknown');
        setLoading(false);
        return;
      }
      
      try {
        // Use the userManagement service
        const result = await checkUserAuthStatus(userId);
        
        if (result.success) {
          setStatus(result.registered ? 'registered' : 'not_registered');
        } else {
          console.error('Error checking auth status:', result.error);
          setStatus('error');
        }
      } catch (error) {
        console.error('Error in InvitationStatusBadge:', error);
        setStatus('error');
      } finally {
        setLoading(false);
      }
    };
    
    checkStatus();
  }, [userId]);
  
  // Define status styles
  const statusStyles = {
    loading: 'bg-gray-100 text-gray-800',
    unknown: 'bg-gray-100 text-gray-800',
    not_registered: 'bg-yellow-100 text-yellow-800',
    registered: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800'
  };
  
  // Define status labels
  const statusLabels = {
    loading: 'Loading...',
    unknown: 'Unknown',
    not_registered: 'Not Registered',
    registered: 'Registered',
    error: 'Error'
  };
  
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusStyles[status] || statusStyles.unknown}`}>
      {loading ? (
        <>
          <span className="inline-block h-2 w-2 rounded-full bg-current animate-pulse mr-1" />
          {!hideLabel && 'Checking...'}
        </>
      ) : (
        !hideLabel && statusLabels[status]
      )}
    </span>
  );
};

export default InvitationStatusBadge; 