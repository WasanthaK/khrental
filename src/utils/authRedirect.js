import {getDefaultLandingPath,hasPermission,PERMISSIONS} from './accessPolicy.js';

// Navigation only: keep a returning property manager in the currently resolved
// organization. This never selects another tenant or grants API authority.
export const getExistingPropertyWorkspacePath = ({user,membership=user?.membership}={}) => {
  if (!user || !membership?.tenant_id || String(membership.status).toLowerCase()!=='active') {return null;}
  const subject={user,membership};
  return getDefaultLandingPath(subject)==='/dashboard'&&hasPermission(subject,PERMISSIONS.PROPERTIES_READ)
    ?'/dashboard/properties':null;
};

const isSafeInternalPath = (value) => (
  typeof value === 'string'
  && value.startsWith('/')
  && !value.startsWith('//')
);

export const buildReturnPath = (location = null) => {
  const pathname = location?.pathname;

  if (!isSafeInternalPath(pathname)) {
    return null;
  }

  const search = typeof location?.search === 'string' && location.search.startsWith('?')
    ? location.search
    : '';
  const hash = typeof location?.hash === 'string' && location.hash.startsWith('#')
    ? location.hash
    : '';

  return `${pathname}${search}${hash}`;
};

export const getPostLoginPath = (state = null, fallbackPath = '/') => (
  buildReturnPath(state?.from) || fallbackPath
);
