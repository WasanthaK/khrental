import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { linkAppUser } from '../services/appUserService';

/**
 * Emergency Debug Version of AuthCallback
 * This is a simplified version to diagnose blank screen issues
 */
const AuthCallback = () => {
  const [status, setStatus] = useState('Starting authentication process...');
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState({});
  const location = useLocation();
  const navigate = useNavigate();
  
  // Use the native window.location instead of navigate to avoid React router issues
  const simpleRedirect = (path) => {
    console.log(`[DEBUG] Redirecting to ${path}`);
    // Try both methods to ensure navigation works
    try {
      navigate(path);
      setTimeout(() => {
        window.location.href = path;
      }, 500);
    } catch (e) {
      console.log('[DEBUG] Navigate failed, using window.location:', e);
      window.location.href = path;
    }
  };
  
  useEffect(() => {
    const processAuth = async () => {
      try {
        console.log('[DEBUG] Starting authentication process with hash:', window.location.hash);
        console.log('[DEBUG] Starting authentication process with search:', window.location.search);
        setStatus('Processing authentication...');
        
        // Extract query parameters (code and type)
        const params = new URLSearchParams(location.search);
        const code = params.get('code');
        const type = params.get('type');
        
        setDebugInfo(prev => ({ 
          ...prev, 
          code: !!code, 
          type,
          fullUrl: window.location.href,
          search: window.location.search,
          hash: window.location.hash
        }));
        console.log(`[DEBUG] Auth parameters: code=${!!code}, type=${type}`);
        
        if (!code) {
          setError('No authorization code found in URL');
          return;
        }
        
        // Get session using Supabase
        setStatus('Getting session data...');
        const { data, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('[DEBUG] Session error:', sessionError);
          setError(`Session error: ${sessionError.message}`);
          setDebugInfo(prev => ({ ...prev, sessionError }));
          return;
        }
        
        if (!data || !data.session) {
          console.error('[DEBUG] No session data returned');
          
          // Try exchange code for session as a fallback
          try {
            setStatus('Trying to exchange code for session...');
            const { data: exchangeData, error: exchangeError } = 
              await supabase.auth.exchangeCodeForSession(code);
            
            if (exchangeError) {
              console.error('[DEBUG] Exchange error:', exchangeError);
              setError(`Exchange error: ${exchangeError.message}`);
              setDebugInfo(prev => ({ ...prev, exchangeError }));
              return;
            }
            
            if (!exchangeData || !exchangeData.session) {
              setError('No session from exchange code either');
              return;
            }
            
            // Continue with the exchanged session
            setStatus('Got session from code exchange');
            setDebugInfo(prev => ({ ...prev, exchangeData }));
            
            // Get session again after exchange
            const { data: refreshedData, error: refreshError } = 
              await supabase.auth.getSession();
              
            if (refreshError || !refreshedData.session) {
              setError(`Failed to get refreshed session: ${refreshError?.message || 'No session'}`);
              return;
            }
            
            // Use the refreshed data
            const { user } = refreshedData.session;
            setDebugInfo(prev => ({ 
              ...prev, 
              refreshedUser: { 
                id: user.id, 
                email: user.email,
                metadata: user.user_metadata
              } 
            }));
            
            console.log('[DEBUG] Authentication successful via code exchange:', user.email);
            setStatus(`Authenticated via code exchange as ${user.email}`);
            
            // Continue with linking and redirecting
            handleUserAuthenticated(user);
            
            return;
          } catch (exchangeCodeError) {
            console.error('[DEBUG] Error exchanging code:', exchangeCodeError);
            setError(`Error exchanging code: ${exchangeCodeError.message}`);
            setDebugInfo(prev => ({ ...prev, exchangeCodeError: exchangeCodeError.message }));
            return;
          }
        }
        
        // Extract user data
        const { user } = data.session;
        setDebugInfo(prev => ({ 
          ...prev, 
          user: { 
            id: user.id, 
            email: user.email,
            metadata: user.user_metadata
          } 
        }));
        
        console.log('[DEBUG] Authentication successful:', user.email);
        setStatus(`Authenticated as ${user.email}`);
        
        // Handle the authenticated user
        handleUserAuthenticated(user);
        
      } catch (error) {
        console.error('[DEBUG] Critical error in auth process:', error);
        setError(`Critical error: ${error.message}`);
        setDebugInfo(prev => ({ 
          ...prev, 
          criticalError: error.message,
          stack: error.stack
        }));
      }
    };
    
    const handleUserAuthenticated = async (user) => {
      try {
        // Check for app_user_id in metadata
        const metadata = user.user_metadata || {};
        if (metadata.app_user_id) {
          try {
            setStatus(`Linking auth account to app_user ${metadata.app_user_id}...`);
            console.log(`[DEBUG] Linking auth user ${user.id} to app_user ${metadata.app_user_id}`);
            
            const linkResult = await linkAppUser(user.id, metadata.app_user_id);
            setDebugInfo(prev => ({ ...prev, linkResult }));
            
            if (linkResult.success) {
              console.log('[DEBUG] Account linking successful');
              setStatus('Account linked successfully');
            } else {
              console.warn('[DEBUG] Account linking failed:', linkResult.error);
              setStatus(`Account linking failed: ${linkResult.error}`);
            }
          } catch (linkError) {
            console.error('[DEBUG] Error linking accounts:', linkError);
            setStatus(`Error linking accounts: ${linkError.message}`);
            setDebugInfo(prev => ({ ...prev, linkError: linkError.message }));
          }
        }
        
        // Choose redirect destination
        const params = new URLSearchParams(location.search);
        const type = params.get('type');
        let redirectPath = '/dashboard';
        
        if (type === 'recovery') {
          redirectPath = '/update-password';
        } else if (type === 'invite') {
          // Send to dashboard instead of register to let WelcomeGuide show
          // This ensures the force_password_change flag will be detected
          redirectPath = '/dashboard';
        } else if (user.user_metadata?.role === 'rentee') {
          redirectPath = '/rentee';
        }
        
        setStatus(`Authentication complete. Redirecting to ${redirectPath}...`);
        console.log(`[DEBUG] Redirecting to ${redirectPath}`);
        
        // Use setTimeout to allow the status to be displayed before redirect
        setTimeout(() => {
          simpleRedirect(redirectPath);
        }, 1500);
      } catch (error) {
        console.error('[DEBUG] Error in handleUserAuthenticated:', error);
        setError(`Error processing authenticated user: ${error.message}`);
        setDebugInfo(prev => ({ ...prev, userHandlingError: error.message }));
      }
    };
    
    processAuth();
  }, [location, navigate]);
  
  return (
    <div style={{ 
      padding: '20px', 
      fontFamily: 'Arial, sans-serif',
      maxWidth: '800px',
      margin: '40px auto',
      backgroundColor: '#f5f5f5',
      borderRadius: '8px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      <h1 style={{ color: '#333', marginBottom: '16px' }}>Authentication Processing</h1>
      
      <div style={{ padding: '16px', backgroundColor: '#fff', borderRadius: '8px', marginBottom: '16px' }}>
        <p style={{ fontWeight: 'bold' }}>Status:</p>
        <p style={{ color: '#0066cc' }}>{status}</p>
      </div>
      
      {error && (
        <div style={{ 
          padding: '16px', 
          backgroundColor: '#ffeeee', 
          color: '#cc0000',
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          <p style={{ fontWeight: 'bold' }}>Error:</p>
          <p>{error}</p>
          <div style={{ marginTop: '16px' }}>
            <p style={{ fontWeight: 'bold' }}>Possible Solutions:</p>
            <ul style={{ marginLeft: '20px' }}>
              <li>Try clearing browser cache and cookies</li>
              <li>Ensure you're using the latest version of your browser</li>
              <li>If this persists, contact support</li>
            </ul>
          </div>
        </div>
      )}
      
      <div style={{ 
        padding: '16px', 
        backgroundColor: '#eee', 
        borderRadius: '8px',
        overflow: 'auto',
        maxHeight: '300px',
        fontSize: '12px',
        fontFamily: 'monospace'
      }}>
        <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>Debug Information:</p>
        <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
      </div>
      
      <div style={{ 
        marginTop: '20px', 
        display: 'flex',
        justifyContent: 'center',
        gap: '16px'
      }}>
        <a 
          href="/login"
          style={{
            display: 'inline-block',
            padding: '8px 16px',
            backgroundColor: '#0066cc',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px'
          }}
        >
          Return to Login
        </a>
        
        <a 
          href="/dashboard"
          style={{
            display: 'inline-block',
            padding: '8px 16px',
            backgroundColor: '#4CAF50',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px'
          }}
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  );
};

export default AuthCallback;