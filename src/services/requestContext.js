const SESSION_STORAGE_KEY = 'khrental.local.session';
const ACTIVE_TENANT_STORAGE_KEY = 'khrental.activeTenantId';
const DEV_BYPASS_ROLE_KEY = 'dev_bypass_role';
const isBrowser = typeof window !== 'undefined';
const fallbackStorage = new Map();

const storage = isBrowser && window.localStorage
  ? window.localStorage
  : {
      getItem: (key) => fallbackStorage.get(key) ?? null,
      setItem: (key, value) => fallbackStorage.set(key, value),
      removeItem: (key) => fallbackStorage.delete(key)
    };

export const loadStoredSession = () => {
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
  const session = loadStoredSession();
  const authId = session?.user?.id || null;
  const email = session?.user?.email || null;
  const tenantId = getActiveTenantId();
  const devBypassRole = getDevBypassRole();

  return {
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
    ...(!authId && devBypassRole ? { 'x-dev-bypass-role': devBypassRole } : {}),
    ...headers
  };
};
