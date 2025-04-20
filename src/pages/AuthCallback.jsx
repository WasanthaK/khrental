import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { toast } from 'react-hot-toast';

/**
 * Auth Callback Handler
 * 
 * This component handles all auth-related redirects from Supabase:
 * - Magic link logins
 * - Invitation redemption
 * - Password recovery
 * 
 * It automatically processes the auth action and redirects the user 
 * to the appropriate page.
 */
const AuthCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [message, setMessage] = useState('Processing your authentication...');
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Get the current URL parameters
        const params = new URLSearchParams(location.search);
        const type = params.get('type'); // Can be 'recovery', 'invite', 'magiclink', etc.
        
        // Check if we have an active session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          throw sessionError;
        }
        
        // Handle different callback types
        if (type === 'invite') {
          // For invitation flow, redirect to accept-invite page
          // The token is already in the URL and processed by Supabase
          navigate('/accept-invite' + location.search, { replace: true });
          return;
        } else if (type === 'recovery') {
          // For password recovery, redirect to reset password page
          navigate('/reset-password' + location.search, { replace: true });
          return;
        } else if (type === 'magiclink' || !type) {
          // Check if this is a rentee invitation magic link
          // Look for special query parameters that we add to our rentee invitations
          const userId = params.get('user_id');
          const renteeEmail = params.get('email');
          const renteeName = params.get('name');
          
          if (userId && renteeEmail) {
            console.log('Detected rentee invitation magic link with user ID:', userId);
            // This is a rentee invitation, redirect to accept-invite
            setMessage('Invitation detected! Redirecting to account setup...');
            
            // Pass along all the parameters
            navigate(`/accept-invite?user_id=${userId}&email=${encodeURIComponent(renteeEmail)}&name=${encodeURIComponent(renteeName || 'User')}`, 
              { replace: true }
            );
            return;
          }
          
          // For regular magic link or if no type specified, just confirm the session
          if (!session) {
            // Regular magic link handling code...
            // If no session, attempt to get one from the URL
            // This happens automatically in getSession above in most cases
            const { error: signInError } = await supabase.auth.signInWithOtp({
              email: params.get('email') || '',
              options: {
                shouldCreateUser: false,
              },
            });
            
            if (signInError) {
              throw signInError;
            }
            
            // Try again to get the session
            const { data: refreshData, error: refreshError } = await supabase.auth.getSession();
            
            if (refreshError) {
              throw refreshError;
            }
            
            if (!refreshData.session) {
              throw new Error('Failed to establish a session');
            }
          }
          
          // Successfully logged in for regular users
          setMessage('Authentication successful! Redirecting...');
          toast.success('Logged in successfully!');
          
          // Redirect to dashboard
          setTimeout(() => {
            navigate('/dashboard', { replace: true });
          }, 1000);
          
          return;
        }
        
        // For any other types or if the flow above didn't return
        // Just redirect to dashboard if we have a session
        if (session) {
          toast.success('Logged in successfully!');
          navigate('/dashboard', { replace: true });
        } else {
          // If no session was established, go to login
          navigate('/login', { replace: true });
        }
      } catch (err) {
        console.error('Error in auth callback:', err);
        setError(`Authentication error: ${err.message}`);
        
        // After error, redirect to login page after a short delay
        setTimeout(() => {
          navigate('/login', { replace: true });
        }, 3000);
      }
    };
    
    handleAuthCallback();
  }, [navigate, location.search]);

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <div className="text-center">
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
              <strong className="font-bold">Error: </strong>
              <span className="block sm:inline">{error}</span>
            </div>
            <p className="text-gray-600 mb-4">Redirecting to login page...</p>
            <button 
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
              onClick={() => navigate('/login')}
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show loading indicator while processing
  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">{message}</p>
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;