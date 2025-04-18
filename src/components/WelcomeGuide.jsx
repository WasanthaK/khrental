import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const WelcomeGuide = () => {
  const { user, setNewPassword } = useAuth();
  const [step, setStep] = useState(1);
  const [isOpen, setIsOpen] = useState(false);
  const [newPassword, setNewPasswordState] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Check if this is a first-time login that needs to change password
  useEffect(() => {
    // Check for invitation flow (from Supabase email)
    const params = new URLSearchParams(location.search);
    const inviteToken = params.get('token');
    
    // If this is an invite flow, automatically open the welcome guide
    if (inviteToken) {
      setIsOpen(true);
      return;
    }
    
    // Otherwise check for force_password_change in user metadata
    if (user) {
      console.log('Checking user metadata for password change flag:', user.user_metadata);
      
      // Check both possible metadata locations
      const needsPasswordChange = 
        (user.user_metadata?.force_password_change) || 
        (user.app_metadata?.force_password_change);
      
      if (needsPasswordChange) {
        console.log('User needs to change password - showing welcome guide');
        setIsOpen(true);
      }
    }
  }, [user, location]);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const { success, error } = await setNewPassword(newPassword);
      
      if (error) {
        throw new Error(error);
      }
      
      if (success) {
        // Update the user metadata to remove force_password_change flag
        const { error: updateError } = await supabase.auth.updateUser({
          data: { force_password_change: false }
        });
        
        if (updateError) {
          console.error('Error updating user metadata:', updateError);
        }
        
        // Move to next step
        setStep(2);
      }
    } catch (err) {
      console.error('Error changing password:', err);
      setError(err.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const skipOnboarding = () => {
    setIsOpen(false);
  };

  const renderStep = () => {
    switch(step) {
      case 1:
        return (
          <div className="p-6">
            <h3 className="text-xl font-bold mb-4">Change Your Password</h3>
            <p className="mb-4">For security reasons, you need to change your temporary password.</p>
            
            {error && (
              <div className="mb-4 p-2 bg-red-100 text-red-700 rounded">
                {error}
              </div>
            )}
            
            <form onSubmit={handlePasswordChange}>
              <div className="mb-4">
                <label className="block mb-1 text-sm font-medium">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPasswordState(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  required
                />
              </div>
              
              <div className="mb-6">
                <label className="block mb-1 text-sm font-medium">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  required
                />
              </div>
              
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
        );
        
      case 2:
        return (
          <div className="p-6">
            <h3 className="text-xl font-bold mb-4">Welcome to KH Rentals!</h3>
            <p className="mb-4">Your password has been updated successfully.</p>
            
            <h4 className="font-medium mt-6 mb-2">Here's what you can do next:</h4>
            <ul className="list-disc pl-5 mb-6">
              <li className="mb-2">Complete your profile information</li>
              <li className="mb-2">Explore the dashboard</li>
              <li className="mb-2">Check your notifications</li>
            </ul>
            
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/dashboard'); // Redirect to dashboard after setup
              }}
              className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
            >
              Get Started
            </button>
          </div>
        );
        
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full">
        <div className="bg-blue-600 text-white py-3 px-4 rounded-t-lg flex justify-between items-center">
          <h2 className="text-lg font-bold">Welcome to KH Rentals</h2>
          {step > 1 && (
            <button 
              onClick={skipOnboarding}
              className="text-white text-sm hover:underline"
            >
              Skip
            </button>
          )}
        </div>
        
        {renderStep()}
      </div>
    </div>
  );
};

export default WelcomeGuide; 