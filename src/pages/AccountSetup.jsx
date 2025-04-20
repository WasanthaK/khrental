import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

const AccountSetup = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  const location = useLocation();
  const navigate = useNavigate();
  
  // Extract token and validate on mount
  useEffect(() => {
    const validateAndGetSession = async () => {
      try {
        // Check if we have a hash in the URL (Supabase Auth redirect)
        if (location.hash || location.search.includes('access_token')) {
          // This will be handled by the Supabase client automatically
          console.log('Auth redirect detected, letting Supabase handle it');
          
          // Check for active session
          const { data, error } = await supabase.auth.getSession();
          
          if (error) {
            throw error;
          }
          
          if (data?.session) {
            // We have a valid session
            setEmail(data.session.user.email || '');
            setValidating(false);
            setLoading(false);
            setSuccess(true);
            
            // Redirect to dashboard after a short delay
            setTimeout(() => {
              navigate('/dashboard');
            }, 3000);
            return;
          }
        }
        
        // Check if this is a password reset request
        const searchParams = new URLSearchParams(location.search);
        const urlType = searchParams.get('type');
        const urlEmail = searchParams.get('email');
        
        if (urlType === 'recovery' || urlType === 'passwordRecovery') {
          // This is a password reset flow
          if (urlEmail) {
            setEmail(urlEmail);
          }
          
          setValidating(false);
          setLoading(false);
          return;
        }
        
        // If no special parameters, check for an active session
        const { data: sessionData } = await supabase.auth.getSession();
        
        if (sessionData?.session) {
          // Already logged in, redirect to dashboard
          navigate('/dashboard');
          return;
        }
        
        // No session, but also no special parameters - show the login button
        setValidating(false);
        setLoading(false);
        setError('No valid setup parameters found. Please use the invitation link sent to your email.');
      } catch (err) {
        console.error('Error validating session:', err);
        setError('An unexpected error occurred: ' + err.message);
        setValidating(false);
        setLoading(false);
      }
    };
    
    validateAndGetSession();
  }, [location.search, location.hash, navigate]);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Basic validation
    if (!email) {
      setError('Email is required.');
      return;
    }
    
    if (!password) {
      setError('Password is required.');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Use Supabase Auth to update the password
      const { error } = await supabase.auth.updateUser({
        password: password
      });
      
      if (error) {
        throw error;
      }
      
      // Show success message then redirect to login
      setSuccess(true);
      
      // Redirect after 3 seconds
      setTimeout(async () => {
        // If we have a session, go to dashboard, otherwise to login
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          navigate('/dashboard');
        } else {
          navigate('/login?email=' + encodeURIComponent(email));
        }
      }, 3000);
    } catch (err) {
      console.error('Error updating password:', err);
      setError(err.message || 'An unexpected error occurred.');
      
      // If the error indicates no session, use the signUp flow as fallback
      if (err.message.includes('not logged in') || err.message.includes('No session')) {
        try {
          // Try signup as fallback
          const { error: signUpError } = await supabase.auth.signUp({
            email,
            password,
          });
          
          if (signUpError) {
            throw signUpError;
          }
          
          setSuccess(true);
          setTimeout(() => {
            navigate('/login?email=' + encodeURIComponent(email));
          }, 3000);
        } catch (signUpErr) {
          setError(signUpErr.message || 'Failed to create account.');
        }
      }
    } finally {
      setLoading(false);
    }
  };
  
  // Show loading state
  if (validating) {
    return (
      <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-md">
        <div className="flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <h4 className="text-xl font-semibold mb-2">Validating session...</h4>
          <p className="text-gray-600">Please wait while we verify your session.</p>
        </div>
      </div>
    );
  }
  
  // Show error if invitation is invalid
  if (error && !email) {
    return (
      <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-md">
        <div className="p-4 mb-4 bg-red-100 border-l-4 border-red-500 text-red-700">
          <h4 className="text-lg font-semibold mb-2">Invalid Session</h4>
          <p>{error}</p>
        </div>
        <div className="text-center mt-6">
          <button 
            onClick={() => navigate('/login')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }
  
  // Show success message
  if (success) {
    return (
      <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-md text-center">
        <div className="mb-4 text-green-500">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h4 className="text-xl font-semibold mb-2">Account Updated Successfully!</h4>
        <p className="text-gray-600">Redirecting you to the dashboard...</p>
      </div>
    );
  }
  
  // Show the account setup form
  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-md">
      <h3 className="text-xl font-semibold mb-6 text-center">Complete Your Account Setup</h3>
      
      {error && (
        <div className="p-4 mb-4 bg-red-100 border-l-4 border-red-500 text-red-700">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-medium mb-2">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            readOnly={!!email}
            disabled={!!email}
            className={`w-full px-3 py-2 border border-gray-300 rounded-md ${
              email ? 'bg-gray-100 text-gray-500' : 'focus:outline-none focus:ring-blue-500 focus:border-blue-500'
            }`}
            placeholder="Enter your email"
          />
          {email && (
            <p className="mt-1 text-sm text-gray-500">This is the email your invitation was sent to.</p>
          )}
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-medium mb-2">Create Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            placeholder="At least 8 characters"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        
        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-medium mb-2">Confirm Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            placeholder="Confirm your password"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className={`w-full py-2 px-4 rounded-md text-white font-medium ${
            loading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Updating Account...
            </span>
          ) : (
            'Update Account'
          )}
        </button>
      </form>
    </div>
  );
};

export default AccountSetup; 