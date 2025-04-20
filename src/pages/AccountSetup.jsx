import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { verifyInvitationToken, completeUserSetup } from '../services/invitation';

const AccountSetup = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [token, setToken] = useState('');
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  const location = useLocation();
  const navigate = useNavigate();
  
  // Extract token and validate on mount
  useEffect(() => {
    const validateInvitation = async () => {
      try {
        // Get token from URL
        const queryParams = new URLSearchParams(location.search);
        const urlToken = queryParams.get('token');
        
        if (!urlToken) {
          setError('Invalid invitation link. No token provided.');
          setValidating(false);
          return;
        }
        
        setToken(urlToken);
        
        // Verify the token
        const { success, data, error } = await verifyInvitationToken(urlToken);
        
        if (!success) {
          setError(error || 'Invalid or expired invitation link.');
          setValidating(false);
          return;
        }
        
        // Token is valid, set email and userId
        setEmail(data.email);
        setUserId(data.userId);
        setValidating(false);
        setLoading(false);
      } catch (err) {
        console.error('Error validating invitation:', err);
        setError('An unexpected error occurred while validating your invitation.');
        setValidating(false);
      }
    };
    
    validateInvitation();
  }, [location.search]);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Basic validation
    if (!email || !password) {
      setError('Email and password are required.');
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
      // Complete user setup with password
      const result = await completeUserSetup(token, userId, email, password);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to create account.');
      }
      
      // Show success message then redirect to login
      setSuccess(true);
      
      // Redirect after 3 seconds
      setTimeout(() => {
        navigate('/login?email=' + encodeURIComponent(email));
      }, 3000);
    } catch (err) {
      console.error('Error creating account:', err);
      setError(err.message || 'An unexpected error occurred.');
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
          <h4 className="text-xl font-semibold mb-2">Validating invitation...</h4>
          <p className="text-gray-600">Please wait while we verify your invitation.</p>
        </div>
      </div>
    );
  }
  
  // Show error if invitation is invalid
  if (error && !email) {
    return (
      <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-md">
        <div className="p-4 mb-4 bg-red-100 border-l-4 border-red-500 text-red-700">
          <h4 className="text-lg font-semibold mb-2">Invalid Invitation</h4>
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
        <h4 className="text-xl font-semibold mb-2">Account Created Successfully!</h4>
        <p className="text-gray-600">Redirecting you to the login page...</p>
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
            readOnly
            disabled
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500"
          />
          <p className="mt-1 text-sm text-gray-500">This is the email your invitation was sent to.</p>
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
              Creating Account...
            </span>
          ) : (
            'Create Account'
          )}
        </button>
      </form>
    </div>
  );
};

export default AccountSetup; 