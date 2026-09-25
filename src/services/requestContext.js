const SESSION_STORAGE_KEY = 'khrental.local.session';
const ACTIVE_TENANT_STORAGE_KEY = 'khrental.activeTenantId';
const DEV_BYPASS_ROLE_KEY = 'dev_bypass_role';
const AUTH_FLOW_ISOLATED_PATHS = new Set(['/reset-password', '/accept-invite']);
const isBrowser = typeof window !== 'undefined';
const fallbackStorage = new Map();

const storage = isBrowser && window.localStorage
  ? window.localStorage
  : {
      getItem: (key) => fallbackStorage.get(key) ?? null,
      setItem: (key, value) => fallbackStorage.set(key, value),
      removeItem: (key) => fallbackStorage.delete(key)
    };

const normalizePathname = (pathname = '') => {
  const normalized = String(pathname || '').split('?')[0].replace(/\/+$/, '');
  return normalized || '/';
};

/**
 * Authentication bootstrap/recovery routes must render outside the normal
 * authenticated application shell. This prevents tenant initialization,
 * navigation, onboarding guides and other authenticated-only behavior from
 * competing with credential establishment.
 *
 * Route isolation does not imply identical session handling. Password recovery
 * is intentionally anonymous, while secure invitation redemption may inspect a
 * server-valid existing session solely to preserve a different signed-in user.
 */
export const isAuthFlowIsolatedPath = (pathname = '') => AUTH_FLOW_ISOLATED_PATHS.has(normalizePathname(pathname));

/**
 * Password recovery is an anonymous credential flow. It must not inherit the
 * application's stored session because a stale or still-authenticated browser
 * session can otherwise redirect the user away from the recovery page or cause
 * the public reset API to be rejected before the reset token is processed.
 */
export const isPasswordRecoveryPath = (pathname = '') => normalizePathname(pathname) === '/reset-password';

const isPasswordRecoveryRequest = () => isBrowser && isPasswordRecoveryPath(window.location?.pathname || '');

export const loadStoredSession = () => {
  // Deliberately leave the stored value untouched here. If the user abandons
  // recovery, a valid existing session can still be used after a full reload.
  // Successful recovery explicitly clears the old session after the server has
  // revoked it.
  if (isPasswordRecoveryRequest()) {
    return null;
  }

  const raw = storage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
};

export const saveStoredSession = (session) => {
  if (!session) {
    storage.removeItem(SESSION_STORAGE_KEY);
    return;
  }

  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
};

export const clearStoredSession = () => {
  storage.removeItem(SESSION_STORAGE_KEY);
};

export const getActiveTenantId = () => storage.getItem(ACTIVE_TENANT_STORAGE_KEY) || null;

export const setActiveTenantId = (tenantId) => {
  if (!tenantId) {
    storage.removeItem(ACTIVE_TENANT_STORAGE_KEY);
    return null;
  }

  const normalized = String(tenantId).trim();
  if (!normalized) {
    storage.removeItem(ACTIVE_TENANT_STORAGE_KEY);
    return null;
  }

  storage.setItem(ACTIVE_TENANT_STORAGE_KEY, normalized);
  return normalized;
};

export const clearActiveTenantId = () => {
  storage.removeItem(ACTIVE_TENANT_STORAGE_KEY);
};

export const getDevBypassRole = () => storage.getItem(DEV_BYPASS_ROLE_KEY) || null;

export const buildRequestContextHeaders = (headers = {}) => {
  // Recovery requests must be truly anonymous. In particular, do not attach an
  // old Authorization token, tenant selection, or development bypass identity.
  if (isPasswordRecoveryRequest()) {
    return { ...headers };
  }

  const session = loadStoredSession();
  const authId = session?.user?.id || null;
  const tenantId = getActiveTenantId();
  const devBypassRole = getDevBypassRole();

  return {
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
    ...(!authId && devBypassRole ? { 'x-dev-bypass-role': devBypassRole } : {}),
    ...headers
  };
};
