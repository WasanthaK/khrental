import React, { useEffect, useState } from 'react';
import { handleAuthCallback } from '../../services/eviaSignService';

const EviaCallback = () => {
  const [status, setStatus] = useState('Processing authentication...');
  const [error, setError] = useState(null);

  useEffect(() => {
    const processAuth = async () => {
      try {
        // Check if window.location exists
        if (!window?.location) {
          throw new Error('Window location is not available');
        }

        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');
        
        // Verify state to prevent CSRF
        const savedState = localStorage.getItem('eviaSignAuthState');
        if (!state || !savedState || state !== savedState) {
          throw new Error('Invalid or missing authentication state');
        }

        if (!code) {
          throw new Error('No authorization code found in URL');
        }

        setStatus('Processing authentication code...');
        
        // Process the authentication according to the documentation
        const result = await handleAuthCallback(code);
        
        if (!result?.authToken || !result?.refreshToken) {
          throw new Error('Invalid authentication response');
        }

        setStatus('Authentication successful! Closing window...');

        // Send success message to parent window
        if (window?.opener) {
          window.opener.postMessage({
            type: 'EVIA_AUTH_SUCCESS',
            data: {
              authToken: result.authToken,
              refreshToken: result.refreshToken,
              userEmail: result.userEmail
            }
          }, '*');
          
          // Close only this popup window, not the parent
          // Add a small delay to ensure the message is sent
          setTimeout(() => {
            window.close();
          }, 1000);
        } else {
          // If no opener, we're not in a popup - redirect to main page
          setStatus('Authentication successful! Redirecting...');
          window.location.href = '/';
        }
      } catch (err) {
        console.error('Authentication error:', err);
        setError(err.message || 'An unexpected error occurred');
        
        // Send error message to parent window
        if (window?.opener) {
          window.opener.postMessage({
            type: 'EVIA_AUTH_ERROR',
            error: err.message || 'An unexpected error occurred'
          }, '*');
          
          // Add a small delay to ensure the message is sent
          setTimeout(() => {
            window.close();
          }, 1000);
        }
      }
    };

    processAuth();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
        <h1 className="text-2xl font-bold mb-4">Evia Sign Authentication</h1>
        {error ? (
          <div className="text-red-500 mb-4">
            <p>Error: {error}</p>
            <p className="mt-2">This window will close automatically, or you can close it manually.</p>
          </div>
        ) : (
          <div className="mb-4">
            <p>{status}</p>
            <div className="mt-4 flex items-center justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
            </div>
          </div>
        )}
        <button 
          onClick={() => window.close()} 
          className="mt-4 w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Close Window
        </button>
      </div>
    </div>
  );
};

export default EviaCallback; 