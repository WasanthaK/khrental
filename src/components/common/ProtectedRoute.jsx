import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

// Add a debug flag at the top of the file
const ROUTE_DEBUG = false;

// Helper function for conditional logging
const logRoute = (message, data) => {
  if (ROUTE_DEBUG && import.meta.env.DEV) {
    console.log(`[ProtectedRoute] ${message}`, data || '');
  }
};

/**
 * ProtectedRoute component that checks if the user has the required permissions or roles
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to render if authorized
 * @param {string[]} [props.requiredPermissions] - Permissions required to access the route
 * @param {string[]} [props.requiredRoles] - Roles required to access the route
 * @param {boolean} [props.requireAll=false] - If true, user must have all permissions; if false, any permission is sufficient
 * @param {boolean} [props.allowAuthenticated=false] - If true, 'authenticated' role will also be allowed
 * @returns {React.ReactNode} - The protected component or redirect
 */
const ProtectedRoute = ({ 
  children, 
  requiredPermissions = [], 
  requiredRoles = [], 
  requireAll = false,
  allowAuthenticated = false
}) => {
  const { user, loading, isAuthenticated, hasAnyPermission, hasAllPermissions } = useAuth();
  const [profileLoaded, setProfileLoaded] = useState(false);
  
  // Track when user profile is loaded
  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      // Check if profile data is present or if user has a role other than 'authenticated'
      if (user.profileId || user.role !== 'authenticated') {
        logRoute('User profile loaded', { 
          role: user.role, 
          profileId: user.profileId, 
          profileType: user.profileType 
        });
        setProfileLoaded(true);
      } else {
        // If the user has the 'authenticated' role but no profile, we can still proceed
        // This is a newly registered user who needs to link their account
        logRoute('User authenticated but no profile found, treating as new user');
        setProfileLoaded(true);
      }
    }
  }, [loading, isAuthenticated, user]);
  
  // Show loading indicator while checking auth or loading profile
  if (loading || (isAuthenticated && !profileLoaded)) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your profile...</p>
        </div>
      </div>
    );
  }
  
  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    logRoute('User not authenticated, redirecting to login');
    return <Navigate to="/login" replace />;
  }
  
  logRoute('Checking access for user:', { 
    role: user?.role, 
    requiredRoles, 
    requiredPermissions 
  });
  
  // Special case: authenticated role (newly registered user)
  if (user?.role === 'authenticated') {
    // If this route allows authenticated users, let them through
    if (allowAuthenticated) {
      logRoute('Authenticated user allowed for special route');
      return children;
    }
    
    // Otherwise, redirect to the dashboard instead of admin tools
    logRoute('Authenticated user redirected to dashboard');
    return <Navigate to="/dashboard" replace />;
  }
  
  // Always allow admin users
  if (user?.role === 'admin') {
    logRoute('Admin user always allowed');
    return children;
  }
  
  // Check roles if specified
  if (requiredRoles.length > 0) {
    const hasRequiredRole = requiredRoles.includes(user?.role);
    if (!hasRequiredRole) {
      logRoute('User role not allowed:', user?.role);
      return <Navigate to="/unauthorized" replace />;
    }
  }
  
  // Check permissions if specified
  if (requiredPermissions.length > 0) {
    const hasRequiredPermissions = requireAll 
      ? hasAllPermissions(requiredPermissions)
      : hasAnyPermission(requiredPermissions);
    
    if (!hasRequiredPermissions) {
      logRoute('User lacks required permissions');
      return <Navigate to="/unauthorized" replace />;
    }
  }
  
  // User has passed all checks, allow access
  logRoute('Access granted');
  return children;
};

export default ProtectedRoute; 