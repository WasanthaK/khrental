import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

/**
 * Legacy compatibility route.
 *
 * Stage 3A uses two explicit unauthenticated credential flows:
 *   - /reset-password?token=... for password recovery
 *   - /accept-invite?token=... for first-time account setup
 *
 * The former AccountSetup page attempted to call the authenticated
 * /api/platform/auth/update-user endpoint from a public route and also trusted
 * legacy email/type hints from the URL. It is intentionally retired here.
 */
const AccountSetup = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search || '');
  const token = String(params.get('token') || '').trim();
  const type = String(params.get('type') || '').trim().toLowerCase();

  const isRecovery = type === 'recovery'
    || type === 'passwordrecovery'
    || type === 'password_reset'
    || type === 'password-reset';

  const isInvitation = type === 'invite'
    || type === 'invitation'
    || type === 'setup'
    || type === 'account-setup';

  if (isRecovery) {
    const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';
    return <Navigate to={`/reset-password${tokenQuery}`} replace />;
  }

  if (token || isInvitation) {
    const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';
    return <Navigate to={`/accept-invite${tokenQuery}`} replace />;
  }

  return <Navigate to="/login" replace />;
};

export default AccountSetup;
