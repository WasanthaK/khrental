import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { toast } from 'react-hot-toast';

const AcceptInvite = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userData, setUserData] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Parse the URL parameters
    const params = new URLSearchParams(location.search);
    const token = params.get('token') || params.get('code'); // For admin invites - check both token and code
    const type = params.get('type'); // For checking 'invite' or 'recovery'
    const userId = params.get('user_id'); // For magic link invites
    const userName = params.get('name'); // For magic link invites
    const email = params.get('email'); // For magic link invites
    
    // If we have userId and email from magic link params
    if (userId && email) {
      console.log('Detected magic link invitation with userId:', userId);
      // This means we're coming from a magic link OTP
      try {
        setUserData({
          user_metadata: {
            app_user_id: userId,
            name: userName || 'User'
          },
          email: email
        });
        setEmail(email);
        setLoading(false);
      } catch (err) {
        console.error('Error processing magic link params:', err);
        setError('Invalid invitation parameters. Please request a new invitation.');
        setLoading(false);
      }
      return;
    }
    
    // Traditional token-based approach
    if (!token) {
      setError('No invitation token provided');
      setLoading(false);
      return;
    }
    
    // Validate the token
    const validateToken = async () => {
      try {
        // Log what type of token we're using
        console.log('Using token from URL parameter:', token);
        
        // First, verify if we can use the token to get a session
        const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
          token_hash: token,
          type: 'recovery'
        });
        
        if (sessionError) {
          console.error('Error verifying token:', sessionError);
          // Fall back to getting the current user
          const { data, error } = await supabase.auth.getUser();
          
          if (error || !data.user) {
            throw new Error('Invalid token or session expired');
          }
          
          console.log('User data from token:', data.user);
          setUserData(data.user);
          
          // Extract email from the token
          if (data.user.email) {
            setEmail(data.user.email);
          }
        } else {
          console.log('Session established with token:', sessionData);
          
          // If we got a session, check the user data
          const { data: userData, error: userError } = await supabase.auth.getUser();
          
          if (userError || !userData.user) {
            throw new Error('Could not get user data after verifying token');
          }
          
          console.log('User data from verified session:', userData.user);
          setUserData(userData.user);
          
          if (userData.user.email) {
            setEmail(userData.user.email);
          }
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Error validating token:', err);
        setError('Invalid or expired invitation token. Please request a new invitation.');
        setLoading(false);
      }
    };
    
    validateToken();
  }, [location.search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email) {
      setError('Email is required');
      return;
    }
    
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    try {
      setLoading(true);
      
      // Check if we're using magic link or traditional approach
      const params = new URLSearchParams(location.search);
      const userId = params.get('user_id'); // For magic link invites
      
      if (userId) {
        // For magic link approach, we need to sign up the user
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              app_user_id: userId,
              name: userData?.user_metadata?.name || 'User',
              role: 'rentee',
              user_type: 'rentee'
            }
          }
        });
        
        if (error) {
          throw error;
        }
        
        // Update the app_users table
        console.log(`Attempting to update app_user with ID: ${userId} and auth_id: ${data.user.id}`);
        
        // First get the current user data to check the fields
        const { data: currentUserData, error: getUserError } = await supabase
          .from('app_users')
          .select('*')
          .eq('id', userId)
          .single();
          
        if (getUserError) {
          console.error('Error getting user data:', getUserError);
          // Continue with the direct update approach
        } else {
          console.log('Current user data:', currentUserData);
        }
        
        // Create update object with all required fields
        const updateData = {
          auth_id: data.user.id, // Primary field from schema
          invited: true,
          updatedat: new Date().toISOString()
        };
        
        console.log('Updating app_user with:', updateData);
        
        // Try updating with eq() first
        const { data: updateResult, error: updateError } = await supabase
          .from('app_users')
          .update(updateData)
          .eq('id', userId)
          .select();
          
        if (updateError) {
          console.error('Regular update failed:', updateError);
          console.log('Trying alternative update approach with match()...');
          
          // Try an alternative approach with match
          const { data: altUpdateResult, error: altUpdateError } = await supabase
            .from('app_users')
            .update(updateData)
            .match({ id: userId })
            .select();
            
          if (altUpdateError) {
            console.error('Alternative update also failed:', altUpdateError);
            toast.error('Account created but user record update failed. Please contact support.');
          } else {
            console.log('Alternative update succeeded:', altUpdateResult);
          }
        } else {
          console.log('Update succeeded:', updateResult);
        }
        
        setSuccess(true);
        toast.success('Account setup completed successfully!');
        setTimeout(() => navigate('/dashboard'), 2000);
        return;
      } else {
        // Traditional token approach - update the user's password
        const token = params.get('token') || params.get('code');
        
        console.log('Attempting to update password using token:', token);
        
        // First verify/login with the token
        const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
          token_hash: token,
          type: 'recovery',
          options: {
            redirectTo: window.location.origin + '/dashboard'
          }
        });
        
        if (sessionError) {
          console.error('Error verifying token for password update:', sessionError);
          throw new Error('Invalid or expired token. Please request a new invitation.');
        }
        
        console.log('Session established, now updating password');
        
        // Now update the password
        const { error } = await supabase.auth.updateUser({
          password: password
        });
        
        if (error) {
          throw error;
        }
        
        // If user data contains app_user_id, update the app_users table
        if (userData?.user_metadata?.app_user_id) {
          const appUserId = userData.user_metadata.app_user_id;
          
          console.log(`Attempting to update app_user with ID: ${appUserId} and auth_id: ${userData.id}`);
          
          // First get the current user data to check the fields
          const { data: currentUserData, error: getUserError } = await supabase
            .from('app_users')
            .select('*')
            .eq('id', appUserId)
            .single();
            
          if (getUserError) {
            console.error('Error getting user data:', getUserError);
            // Continue with the direct update approach
          } else {
            console.log('Current user data:', currentUserData);
          }
          
          // Create update object with all required fields
          const updateData = {
            auth_id: userData.id, // Primary field from schema
            invited: true,
            updatedat: new Date().toISOString()
          };
          
          console.log('Updating app_user with:', updateData);
          
          // Try updating with eq() first
          const { data: updateResult, error: updateError } = await supabase
            .from('app_users')
            .update(updateData)
            .eq('id', appUserId)
            .select();
            
          if (updateError) {
            console.error('Regular update failed:', updateError);
            console.log('Trying alternative update approach with match()...');
            
            // Try an alternative approach with match
            const { data: altUpdateResult, error: altUpdateError } = await supabase
              .from('app_users')
              .update(updateData)
              .match({ id: appUserId })
              .select();
              
            if (altUpdateError) {
              console.error('Alternative update also failed:', altUpdateError);
              toast.error('Account created but user record update failed. Please contact support.');
            } else {
              console.log('Alternative update succeeded:', altUpdateResult);
            }
          } else {
            console.log('Update succeeded:', updateResult);
          }
          
          setSuccess(true);
          toast.success('Account setup completed successfully!');
          setTimeout(() => navigate('/dashboard'), 2000);
          return;
        }
      }
      
      setSuccess(true);
      toast.success('Account setup completed successfully!');
      
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } catch (err) {
      console.error('Error completing setup:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">Verifying your invitation...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <div className="text-center">
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
              <strong className="font-bold">Error: </strong>
              <span className="block sm:inline">{error}</span>
            </div>
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

  if (success) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <div className="text-center">
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-4" role="alert">
              <strong className="font-bold">Success! </strong>
              <span className="block sm:inline">Your account has been set up successfully.</span>
            </div>
            <p className="mb-4 text-gray-600">You will be redirected to the dashboard shortly...</p>
            <button 
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
              onClick={() => navigate('/dashboard')}
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Complete Your Account Setup</h2>
        
        {userData && userData.user_metadata && (
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
            <p className="font-medium">Welcome{userData.user_metadata.name ? `, ${userData.user_metadata.name}` : ''}!</p>
            <p className="text-sm text-gray-600">Please create a password to complete your account setup.</p>
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">
              Email
            </label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline bg-gray-100"
              id="email"
              type="email"
              placeholder="Email"
              value={email}
              readOnly
              disabled
            />
            <p className="text-sm text-gray-500 mt-1">Your email address cannot be changed.</p>
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
              Password
            </label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              id="password"
              type="password"
              placeholder="********"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength="8"
            />
            <p className="text-sm text-gray-500 mt-1">Must be at least 8 characters.</p>
          </div>
          
          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="confirmPassword">
              Confirm Password
            </label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              id="confirmPassword"
              type="password"
              placeholder="********"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          
          <div className="flex items-center justify-between">
            <button
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Setting up account...
                </span>
              ) : 'Complete Setup'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AcceptInvite; 