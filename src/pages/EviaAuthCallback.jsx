import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { handleAuthCallback } from '../services/eviaSignService';

const EviaAuthCallback = () => {
  const [status, setStatus] = useState('Initializing...');
  const [error, setError] = useState(null);
  const [errorDetails, setErrorDetails] = useState(null);
  const location = useLocation();

  useEffect(() => {
    const processCallback = async () => {
      try {
        // Get the URL parameters
        const params = new URLSearchParams(location.search);
        const code = params.get('code');
        const error = params.get('error');
        const errorDescription = params.get('error_description');

        console.log('Received Evia Sign auth callback:', { 
          code: code ? `${code.substring(0, 5)}...` : 'null',
          error,
          errorDescription
        });

        // Check for error parameters first
        if (error) {
          throw new Error(`Authentication error: ${error}${errorDescription ? ` - ${errorDescription}` : ''}`);
        }

        if (!code) {
          throw new Error('No authorization code provided');
        }

        setStatus('Processing authentication...');
        
        // Handle Evia Sign authentication
        console.log('Processing Evia Sign authentication...');
        const result = await handleAuthCallback(code);
        
        setStatus('Authentication successful! Closing window...');

        // Store auth info directly in localStorage
        console.log('Authentication successful');
        
        // Send message to parent window if in iframe or popup
        if (window.opener) {
          console.log('Sending success message to opener window');
          window.opener.postMessage({
            type: 'EVIA_AUTH_SUCCESS',
            data: {
              authToken: result.authToken,
              refreshToken: result.refreshToken,
              userEmail: result.userEmail
            }
          }, '*');
          
          // Close after delay to ensure message is sent
          setTimeout(() => {
            window.close();
          }, 1500);
        } 
        else if (window.parent !== window) {
          console.log('Sending success message to parent window');
          window.parent.postMessage({
            type: 'EVIA_AUTH_COMPLETE',
            success: true
          }, '*');
        }
        else {
          // If not in a popup or iframe, redirect
          console.log('Redirecting to home page');
          setTimeout(() => {
            window.location.href = '/';
          }, 1500);
        }
      } catch (error) {
        console.error('Evia Sign authentication error:', error);
        setStatus('Authentication failed');
        setError(error.message || 'Authentication failed');
        
        // Extract more detailed error info if available
        if (error.cause?.response) {
          setErrorDetails({
            status: error.cause.response.status,
            statusText: error.cause.response.statusText,
            data: error.cause.response.data
          });
        }
        
        // Send error to parent window if in iframe or popup
        if (window.opener) {
          window.opener.postMessage({
            type: 'EVIA_AUTH_ERROR',
            error: error.message || 'Authentication failed'
          }, '*');
          
          // Don't auto-close on error so user can see the message
        } 
        else if (window.parent !== window) {
          window.parent.postMessage({
            type: 'EVIA_AUTH_ERROR',
            error: error.message || 'Authentication failed'
          }, '*');
        }
      }
    };

    processCallback();
  }, [location]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white shadow-lg rounded-lg p-6 max-w-md w-full">
        <h1 className="text-2xl font-bold text-center mb-4">
          Evia Sign Authentication
        </h1>
        
        {error ? (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Authentication Error
                </h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
                
                {errorDetails && (
                  <div className="mt-2 text-xs text-red-700">
                    <p>Status: {errorDetails.status} {errorDetails.statusText}</p>
                    {errorDetails.data && (
                      <pre className="mt-1 bg-red-50 p-2 rounded overflow-auto">
                        {JSON.stringify(errorDetails.data, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="mt-4 text-sm text-gray-600">
              <p>This may be due to one of the following reasons:</p>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>The Evia Sign server is experiencing issues</li>
                <li>Your authentication credentials may be incorrect</li>
                <li>The authorization code may have expired</li>
                <li>There might be network connectivity issues</li>
              </ul>
              <p className="mt-2">You can try again or contact support if the issue persists.</p>
            </div>
          </div>
        ) : (
          <div className="text-center mb-4">
            <div className="mb-3">{status}</div>
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
            </div>
          </div>
        )}
        
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => window.close()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {error ? 'Close Window' : 'Close this window if it doesn\'t close automatically'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EviaAuthCallback; 