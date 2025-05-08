import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../utils/permissions.jsx';

// Add a debug flag at the top of the file
const ROUTE_DEBUG = true; // Temporarily enable debugging

// Helper function for conditional logging
const logRoute = (message, data) => {
  if (ROUTE_DEBUG && import.meta.env.DEV) {
    console.log(`[ProtectedRoute] ${message}`, data || '');
  }
};

/**
 * Helper function to normalize role comparison
 * Handles comparing both string roles and ROLES object references
 * 
 * @param {string} userRole - The user's role (e.g., "admin")
 * @param {string|Object} requiredRole - The required role (string or ROLES object)
 * @returns {boolean} - Whether the user role matches the required role
 */
const roleMatches = (userRole, requiredRole) => {
  // Skip if no user role
  if (!userRole) return false;
  
  // If the required role is an object (e.g., ROLES.ADMIN), extract its key
  if (typeof requiredRole === 'object' && requiredRole !== null) {
    // Find which ROLES key matches this object
    const roleKey = Object.keys(ROLES).find(key => ROLES[key] === requiredRole);
    if (roleKey) {
      return userRole.toLowerCase() === roleKey.toLowerCase();
    }
    return false;
  }
  
  // For string comparison, normalize case
  return userRole.toLowerCase() === requiredRole.toLowerCase();
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
  if (user?.role?.toLowerCase() === 'admin') {
    logRoute('Admin user always allowed');
    return children;
  }
  
  // Check roles if specified
  if (requiredRoles.length > 0) {
    // FIX: Enhanced role checking that handles both string and object role references
    const hasRequiredRole = requiredRoles.some(requiredRole => 
      roleMatches(user?.role, requiredRole)
    );
    
    if (!hasRequiredRole) {
      logRoute('User role not allowed:', {
        userRole: user?.role, 
        requiredRoles: requiredRoles.map(r => typeof r === 'object' ? 'Object' : r)
      });
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