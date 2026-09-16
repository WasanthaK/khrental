import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { PORTAL_TYPES, getPortalType } from '../../utils/accessModel.js';
import {
  getEffectivePortalType,
  hasAllPermissions,
  hasAnyPermission
} from '../../utils/accessPolicy.js';

const ROUTE_DEBUG = false;

const logRoute = (message, data) => {
  if (ROUTE_DEBUG && import.meta.env.DEV) {
    console.log(`[ProtectedRoute] ${message}`, data || '');
  }
};

const normalizeLegacyRequiredRoles = (requiredRoles = []) => (
  requiredRoles
    .map((role) => getPortalType({ user: { role } }))
    .filter((portalType) => portalType !== PORTAL_TYPES.UNLINKED)
);

/**
 * Browser route guard backed by the same canonical access policy used by the
 * server permission engine. Server authorization remains authoritative; this
 * guard prevents users from being offered or entering browser surfaces they do
 * not have a corresponding capability for.
 *
 * `requiredRoles` remains as a temporary compatibility input. New routes should
 * use `requiredPortalTypes` and/or `requiredPermissions`.
 */
const ProtectedRoute = ({
  children,
  requiredPermissions = [],
  requiredPortalTypes = [],
  requiredRoles = [],
  requireAll = false,
  allowAuthenticated = false
}) => {
  const { user, membership, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-gray-600">Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    logRoute('Unauthenticated request redirected to login');
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: {
            pathname: location.pathname,
            search: location.search,
            hash: location.hash
          }
        }}
      />
    );
  }

  const subject = { user, membership: membership || user.membership || null };
  const portalType = getEffectivePortalType(subject);

  if (portalType === PORTAL_TYPES.UNLINKED) {
    const isBasicAuthenticatedUser = String(user.role || '').trim().toLowerCase() === 'authenticated';
    if (allowAuthenticated && isBasicAuthenticatedUser) {
      return children;
    }

    logRoute('Unlinked account denied', { role: user.role });
    return <Navigate to="/unauthorized" replace />;
  }

  const legacyPortalTypes = normalizeLegacyRequiredRoles(requiredRoles);
  const allowedPortalTypes = [
    ...new Set([
      ...(Array.isArray(requiredPortalTypes) ? requiredPortalTypes : []),
      ...legacyPortalTypes
    ])
  ];

  if (allowedPortalTypes.length > 0 && !allowedPortalTypes.includes(portalType)) {
    logRoute('Portal type denied', { portalType, allowedPortalTypes });
    return <Navigate to="/unauthorized" replace />;
  }

  if (requiredPermissions.length > 0) {
    const allowed = requireAll
      ? hasAllPermissions(subject, requiredPermissions)
      : hasAnyPermission(subject, requiredPermissions);

    if (!allowed) {
      logRoute('Permission denied', { portalType, requiredPermissions, requireAll });
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
