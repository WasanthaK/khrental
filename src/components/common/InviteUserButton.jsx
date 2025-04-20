import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '../../services/supabaseClient';
import { resendInvitation } from '../../services/invitationService';

/**
 * Button component for inviting users
 * @param {Object} props
 * @param {string} props.userId - ID of the user to invite
 * @param {Function} props.onSuccess - Callback after successful invitation
 * @param {string} props.size - Button size: 'sm', 'md', or 'lg'
 * @param {boolean} props.fullWidth - Whether the button should take full width
 * @param {boolean} props.sendReal - Whether to send a real email (default: false)
 */
const InviteUserButton = ({ userId, onSuccess, size = 'md', fullWidth = false, sendReal = false }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [useSendReal, setUseSendReal] = useState(sendReal);
  
  // Size classes
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base'
  };
  
  // Handle invitation
  const handleInvite = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // First check if the app_users table exists
      try {
        const { data: testData, error: testError } = await supabase
          .from('app_users')
          .select('id')
          .limit(1);
        
        if (testError) {
          console.error('Error checking app_users table:', testError);
          throw new Error(`The app_users table might not exist: ${testError.message}`);
        }
      } catch (tableError) {
        console.error('Error checking app_users table:', tableError);
        throw new Error(`The app_users table might not exist: ${tableError.message}`);
      }
      
      // First fetch the user details
      const { data: userData, error: userError } = await supabase
        .from('app_users')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (userError) {
        console.error('Error fetching user details:', userError);
        throw new Error(`Failed to fetch user details: ${userError.message}`);
      }
      
      if (!userData) {
        throw new Error('User not found');
      }
      
      // Get email from contact_details or directly from the user object
      const email = userData.contact_details?.email || userData.email;
      
      if (!email) {
        throw new Error('User has no email address');
      }
      
      console.log(`Sending invitation to ${userData.name || 'User'} (${email})`);
      
      // Use the resendInvitation function from invitationService
      // Pass simulated=false if sendReal is true to send a real email
      const result = await resendInvitation(userId, !useSendReal);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to send invitation');
      }
      
      // Show success message based on simulation status
      if (!result.simulated) {
        toast.success('Real invitation email sent successfully');
      } else {
        toast.success('Simulated invitation email sent successfully');
      }
      
      // Call success callback if provided
      if (onSuccess && typeof onSuccess === 'function') {
        onSuccess();
      }
    } catch (error) {
      console.error('Error sending invitation:', error);
      setError(error.message);
      
      // Show a more user-friendly error message
      if (error.message && (
        error.message.includes('app_users') || 
        error.message.includes('relation') || 
        error.message.includes('does not exist')
      )) {
        toast.error('The app_users table does not exist. Please run the migration first.');
      } else {
        toast.error(`Failed to send invitation: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div>
      <div className="flex items-center mb-2">
        <input
          id={`send-real-checkbox-${userId}`}
          type="checkbox"
          checked={useSendReal}
          onChange={() => setUseSendReal(!useSendReal)}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
        <label htmlFor={`send-real-checkbox-${userId}`} className="ml-2 block text-sm text-gray-600">
          Send real email
        </label>
      </div>
      <button
        onClick={handleInvite}
        disabled={loading}
        className={`
          ${sizeClasses[size] || sizeClasses.md}
          ${fullWidth ? 'w-full' : ''}
          ${useSendReal ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'} text-white 
          rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50
          disabled:opacity-50 disabled:cursor-not-allowed
          flex items-center justify-center
        `}
      >
        {loading ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Sending...
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
            </svg>
            {useSendReal ? 'Send Real Invitation' : 'Send Invitation'}
          </>
        )}
      </button>
      
      {/* Display error message if any */}
      {error && (
        <div className="mt-2 text-red-600 text-sm">
          Error: {error}
        </div>
      )}
    </div>
  );
};

export default InviteUserButton; 