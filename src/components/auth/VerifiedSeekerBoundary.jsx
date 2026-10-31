// B04 S3c2c: route-level read-only seeker proof. Disabled by default.
// Tenant and billing APIs remain protected by their existing server guards.
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { enquiryReturnPath,ownerSetupPath } from '../../utils/enquiryReturnPath.js';
import {getDefaultLandingPath} from '../../utils/accessPolicy.js';
import {getOwnerContinuationPath} from '../../utils/authRedirect.js';
import { useAuth } from '../../hooks/useAuth';
import { isPublicSeekerLandingEnabled } from '../../utils/env';
import { isVerifiedTenantlessSeeker } from '../../utils/seekerLandingPolicy';
import { fetchVerifiedSeekerBrowserContext, fetchPersonalRentalBrowserContext } from '../../services/seekerContextClient';
import { getPlatformClient } from '../../services/platformClient';
import SeekerHome from '../../pages/SeekerHome';

const enabled = isPublicSeekerLandingEnabled();

export const VerifiedSeekerBoundary = ({ redirectOnly = false }) => {
  const location=useLocation();
  const { user, membership, memberships, loading, isAuthenticated } = useAuth();
  const [status, setStatus] = useState({ key: null, eligible: false });
  const personal=!redirectOnly&&new URLSearchParams(location.search).get('purpose')==='rental';
  const key = String(user?.id || '') + ':' + String(user?.profileId || '')+':'+String(personal);

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
    tenantContextVerified: user?.tenantContextVerified!==false
  };
  const candidate = personal ? Boolean(isAuthenticated&&user?.id) : isVerifiedTenantlessSeeker(profile);

  useEffect(() => {
    if (!enabled || loading || !isAuthenticated || !candidate) return;
    let active = true;
    (personal?fetchPersonalRentalBrowserContext:fetchVerifiedSeekerBrowserContext)({
      expectedAuthId: user.id,
      getSession: () => getPlatformClient().auth.getSession()
    })
      .then(result => {
        if (active) setStatus({
          key, eligible: result.verified === true && result.eligible === true
        });
      });
    return () => { active = false; };
  }, [key, user, loading, isAuthenticated, candidate, personal]);

  if (!enabled) return <Navigate to="/unauthorized" replace />;
  if (loading) return <div role="status">Checking your account…</div>;
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }
  if (!candidate) return <Navigate to={getDefaultLandingPath({user,membership})} replace />;

  // Never reuse an earlier user's certification or an in-flight response.
  if (status.key !== key) return <div role="status">Verifying your account…</div>;
  if (!status.eligible) return <Navigate to="/unauthorized" replace />;
  if (redirectOnly&&ownerSetupPath(location.search)) return <Navigate to={ownerSetupPath(location.search)} replace />;
  if (redirectOnly) return <Navigate to={enquiryReturnPath(location.search) || getOwnerContinuationPath({user,membership}) || '/seeker'} replace />;
  return <SeekerHome {...profile} personalRentalVerified={personal&&status.eligible} />;
};
