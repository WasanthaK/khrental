import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

/**
 * AuthCallback component to handle authentication callbacks from both Supabase and Evia Sign
 * This component handles the callback after a user clicks on an invite link, magic link, or password reset link
 */
const AuthCallback = () => {
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const processCallback = async () => {
      try {
        // Check if Evia Sign authentication is in progress
        const eviaAuthInProgress = sessionStorage.getItem('eviaAuthInProgress');
        if (eviaAuthInProgress === 'true') {
          console.log('[AuthCallback] Skipping Supabase auth - Evia Sign auth in progress');
          return;
        }

        // Get the URL parameters
        const params = new URLSearchParams(location.search);
        const code = params.get('code');
        const type = params.get('type');

        console.log('[AuthCallback] Processing Supabase callback:', { code, type });

        if (!code) {
          throw new Error('No authorization code provided');
        }

        // Handle Supabase authentication (password reset, invite, etc.)
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          throw error;
        }
        
        setSession(data.session);
        
        // Redirect based on the type of Supabase auth
        if (type === 'recovery') {
          navigate('/update-password');
        } else if (type === 'invite') {
          navigate('/register');
        } else {
          navigate('/dashboard');
        }
      } catch (error) {
        console.error('[AuthCallback] Authentication error:', error);
        setError(error.message);
        
        // Redirect to login after a delay if there's an error
        setTimeout(() => {
          navigate('/login', { 
            state: { error: 'Authentication failed. Please try again.' } 
          });
        }, 3000);
      }
    };

    processCallback();
  }, [navigate, location]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Authentication Error
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              {error}
            </p>
          </div>
          <div className="mt-8 text-center">
            <button
              onClick={() => navigate('/login')}
              className="text-indigo-600 hover:text-indigo-500"
            >
              Return to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Processing Authentication
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Please wait while we complete your authentication...
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthCallback; 