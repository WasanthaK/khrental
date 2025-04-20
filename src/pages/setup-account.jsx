import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { verifyInvitationToken, completeUserSetup } from '../services/invitation';
import { decodeToken } from '../utils/tokenUtils';

const SetupAccount = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tokenData, setTokenData] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Extract token from URL query parameters
    const params = new URLSearchParams(location.search);
    const tokenFromUrl = params.get('token');
    
    if (!tokenFromUrl) {
      setError('No invitation token provided');
      setIsLoading(false);
      return;
    }
    
    setToken(tokenFromUrl);
    
    // For debugging - decode token without verification
    try {
      const decoded = decodeToken(tokenFromUrl);
      console.log('Token payload (not verified):', decoded);
    } catch (err) {
      console.error('Error decoding token:', err);
    }
    
    // Verify the token
    const verifyToken = async () => {
      try {
        setIsLoading(true);
        const result = await verifyInvitationToken(tokenFromUrl);
        
        if (result.success) {
          setTokenData(result.data);
          setName(result.data.name || '');
          setEmail(result.data.email || '');
          setError(null);
        } else {
          setError(result.error || 'Invalid invitation token');
        }
      } catch (err) {
        setError('Error verifying invitation: ' + err.message);
        console.error('Error verifying token:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    verifyToken();
  }, [location.search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate input
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await completeUserSetup(token, password);
      
      if (result.success) {
        setSuccess(true);
        // Redirect to login page after a short delay
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      } else {
        setError(result.error || 'Failed to complete setup');
      }
    } catch (err) {
      setError('Error setting up account: ' + err.message);
      console.error('Setup error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mt-5 d-flex justify-content-center">
        <div className="card p-4 shadow" style={{ maxWidth: '500px' }}>
          <div className="text-center">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="mt-3">Verifying invitation...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mt-5 d-flex justify-content-center">
        <div className="card p-4 shadow" style={{ maxWidth: '500px' }}>
          <div className="text-center">
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
            <button 
              className="btn btn-primary"
              onClick={() => navigate('/login')}
            >
              Return to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="container mt-5 d-flex justify-content-center">
        <div className="card p-4 shadow" style={{ maxWidth: '500px' }}>
          <div className="text-center">
            <div className="alert alert-success" role="alert">
              Account setup successful! You will be redirected to login shortly.
            </div>
            <button 
              className="btn btn-primary"
              onClick={() => navigate('/login')}
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-5 d-flex justify-content-center">
      <div className="card p-4 shadow" style={{ maxWidth: '500px' }}>
        <h2 className="text-center mb-4">Complete Your Account Setup</h2>
        
        {tokenData && (
          <div className="alert alert-info mb-4">
            <p className="mb-1"><strong>Welcome, {tokenData.name}!</strong></p>
            <p className="mb-0">Please set your password to complete your account setup.</p>
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label htmlFor="email" className="form-label">Email</label>
            <input
              type="email"
              className="form-control"
              id="email"
              value={email}
              disabled
            />
            <div className="form-text">Your email address cannot be changed.</div>
          </div>
          
          <div className="mb-3">
            <label htmlFor="password" className="form-label">Password</label>
            <input
              type="password"
              className="form-control"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength="8"
            />
            <div className="form-text">Password must be at least 8 characters long.</div>
          </div>
          
          <div className="mb-3">
            <label htmlFor="confirmPassword" className="form-label">Confirm Password</label>
            <input
              type="password"
              className="form-control"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          
          <div className="d-grid gap-2">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Setting up account...
                </>
              ) : 'Complete Setup'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SetupAccount; 