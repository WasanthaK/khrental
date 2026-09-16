import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const STORAGE_ROOT = path.resolve(process.cwd(), 'public', 'storage');
const DEFAULT_BUCKETS = ['images', 'files', 'documents', 'invoices', 'media', 'maintenance'];

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hmac = (key, value, encoding) => crypto.createHmac('sha256', key).update(value).digest(encoding);
const encodeComponent = (value) => encodeURIComponent(String(value)).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const encodePath = (value) => String(value || '').split('/').filter(Boolean).map(encodeComponent).join('/');

export const normalizeStoragePath = (value = '') => {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..' || part.includes('\0'))) {
    const error = new Error('Invalid storage path.');
    error.status = 400;
    error.code = 'INVALID_STORAGE_PATH';
    throw error;
  }
  return parts.join('/');
};

const ensureBucketName = (bucket) => {
  const value = String(bucket || '').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(value)) {
    const error = new Error(`Invalid bucket: ${value}`);
    error.status = 400;
    throw error;
  }
  return value;
};

const getLogicalBuckets = () => {
  const configured = String(process.env.STORAGE_BUCKETS || '').split(',').map((item) => item.trim()).filter(Boolean);
  return configured.length > 0 ? configured.map(ensureBucketName) : DEFAULT_BUCKETS;
};

const mapLocalEntry = async (dirPath, entry) => {
  const itemPath = path.join(dirPath, entry.name);
  const stats = await fs.stat(itemPath).catch(() => null);
  return {
    id: entry.isDirectory() ? null : crypto.createHash('md5').update(itemPath).digest('hex'),
    name: entry.name,
    created_at: stats?.birthtime?.toISOString?.() || null,
    updated_at: stats?.mtime?.toISOString?.() || null,
    last_accessed_at: stats?.atime?.toISOString?.() || null,
    metadata: entry.isDirectory() ? null : { size: stats?.size || 0 }
  };
};

class LocalStorageDriver {
  name = 'local';

  async listBuckets() {
    await fs.mkdir(STORAGE_ROOT, { recursive: true });
    const entries = await fs.readdir(STORAGE_ROOT, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => ({ id: entry.name, name: entry.name, public: false }));
  }

  async createBucket(bucket) {
    const safeBucket = ensureBucketName(bucket);
    await fs.mkdir(path.join(STORAGE_ROOT, safeBucket), { recursive: true });
    return { id: safeBucket, name: safeBucket, public: false };
  }

  async deleteBucket(bucket) {
    await fs.rm(path.join(STORAGE_ROOT, ensureBucketName(bucket)), { recursive: true, force: true });
  }

  async list(bucket, relativePath = '') {
    const targetPath = path.join(STORAGE_ROOT, ensureBucketName(bucket), normalizeStoragePath(relativePath));
    const entries = await fs.readdir(targetPath, { withFileTypes: true }).catch(() => []);
    return Promise.all(entries.map((entry) => mapLocalEntry(targetPath, entry)));
  }

  async upload(bucket, relativePath, body) {
    const safeBucket = ensureBucketName(bucket);
    const safePath = normalizeStoragePath(relativePath);
    const targetPath = path.join(STORAGE_ROOT, safeBucket, safePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, body);
    return { path: safePath, fullPath: `${safeBucket}/${safePath}` };
  }

  async deleteObjects(bucket, paths = []) {
    const safeBucket = ensureBucketName(bucket);
    const safePaths = paths.map(normalizeStoragePath);
    await Promise.all(safePaths.map((item) => fs.rm(path.join(STORAGE_ROOT, safeBucket, item), { force: true, recursive: true })));
    return safePaths.map((name) => ({ name }));
  }

  async getObject(bucket, relativePath) {
    const safePath = normalizeStoragePath(relativePath);
    if (!safePath) {
      const error = new Error('Stored object path is required.');
      error.status = 404;
      error.code = 'STORAGE_OBJECT_NOT_FOUND';
      throw error;
    }
    const body = await fs.readFile(path.join(STORAGE_ROOT, ensureBucketName(bucket), safePath));
    return { body, contentType: 'application/octet-stream', etag: null };
  }
}

const xmlDecode = (value = '') => value
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&');

const xmlValue = (xml, tag) => {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? xmlDecode(match[1]) : null;
};

class R2StorageDriver {
  name = 'r2';

  constructor() {
    const accountId = String(process.env.R2_ACCOUNT_ID || '').trim();
    this.endpoint = String(process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '')).replace(/\/$/, '');
    this.bucket = String(process.env.R2_BUCKET || '').trim();
    this.accessKeyId = String(process.env.R2_ACCESS_KEY_ID || '').trim();
    this.secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || '').trim();
    this.logicalBuckets = getLogicalBuckets();

    if (!this.endpoint || !this.bucket || !this.accessKeyId || !this.secretAccessKey) {
      throw new Error('R2 storage requires R2_ACCOUNT_ID or R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.');
    }
  }

  objectKey(bucket, relativePath = '') {
    const safeBucket = ensureBucketName(bucket);
    if (!this.logicalBuckets.includes(safeBucket)) {
      throw new Error(`Unknown logical storage bucket: ${safeBucket}`);
    }
    const safePath = normalizeStoragePath(relativePath);
    return safePath ? `${safeBucket}/${safePath}` : `${safeBucket}/`;
  }

  async request(method, objectKey = '', { query = {}, body = null, headers = {} } = {}) {
    const payload = body == null ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(body);
    const payloadHash = sha256(payload);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const url = new URL(`${this.endpoint}/${encodePath(this.bucket)}${objectKey ? `/${encodePath(objectKey)}` : ''}`);

    Object.entries(query).sort(([a], [b]) => a.localeCompare(b)).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.append(key, String(value));
      }
    });

    const canonicalHeadersMap = {
      host: url.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value).trim()]))
    };
    const signedHeaderNames = Object.keys(canonicalHeadersMap).sort();
    const canonicalHeaders = signedHeaderNames.map((key) => `${key}:${canonicalHeadersMap[key]}\n`).join('');
    const canonicalQuery = [...url.searchParams.entries()]
      .sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue))
      .map(([key, value]) => `${encodeComponent(key)}=${encodeComponent(value)}`)
      .join('&');
    const canonicalRequest = [method, url.pathname, canonicalQuery, canonicalHeaders, signedHeaderNames.join(';'), payloadHash].join('\n');
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256(canonicalRequest)].join('\n');
    const dateKey = hmac(`AWS4${this.secretAccessKey}`, dateStamp);
    const regionKey = hmac(dateKey, 'auto');
    const serviceKey = hmac(regionKey, 's3');
    const signingKey = hmac(serviceKey, 'aws4_request');
    const signature = hmac(signingKey, stringToSign, 'hex');

    const response = await fetch(url, {
      method,
      headers: {
        ...canonicalHeadersMap,
        Authorization: `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaderNames.join(';')}, Signature=${signature}`
      },
      ...(body == null ? {} : { body: payload })
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      const error = new Error(`R2 request failed (${response.status}): ${details || response.statusText}`);
      error.status = response.status;
      throw error;
    }
    return response;
  }

  async listBuckets() {
    return this.logicalBuckets.map((name) => ({ id: name, name, public: false }));
  }

  async createBucket(bucket) {
    const name = ensureBucketName(bucket);
    if (!this.logicalBuckets.includes(name)) {
      this.logicalBuckets.push(name);
    }
    return { id: name, name, public: false };
  }

  async listAllKeys(prefix) {
    const keys = [];
    let continuationToken = null;
    do {
      const response = await this.request('GET', '', {
        query: { 'list-type': '2', prefix, 'continuation-token': continuationToken }
      });
      const xml = await response.text();
      keys.push(...[...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((match) => xmlValue(match[1], 'Key')).filter(Boolean));
      continuationToken = xmlValue(xml, 'NextContinuationToken');
    } while (continuationToken);
    return keys;
  }

  async deleteBucket(bucket) {
    const prefix = this.objectKey(bucket);
    const keys = await this.listAllKeys(prefix);
    await Promise.all(keys.map((key) => this.request('DELETE', key)));
  }

  async list(bucket, relativePath = '') {
    const prefix = this.objectKey(bucket, relativePath);
    const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
    const response = await this.request('GET', '', {
      query: { 'list-type': '2', prefix: normalizedPrefix, delimiter: '/' }
    });
    const xml = await response.text();
    const files = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((match) => {
      const key = xmlValue(match[1], 'Key');
      if (!key || key === normalizedPrefix) {
        return null;
      }
      return {
        id: sha256(key),
        name: key.slice(normalizedPrefix.length),
        created_at: null,
        updated_at: xmlValue(match[1], 'LastModified'),
        last_accessed_at: null,
        metadata: { size: Number(xmlValue(match[1], 'Size')) || 0 }
      };
    }).filter((item) => item?.name && !item.name.includes('/'));
    const folders = [...xml.matchAll(/<CommonPrefixes>([\s\S]*?)<\/CommonPrefixes>/g)].map((match) => {
      const key = xmlValue(match[1], 'Prefix');
      const name = key?.slice(normalizedPrefix.length).replace(/\/$/, '');
      return name ? { id: null, name, created_at: null, updated_at: null, last_accessed_at: null, metadata: null } : null;
    }).filter(Boolean);
    return [...folders, ...files];
  }

  async upload(bucket, relativePath, body, contentType = 'application/octet-stream') {
    const safePath = normalizeStoragePath(relativePath);
    await this.request('PUT', this.objectKey(bucket, safePath), { body, headers: { 'content-type': contentType } });
    return { path: safePath, fullPath: `${ensureBucketName(bucket)}/${safePath}` };
  }

  async deleteObjects(bucket, paths = []) {
    const safePaths = paths.map(normalizeStoragePath);
    await Promise.all(safePaths.map((item) => this.request('DELETE', this.objectKey(bucket, item))));
    return safePaths.map((name) => ({ name }));
  }

  async getObject(bucket, relativePath) {
    const response = await this.request('GET', this.objectKey(bucket, relativePath));
    return {
      body: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') || 'application/octet-stream',
      etag: response.headers.get('etag')
    };
  }
}

let storageDriver = null;

export const getStorageDriver = () => {
  if (!storageDriver) {
    storageDriver = String(process.env.STORAGE_DRIVER || 'local').trim().toLowerCase() === 'r2'
      ? new R2StorageDriver()
      : new LocalStorageDriver();
  }
  return storageDriver;
};

export const createStorageDeliveryHandler = () => async (req, res, next) => {
  try {
    const bucket = req.params.bucket;
    const objectPath = normalizeStoragePath(req.params[0] || req.path || '');
    if (!objectPath) {
      res.status(404).json({ error: 'Stored object not found.' });
      return;
    }
    const object = await getStorageDriver().getObject(bucket, objectPath);
    res.setHeader('Content-Type', object.contentType);
    if (object.etag) {
      res.setHeader('ETag', object.etag);
    }
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(object.body);
  } catch (error) {
    if (Number(error?.status) === 404 || error?.code === 'ENOENT' || error?.code === 'EISDIR' || error?.code === 'STORAGE_OBJECT_NOT_FOUND') {
      res.status(404).json({ error: 'Stored object not found.' });
      return;
    }
    next(error);
  }
};
