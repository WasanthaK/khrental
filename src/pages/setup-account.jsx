import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Legacy route retained so old bookmarks and email templates fail safely through
 * the canonical Stage 3A invitation validation flow instead of maintaining a
 * second account-claim implementation.
 */
const SetupAccount = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    navigate(`/accept-invite${location.search || ''}`, { replace: true });
  }, [location.search, navigate]);

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <div className="text-gray-600">Redirecting to secure account setup...</div>
    </div>
  );
};

export default SetupAccount;
