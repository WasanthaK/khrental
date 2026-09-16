import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

/**
 * Legacy compatibility route.
 *
 * Password recovery is handled by /reset-password using a single-use reset token.
 * The old page attempted to call the authenticated /auth/update-user endpoint
 * while being mounted as a public route, which could only result in a 401 for
 * unauthenticated recovery users.
 */
const UpdatePassword = () => {
  const location = useLocation();
  const search = location.search || '';

  return <Navigate to={`/reset-password${search}`} replace />;
};

export default UpdatePassword;
