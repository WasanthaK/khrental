import React, { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

/**
 * PublicRoute component that redirects authenticated users to their appropriate dashboard
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to render if not authenticated
 * @returns {React.ReactNode} - The public component or redirect
 */
const PublicRoute = ({ children }) => {
  const { loading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [showContent, setShowContent] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  
  // Show content after 2 seconds if still loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowContent(true);
    }, 2000);
    
    return () => clearTimeout(timer);
  }, []);
  
  // Track when user profile is loaded or when we're sure it's an authenticated user without a profile
  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      // Check if profile data is present
      if (user.profileId || user.role !== 'authenticated') {
        console.log('[PublicRoute] User profile loaded:', { 
          role: user.role, 
          profileId: user.profileId, 
          profileType: user.profileType 
        });
        setProfileLoaded(true);
      } else {
        // If the user has the 'authenticated' role but no profile, we can still proceed
        // This is a newly registered user who needs to link their account
        console.log('[PublicRoute] User authenticated but no profile found, treating as new user');
        setProfileLoaded(true);
      }
    }
  }, [loading, isAuthenticated, user]);
  
  // Handle role-based redirects when authenticated and profile is loaded
  useEffect(() => {
    if (profileLoaded && user) {
      console.log('[PublicRoute] User profile loaded, redirecting based on role:', user.role);
      
      // Redirect based on role
      if (user.role === 'authenticated') {
        // Redirect to admin tools to complete setup
        console.log('[PublicRoute] Redirecting authenticated user to admin tools');
        navigate('/dashboard/admin-tools', { replace: true });
      } else if (user.role === 'admin' || user.role === 'staff' || 
                user.role === 'maintenance_staff' || user.role === 'finance_staff' ||
                user.role === 'manager' || user.role === 'maintenance' || 
                user.role === 'supervisor') {
        console.log('[PublicRoute] Redirecting staff to dashboard');
        navigate('/dashboard', { replace: true });
      } else if (user.role === 'rentee') {
        console.log('[PublicRoute] Redirecting rentee to rentee portal');
        navigate('/rentee', { replace: true });
      } else {
        console.log('[PublicRoute] Unknown role, redirecting to dashboard:', user.role);
        navigate('/dashboard', { replace: true });
      }
    }
  }, [profileLoaded, user, navigate]);
  
  // If loading but not past timeout, show loading indicator
  if (loading && !showContent) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }
  
  // If authenticated, show loading while redirect happens
  if (isAuthenticated) {
    return <div className="flex justify-center items-center h-screen">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600">Preparing your dashboard...</p>
      </div>
    </div>;
  }
  
  // Otherwise show the public content
  return children;
};

export default PublicRoute; 