import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

/**
 * Auth Callback Component
 * 
 * Handles redirects from Supabase Auth for:
 * - Password reset emails
 * - Magic link emails
 * - Email verification
 * - OAuth providers
 */
const AuthCallback = () => {
  const [status, setStatus] = useState('processing');
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Get hash and search params
        const hash = location.hash;
        const searchParams = new URLSearchParams(location.search);
        
        // Log authentication parameters for debugging
        console.log('[AuthCallback] Processing auth callback:', { 
          hash: hash ? 'present' : 'none',
          search: location.search ? 'present' : 'none',
          type: searchParams.get('type') || 'unknown'
        });

        // If this is an access token callback
        if (hash && hash.includes('access_token')) {
          // Supabase will handle this automatically in the client
          // Just wait a moment to let it process
          setStatus('authenticated');
          
          // Redirect to dashboard after a short delay
          setTimeout(() => {
            navigate('/dashboard');
          }, 2000);
          return;
        }

        // Check if this is a password reset
        const type = searchParams.get('type');
        
        if (type === 'recovery') {
          // This is a password reset request
          setStatus('password_reset');
          // Wait to let Supabase process the recovery token
          setTimeout(() => {
            navigate('/reset-password');
          }, 1000);
          return;
        }
        
        if (type === 'signup' || type === 'magiclink') {
          // This is an email confirmation or magic link
          // Supabase client handles this automatically
          setStatus('authenticated');
          
          // Redirect to dashboard after a short delay
          setTimeout(() => {
            navigate('/dashboard');
          }, 2000);
          return;
        }

        // Default fallback if no specific type is detected
        // Check if we have an active session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          setStatus('authenticated');
          // Redirect to dashboard
          setTimeout(() => {
            navigate('/dashboard');
          }, 2000);
        } else {
          setStatus('no_session');
          // Redirect to login
          setTimeout(() => {
            navigate('/login');
          }, 2000);
        }
      } catch (error) {
        console.error('[AuthCallback] Error handling auth callback:', error);
        setError(error.message);
        setStatus('error');
        
        // Redirect to login after error
        setTimeout(() => {
          navigate('/login?error=auth_callback_failed');
        }, 3000);
      }
    };

    handleAuthCallback();
  }, [location, navigate]);

  // Display a loading state while processing
  const renderStatusMessage = () => {
    switch (status) {
      case 'processing':
        return 'Processing your authentication...';
      case 'authenticated':
        return 'Authentication successful! Redirecting...';
      case 'password_reset':
        return 'Taking you to reset your password...';
      case 'no_session':
        return 'No active session found. Redirecting to login...';
      case 'error':
        return `Authentication error: ${error}. Redirecting to login...`;
      default:
        return 'Handling authentication...';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-md text-center">
        <div className="mb-6">
          {status === 'error' ? (
            <div className="mx-auto w-16 h-16 flex items-center justify-center rounded-full bg-red-100">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          ) : (
            <div className="mx-auto w-16 h-16 flex items-center justify-center rounded-full bg-blue-100">
              {status === 'authenticated' ? (
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              )}
            </div>
          )}
        </div>
        
        <h2 className="text-2xl font-bold mb-4">Authentication</h2>
        <p className="text-gray-600 mb-8">{renderStatusMessage()}</p>
        
        {status === 'error' && (
          <button
            onClick={() => navigate('/login')}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          >
            Return to Login
          </button>
        )}
      </div>
    </div>
  );
};

export default AuthCallback; 