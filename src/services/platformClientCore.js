import { getApiBaseUrl } from '../utils/env';
import {
  buildRequestContextHeaders,
  clearActiveTenantId,
  clearStoredSession,
  getActiveTenantId,
  loadStoredSession,
  saveStoredSession,
  setActiveTenantId
} from './requestContext';

const AUTH_LISTENERS = new Set();
const isBrowser = typeof window !== 'undefined';

const loadAppUserService = () => import('./appUserService');
const loadCreateAppUserService = () => import('./createAppUser');

const findExistingAppUserByEmail = async (email) => {
  const { findAppUserByEmail } = await loadAppUserService();
  const result = await findAppUserByEmail(email);
  return result.success ? result.data : null;
};

const createLegacyAppUser = async (userData, userType = 'staff') => {
  const { createAppUser } = await loadCreateAppUserService();
  return createAppUser(userData, userType);
};

const updateLegacyAppUser = async (id, userData) => {
  const { updateAppUser } = await loadAppUserService();
  return updateAppUser(id, userData);
};

const deleteLegacyAppUser = async (id) => {
  const { deleteAppUser } = await loadAppUserService();
  return deleteAppUser(id);
};

const findExistingAppUserById = async (userId) => {
  const { fetchAppUser } = await loadAppUserService();

  try {
    return await fetchAppUser(userId);
  } catch (_error) {
    return null;
  }
};

const findExistingAppUserByAuthId = async (authId) => {
  const { findAppUserByAuthId } = await loadAppUserService();
  const result = await findAppUserByAuthId(authId);
  return result.success ? result.data : null;
};

let currentSession = loadStoredSession();

const notifyAuthListeners = (event, session) => {
  AUTH_LISTENERS.forEach((listener) => {
    try {
      listener(event, session);
    } catch (error) {
      console.error('[Auth Shim] Listener error:', error);
    }
  });
};

const persistSession = (session, event = 'SIGNED_IN') => {
  currentSession = session || null;

  if (currentSession) {
    saveStoredSession(currentSession);
  } else {
    clearStoredSession();
    clearActiveTenantId();
  }

  notifyAuthListeners(event, currentSession);
};

const readErrorPayload = async (response) => {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null);
    return payload?.error || payload?.message || JSON.stringify(payload);
  }

  return response.text().catch(() => '');
};

const apiRequest = async (path, options = {}) => {
  const {
    method = 'GET',
    headers = {},
    body,
    raw = false,
    ...rest
  } = options;

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers: {
      ...(body !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}),
      ...buildRequestContextHeaders(headers)
    },
    ...(body !== undefined ? { body: raw ? body : JSON.stringify(body) } : {}),
    ...rest
  });

  if (!response.ok) {
    throw new Error(await readErrorPayload(response));
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response;
};

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this.action = 'select';
    this.selectClause = '*';
    this.filters = [];
    this.sorts = [];
    this.limitValue = null;
    this.rangeValue = null;
    this.payload = undefined;
    this.expectSingle = false;
    this.allowEmpty = false;
    this.countOption = null;
    this.head = false;
  }

  select(columns = '*', options = {}) {
    this.selectClause = columns || '*';
    this.countOption = options?.count || null;
    this.head = options?.head === true;
    return this;
  }

  insert(payload) {
    this.action = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload) {
    this.action = 'update';
    this.payload = payload;
    return this;
  }

  upsert(payload) {
    this.action = 'upsert';
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(column, value) { return this.filter(column, 'eq', value); }
  neq(column, value) { return this.filter(column, 'neq', value); }
  gt(column, value) { return this.filter(column, 'gt', value); }
  gte(column, value) { return this.filter(column, 'gte', value); }
  lt(column, value) { return this.filter(column, 'lt', value); }
  lte(column, value) { return this.filter(column, 'lte', value); }
  like(column, value) { return this.filter(column, 'like', value); }
  ilike(column, value) { return this.filter(column, 'ilike', value); }
  in(column, value) { return this.filter(column, 'in', value); }
  is(column, value) { return this.filter(column, 'is', value); }

  filter(column, operator, value) {
    this.filters.push({ column, operator, value });
    return this;
  }

  order(column, options = {}) {
    this.sorts.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(value) {
    this.limitValue = Number(value);
    return this;
  }

  range(from, to) {
    this.rangeValue = { from: Number(from), to: Number(to) };
    return this;
  }

  single() {
    this.expectSingle = true;
    this.allowEmpty = false;
    return this.execute();
  }

  maybeSingle() {
    this.expectSingle = true;
    this.allowEmpty = true;
    return this.execute();
  }

  async execute() {
    const payload = await apiRequest('/api/platform/query', {
      method: 'POST',
      body: {
        action: this.action,
        table: this.table,
        select: this.selectClause,
        filters: this.filters,
        order: this.sorts,
        limit: this.limitValue,
        range: this.rangeValue,
        payload: this.payload,
        head: this.head,
        count: this.countOption
      }
    });

    const count = payload?.count ?? null;
    let data = payload?.data ?? null;

    if (this.expectSingle) {
      const firstRow = Array.isArray(data) ? data[0] || null : data;
      if (!firstRow && !this.allowEmpty) {
        return { data: null, error: { message: 'Record not found' }, count };
      }
      return { data: firstRow, error: null, count };
    }

    return { data, error: null, count };
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  catch(reject) {
    return this.execute().catch(reject);
  }

  finally(handler) {
    return this.execute().finally(handler);
  }
}

const buildPublicUrl = (bucket, filePath) => {
  const baseUrl = getApiBaseUrl().replace(/\/$/, '');
  return `${baseUrl}/storage/${bucket}/${String(filePath || '').replace(/^\/+/, '')}`;
};

const STORAGE_TENANT_ROOT = 'tenants';

const normalizeStoragePath = (filePath = '') => String(filePath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
const isTenantScopedPath = (filePath = '') => normalizeStoragePath(filePath).startsWith(`${STORAGE_TENANT_ROOT}/`);

const getTenantStoragePrefix = () => {
  const activeTenantId = getActiveTenantId();
  const normalizedTenantId = normalizeStoragePath(activeTenantId);
  return normalizedTenantId ? `${STORAGE_TENANT_ROOT}/${normalizedTenantId}` : '';
};

const scopeStoragePath = (filePath, { requireTenant = false } = {}) => {
  const normalizedPath = normalizeStoragePath(filePath);
  const tenantPrefix = getTenantStoragePrefix();

  if (!tenantPrefix) {
    if (isTenantScopedPath(normalizedPath)) {
      return normalizedPath;
    }

    // When the browser has no locally stored active tenant yet, allow the request
    // to continue and let the backend tenant context apply the correct tenant scope.
    return normalizedPath;
  }

  if (!normalizedPath) {
    return tenantPrefix;
  }

  if (normalizedPath === tenantPrefix || normalizedPath.startsWith(`${tenantPrefix}/`)) {
    return normalizedPath;
  }

  if (normalizedPath.startsWith(`${STORAGE_TENANT_ROOT}/`)) {
    throw new Error('Cross-tenant storage paths are not allowed.');
  }

  return `${tenantPrefix}/${normalizedPath}`;
};

const storageClient = {
  async listBuckets() {
    try {
      const payload = await apiRequest('/api/platform/storage/buckets');
      return { data: payload?.data || [], error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  async getBucket(bucketName) {
    try {
      const payload = await apiRequest('/api/platform/storage/buckets');
      const bucket = (payload?.data || []).find((entry) => entry.name === bucketName || entry.id === bucketName) || null;
      return { data: bucket, error: bucket ? null : new Error(`Bucket ${bucketName} not found`) };
    } catch (error) {
      return { data: null, error };
    }
  },

  async createBucket(bucketName, _options = {}) {
    try {
      const payload = await apiRequest('/api/platform/storage/buckets', {
        method: 'POST',
        body: { bucketName }
      });
      return { data: payload?.data || null, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  async updateBucket(bucketName, _options = {}) {
    try {
      const { data, error } = await this.getBucket(bucketName);

      if (error && !data) {
        return { data: null, error };
      }

      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  async deleteBucket(bucketName) {
    try {
      const payload = await apiRequest(`/api/platform/storage/buckets/${encodeURIComponent(bucketName)}`, {
        method: 'DELETE'
      });
      return { data: payload?.data || null, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  from(bucket) {
    return {
      async upload(filePath, file) {
        try {
          const scopedPath = scopeStoragePath(filePath, { requireTenant: true });
          const arrayBuffer = file instanceof Blob ? await file.arrayBuffer() : file;
          const payload = await apiRequest(`/api/platform/storage/upload?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(scopedPath)}`, {
            method: 'POST',
            raw: true,
            body: arrayBuffer,
            headers: {
              'Content-Type': file?.type || 'application/octet-stream'
            }
          });
          return {
            data: payload?.data
              ? {
                  ...payload.data,
                  originalPath: normalizeStoragePath(filePath),
                  scopedPath: payload.data.path || scopedPath
                }
              : null,
            error: null
          };
        } catch (error) {
          return { data: null, error };
        }
      },

      async list(folderPath = '') {
        try {
          const scopedPath = scopeStoragePath(folderPath);
          const payload = await apiRequest(`/api/platform/storage/list?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(scopedPath)}`);
          return { data: payload?.data || [], error: null };
        } catch (error) {
          return { data: null, error };
        }
      },

      async download(filePath) {
        try {
          const scopedPath = scopeStoragePath(filePath);
          const response = await fetch(buildPublicUrl(bucket, scopedPath));
          if (!response.ok) {
            throw new Error(`Failed to download ${filePath}`);
          }
          return { data: await response.blob(), error: null };
        } catch (error) {
          return { data: null, error };
        }
      },

      getPublicUrl(filePath) {
        const scopedPath = scopeStoragePath(filePath);
        return { data: { publicUrl: buildPublicUrl(bucket, scopedPath), path: scopedPath } };
      },

      async remove(paths = []) {
        try {
          const scopedPaths = paths.map((item) => scopeStoragePath(item, { requireTenant: true }));
          const payload = await apiRequest('/api/platform/storage/objects', {
            method: 'DELETE',
            body: { bucket, paths: scopedPaths }
          });
          return { data: payload?.data || [], error: null };
        } catch (error) {
          return { data: null, error };
        }
      }
    };
  }
};

const authClient = {
  async getSession() {
    return { data: { session: currentSession }, error: null };
  },

  async getUser() {
    return { data: { user: currentSession?.user || null }, error: null };
  },

  async getTenantContext() {
    try {
      const payload = await apiRequest('/api/platform/auth/context');
      const tenantContext = payload?.data || null;
      if (tenantContext?.tenantId) {
        setActiveTenantId(tenantContext.tenantId);
      }
      return { data: tenantContext, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  async setActiveTenant(tenantId) {
    const normalizedTenantId = setActiveTenantId(tenantId);
    return { data: { tenantId: normalizedTenantId }, error: null };
  },

  async signInWithPassword({ email, password }) {
    try {
      const payload = await apiRequest('/api/platform/auth/sign-in', {
        method: 'POST',
        body: { email, password }
      });
      persistSession(payload?.data?.session || null, 'SIGNED_IN');
      return { data: payload?.data || null, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  async signUp({ email, password, options = {} }) {
    try {
      const payload = await apiRequest('/api/platform/auth/sign-up', {
        method: 'POST',
        body: {
          email,
          password,
          role: options?.data?.role || 'authenticated',
          metadata: options?.data || {}
        }
      });
      if (payload?.data?.session) {
        persistSession(payload.data.session, 'SIGNED_IN');
      }
      return { data: payload?.data || null, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  async signOut() {
    try {
      if (currentSession?.access_token) {
        await apiRequest('/api/platform/auth/sign-out', { method: 'POST' });
      }
    } finally {
      persistSession(null, 'SIGNED_OUT');
    }
    return { error: null };
  },

  async resetPasswordForEmail(email) {
    try {
      const payload = await apiRequest('/api/platform/auth/reset-password', {
        method: 'POST',
        body: { email }
      });
      return { data: payload?.data || null, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  async updateUser({ password, data = {} }) {
    try {
      const payload = await apiRequest('/api/platform/auth/update-user', {
        method: 'POST',
        body: {
          authId: currentSession?.user?.id,
          email: currentSession?.user?.email,
          password,
          metadata: data
        }
      });
      persistSession(payload?.data?.session || currentSession, 'USER_UPDATED');
      return { data: payload?.data || null, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  async signInWithOtp({ email, options = {} }) {
    try {
      const payload = await apiRequest('/api/platform/auth/otp', {
        method: 'POST',
        body: { email, options }
      });
      return { data: payload?.data || null, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  onAuthStateChange(callback) {
    AUTH_LISTENERS.add(callback);
    return {
      data: {
        subscription: {
          unsubscribe: () => AUTH_LISTENERS.delete(callback)
        }
      }
    };
  },

  admin: {
    async inviteUserByEmail(email, options = {}) {
      try {
        const payload = await apiRequest('/api/platform/auth/invite', {
          method: 'POST',
          body: { email, options }
        });
        return { data: payload?.data || null, error: null };
      } catch (error) {
        return { data: null, error };
      }
    }
  }
};

const rpc = async (name, args = {}) => {
  try {
    const payload = await apiRequest(`/api/platform/rpc/${encodeURIComponent(name)}`, {
      method: 'POST',
      body: args
    });
    return { data: payload?.data ?? null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

let platformClientInstance = null;

export const getPlatformClient = () => {
  if (!platformClientInstance) {
    platformClientInstance = {
      from: (table) => new QueryBuilder(table),
      storage: storageClient,
      auth: authClient,
      rpc
    };
  }

  return platformClientInstance;
};

export const platformClient = getPlatformClient();
export const platform = platformClient;
export { getActiveTenantId, setActiveTenantId, clearActiveTenantId };

export const signUp = async (email, password) => {
  const { data, error } = await platformClient.auth.signUp({ email, password });
  return { data, error };
};

export const signIn = async (email, password) => {
  const { data, error } = await platformClient.auth.signInWithPassword({ email, password });
  return { data, error };
};

export const signOut = async () => platformClient.auth.signOut();

export const getCurrentUser = async () => {
  const { data, error } = await platformClient.auth.getUser();
  return { data, error };
};

export const resetPassword = async (email) => platformClient.auth.resetPasswordForEmail(email);

export const updatePassword = async (newPassword) => platformClient.auth.updateUser({ password: newPassword });

export const fetchData = async (tableOrOptions, columns = null, filters = null) => {
  try {
    let table;
    let query = {};

    if (tableOrOptions !== null && typeof tableOrOptions === 'object' && !Array.isArray(tableOrOptions)) {
      table = tableOrOptions.table;
      query = tableOrOptions;
    } else {
      table = tableOrOptions;
      if (columns !== null && typeof columns === 'object' && !Array.isArray(columns)) {
        query = columns;
      } else if (filters !== null && typeof filters === 'object') {
        query = {
          filters: Object.entries(filters).map(([column, value]) => ({ column, operator: 'eq', value }))
        };
      }
      if (Array.isArray(columns)) {
        query.columns = columns;
      }
    }

    let queryBuilder = platformClient.from(table);

    if (query.select) {
      queryBuilder = queryBuilder.select(query.select, { count: query.count ? 'exact' : undefined, head: query.head });
    } else if (table === 'maintenance_requests') {
      queryBuilder = queryBuilder.select(`
        *,
        maintenance_request_images (
          id,
          maintenance_request_id,
          image_url,
          image_type,
          uploaded_by,
          uploaded_at,
          description
        )
      `, { count: query.count ? 'exact' : undefined, head: query.head });
    } else if (Array.isArray(query.columns)) {
      queryBuilder = queryBuilder.select(query.columns.join(','), { count: query.count ? 'exact' : undefined, head: query.head });
    } else {
      queryBuilder = queryBuilder.select('*', { count: query.count ? 'exact' : undefined, head: query.head });
    }

    if (query.filters && Array.isArray(query.filters)) {
      query.filters.forEach((filter) => {
        const operator = filter.operator || 'eq';
        if (typeof queryBuilder[operator] === 'function') {
          queryBuilder = queryBuilder[operator](String(filter.column).toLowerCase(), filter.value);
        } else {
          queryBuilder = queryBuilder.filter(String(filter.column).toLowerCase(), operator, filter.value);
        }
      });
    }

    if (query.order && query.order.column) {
      queryBuilder = queryBuilder.order(String(query.order.column).toLowerCase(), {
        ascending: query.order.ascending !== false
      });
    }

    if (query.limit && !Number.isNaN(Number(query.limit))) {
      queryBuilder = queryBuilder.limit(Number(query.limit));
    }

    return await queryBuilder;
  } catch (error) {
    return { data: null, error };
  }
};

export const toDatabaseFormat = (data) => {
  if (!data) return data;
  const formatted = {};

  Object.entries(data).forEach(([key, value]) => {
    const dbKey = key.toLowerCase();
    if (Array.isArray(value)) {
      formatted[dbKey] = value.map((item) => (typeof item === 'object' && item !== null ? toDatabaseFormat(item) : item));
    } else if (value && typeof value === 'object') {
      formatted[dbKey] = toDatabaseFormat(value);
    } else {
      formatted[dbKey] = value;
    }
  });

  return formatted;
};

const cleanDataForDatabase = (data) => {
  const cleanedData = { ...data };
  Object.keys(cleanedData).forEach((key) => {
    if (cleanedData[key] === '' && (
      key === 'squarefeet' ||
      key === 'yearbuilt' ||
      key.includes('amount') ||
      key.includes('reading') ||
      key.includes('rate') ||
      key.includes('fee')
    )) {
      cleanedData[key] = null;
    }
  });
  return cleanedData;
};

export const insertData = async (table, data) => {
  const dbData = cleanDataForDatabase(toDatabaseFormat(data));
  const now = new Date().toISOString();
  return platformClient.from(table).insert({ ...dbData, createdat: dbData.createdat || now, updatedat: dbData.updatedat || now }).select('*');
};

export const updateData = async (table, id, data) => {
  if (!table || !id || !data) {
    return { error: new Error('Table, ID, and data are required for update'), data: null };
  }

  try {
    const dbData = cleanDataForDatabase(toDatabaseFormat(data));
    const { data: result, error } = await platformClient
      .from(table)
      .update({ ...dbData, updatedat: new Date().toISOString() })
      .eq('id', id)
      .single();

    return { data: result, error };
  } catch (error) {
    return { data: null, error };
  }
};

export const deleteData = async (table, id) => platformClient.from(table).delete().eq('id', id);
export const uploadFile = async (bucket, path, file) => platformClient.storage.from(bucket).upload(path, file);
export const getFileUrl = (bucket, path) => platformClient.storage.from(bucket).getPublicUrl(path).data.publicUrl;
export const deleteFile = async (bucket, path) => platformClient.storage.from(bucket).remove([path]);
export const getPublicUrl = getFileUrl;
export const storage = storageClient;
export const auth = authClient;
export { rpc };
export const listBuckets = async () => storageClient.listBuckets();
export const getBucket = async (bucketName) => storageClient.getBucket(bucketName);
export const updateBucket = async (bucketName, options = {}) => storageClient.updateBucket(bucketName, options);
export const createStorageBucket = async (bucketName, options = {}) => storageClient.createBucket(bucketName, options);
export const selectData = fetchData;
export const upsertData = async (table, data) => platformClient.from(table).upsert(toDatabaseFormat(data)).select('*');
export const query = async (tableOrOptions, columns = null, filters = null) => fetchData(tableOrOptions, columns, filters);
export const execute = rpc;

export const inviteUser = async (email, role = 'rentee') => {
  try {
    const { data, error } = await platformClient.auth.admin.inviteUserByEmail(email, {
      data: { role },
      redirectTo: isBrowser ? `${window.location.origin}/auth/callback?type=invite&role=${role}` : undefined
    });

    if (error) {
      return { success: false, data: null, error: error.message };
    }

    const existingUser = await findExistingAppUserByEmail(email);
    if (!existingUser) {
      await createLegacyAppUser({
        email,
        role,
        status: 'invited',
        createdat: new Date().toISOString(),
        updatedat: new Date().toISOString()
      }, role === 'rentee' ? 'rentee' : 'staff');
    }

    return { success: true, data, error: null };
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
};

export const checkUserExists = async (userId, isAuthId = false) => {
  if (!userId) {
    return { exists: false, data: null, error: 'No user ID provided' };
  }

  try {
    const data = isAuthId ? await findExistingAppUserByAuthId(userId) : await findExistingAppUserById(userId);
    return { exists: !!data, data, error: null };
  } catch (error) {
    return { exists: false, data: null, error };
  }
};

export const inviteTeamMember = async (email, role, userDetails = {}) => {
  try {
    const existingUsers = await findExistingAppUserByEmail(email.toLowerCase());
    if (existingUsers) {
      return {
        success: false,
        message: `User with email ${email} already exists in the system with role: ${existingUsers.role}`,
        error: 'USER_EXISTS'
      };
    }

    const createResult = await createLegacyAppUser({
      email: email.toLowerCase(),
      role,
      status: 'invited',
      name: userDetails.name || '',
      contact_details: userDetails.contactDetails || {},
      createdat: new Date().toISOString(),
      updatedat: new Date().toISOString()
    }, 'staff');

    if (!createResult.success) {
      return {
        success: false,
        message: `Failed to create user record: ${createResult.error}`,
        error: createResult.error
      };
    }

    const newUser = Array.isArray(createResult.data) ? createResult.data[0] : createResult.data;
    const { data, error } = await platformClient.auth.admin.inviteUserByEmail(email, {
      data: {
        role,
        app_user_id: newUser.id,
        force_password_change: true
      },
      redirectTo: isBrowser ? `${window.location.origin}/auth/callback?type=invite&role=${role}` : undefined
    });

    if (error) {
      await deleteLegacyAppUser(newUser.id);
      return {
        success: false,
        message: `Failed to send invitation email: ${error.message}`,
        error: error.message
      };
    }

    if (data?.user?.id) {
      await updateLegacyAppUser(newUser.id, { invited: true, auth_id: data.user.id });
    }

    return {
      success: true,
      message: `Invitation sent to ${email}`,
      error: null,
      userId: newUser.id
    };
  } catch (error) {
    return {
      success: false,
      message: `An unexpected error occurred: ${error.message}`,
      error: error.message
    };
  }
};

console.log('[Platform] Local MSSQL compatibility client initialized', {
  apiBaseUrl: getApiBaseUrl(),
  browser: isBrowser
});
