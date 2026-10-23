// B04 S3c2c: route-level read-only seeker proof. Disabled by default.
// Tenant and billing APIs remain protected by their existing server guards.
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { isPublicSeekerLandingEnabled } from '../../utils/env';
import { isVerifiedTenantlessSeeker } from '../../utils/seekerLandingPolicy';
import { fetchVerifiedSeekerBrowserContext } from '../../services/seekerContextClient';
import { getPlatformClient } from '../../services/platformClient';
import SeekerHome from '../../pages/SeekerHome';

const enabled = isPublicSeekerLandingEnabled();

export const VerifiedSeekerBoundary = ({ redirectOnly = false }) => {
  const { user, membership, memberships, loading, isAuthenticated } = useAuth();
  const [status, setStatus] = useState({ key: null, eligible: false });
  const key = String(user?.id || '') + ':' + String(user?.profileId || '');

  const profile = {
    user: user && {
      id: user.profileId,
      role: user.role,
      user_type: user.userType || user.profileType,
      tenant_id: user.tenant_id,
      tenantId: user.tenantId,
      activeTenantId: user.activeTenantId,
      membership: user.membership
    },
    membership: membership ?? null,
    memberships: Array.isArray(memberships) ? memberships : null,
    tenantContextVerified: true
  };
  const candidate = isVerifiedTenantlessSeeker(profile);

  useEffect(() => {
    if (!enabled || loading || !isAuthenticated || !candidate) return;
    let active = true;
    fetchVerifiedSeekerBrowserContext({
      expectedAuthId: user.id,
      getSession: () => getPlatformClient().auth.getSession()
    })
      .then(result => {
        if (active) setStatus({
          key, eligible: result.verified === true && result.eligible === true
        });
      });
    return () => { active = false; };
  }, [key, user, loading, isAuthenticated, candidate]);

  if (!enabled) return <Navigate to="/unauthorized" replace />;
  if (loading) return <div role="status">Checking your account…</div>;
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }
  if (!candidate) return <Navigate to="/unauthorized" replace />;

  // Never reuse an earlier user's certification or an in-flight response.
  if (status.key !== key) return <div role="status">Verifying your account…</div>;
  if (!status.eligible) return <Navigate to="/unauthorized" replace />;
  if (redirectOnly) return <Navigate to="/seeker" replace />;
  return <SeekerHome {...profile} />;
};
