import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '../../services/supabaseClient';
import { sendRenteeInvitation } from '../../services/renteeInvitation';

/**
 * Button component for inviting users
 * @param {Object} props
 * @param {string} props.userId - ID of the user to invite
 * @param {Function} props.onSuccess - Callback after successful invitation
 * @param {string} props.size - Button size: 'sm', 'md', or 'lg'
 * @param {boolean} props.fullWidth - Whether the button should take full width
 */
const InviteUserButton = ({ userId, onSuccess, size = 'md', fullWidth = false }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [invitationUrl, setInvitationUrl] = useState(null);
  
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
      setInvitationUrl(null);
      
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
      
      // Use the new sendRenteeInvitation function
      console.log(`Sending direct invitation to ${userData.name || 'User'} (${email})`);
      const result = await sendRenteeInvitation(
        email,
        userData.name || 'User',
        userId
      );
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to send invitation');
      }
      
      // Store the invitation URL for display
      if (result.invitationUrl) {
        setInvitationUrl(result.invitationUrl);
      }
      
      toast.success('Invitation generated successfully');
      
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
  
  // Let user copy the invitation URL to clipboard
  const copyToClipboard = () => {
    if (!invitationUrl) return;
    
    navigator.clipboard.writeText(invitationUrl)
      .then(() => toast.success('Invitation URL copied to clipboard!'))
      .catch(err => toast.error('Failed to copy: ' + err.message));
  };
  
  return (
    <div>
      <button
        onClick={handleInvite}
        disabled={loading}
        className={`
          ${sizeClasses[size] || sizeClasses.md}
          ${fullWidth ? 'w-full' : ''}
          bg-blue-600 hover:bg-blue-700 text-white 
          rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50
          disabled:bg-blue-300 disabled:cursor-not-allowed
          flex items-center justify-center
        `}
      >
        {loading ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Generating...
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
            </svg>
            Generate Invite Link
          </>
        )}
      </button>
      
      {/* Display invitation URL if available */}
      {invitationUrl && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
          <p className="font-medium mb-2">Invitation Link Generated:</p>
          <div className="flex items-center">
            <input 
              type="text" 
              value={invitationUrl} 
              readOnly 
              className="flex-1 p-2 border rounded text-xs overflow-hidden text-ellipsis bg-white" 
            />
            <button 
              onClick={copyToClipboard}
              className="ml-2 p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              title="Copy to clipboard"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
            </button>
          </div>
          <p className="mt-2 text-xs text-blue-600">
            Share this link with the user to complete their account setup.
          </p>
        </div>
      )}
      
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