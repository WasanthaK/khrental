import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { denyPaymentProofMutation } from '../platform/paymentProofAccess.js';
import { assertEviaEvidenceDeletionAllowed } from './eviaEvidenceRetention.js';
import { assertGenericInvoiceArchiveMutationAllowed, assertGenericInvoiceArchiveBucketDeleteAllowed, assertGenericInvoiceArchiveDeletionAllowed } from './invoiceArchiveStoragePolicy.js';

const STORAGE_ROOT = path.resolve(process.cwd(), 'public', 'storage');
const validateAuditCreate = (bucket, relativePath, body) => {
  const safePath = requireCanonicalStoragePath(relativePath);
  if (bucket !== 'documents' || !/^tenants\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/agreements\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/signed\/audit_trail\.pdf$/i.test(safePath)
      || !Buffer.isBuffer(body) || body.length < 5 || body.length > 50 * 1024 * 1024 || body.subarray(0, 5).toString() !== '%PDF-') {
    throw Object.assign(new Error('Audit creation requires a scoped historic audit PDF.'), { status: 400, code: 'INVALID_EVIA_AUDIT_WRITE' });
  }
  return safePath;
};
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

export const ensureBucketName = (bucket) => {
  const value = typeof bucket === 'string' ? bucket : '';
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(value)) {
    const error = new Error('Invalid storage bucket.');
    error.code = 'INVALID_STORAGE_BUCKET';
    error.status = 400;
    throw error;
  }
  return value;
};

// Request/driver identities must never change after an authorization decision.
// Keep the legacy normalizer for callers preparing paths, but reject aliases at
// the security boundary instead of silently mapping them to another object.
export const requireCanonicalStoragePath = (value = '') => {
  if (typeof value !== 'string' || value !== normalizeStoragePath(value)) {
    throw Object.assign(new Error('Invalid storage path.'), { status: 400, code: 'INVALID_STORAGE_PATH' });
  }
  return value;
};

export const assertStorageObjectDeletionAllowed = (bucket, paths) => {
  ensureBucketName(bucket);
  if (!Array.isArray(paths)) { throw Object.assign(new Error('Storage paths must be an array.'), { status: 400, code: 'INVALID_STORAGE_PATH' }); }
  paths.forEach(requireCanonicalStoragePath);
  assertEviaEvidenceDeletionAllowed(bucket, paths);
  denyPaymentProofMutation(bucket, paths);
  paths.forEach(item => assertGenericInvoiceArchiveDeletionAllowed(bucket, item));
  if (paths.some(item => !item || /^tenants(?:\/[^/]+)?$/.test(item))) {
    throw Object.assign(new Error('Recursive tenant storage deletion is not authorized.'), { status: 403, code: 'STORAGE_ROOT_DELETE_FORBIDDEN' });
  }
};

// Mounted after authenticated delivery and before BOTH public/dist static
// roots (and development middleware). Static serving decodes and normalizes
// URLs independently of Express route matching, so it cannot be a fallback
// authority for tenant storage, including encoded or repeated-slash prefixes.
export const blockStorageStaticFallback = (req, res, next) => {
  let pathname;
  try { pathname = path.posix.normalize(decodeURIComponent(req.path).replace(/\\/g, '/')); }
  catch { res.sendStatus(400); return; }
  if (/^\/storage(?:\/|$)/i.test(pathname)) { res.sendStatus(404); return; }
  next();
};

// Quixo.Homes public-listing derivatives are kept outside the web static root.
// Regular tenant storage remains in its current location, unchanged.
const PRIVATE_LISTING_MEDIA_ROOT=path.resolve(process.cwd(),'.private','quixo-listing-derivatives');
const PUBLIC_MEDIA_PREFIX='public-listings';
const guidFragment=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const validGuidPart=value=>typeof value==='string' && guidFragment.exec(value)?.[0]===value;
export const resolveLocalStoragePath=(bucket,relativePath='')=>{
  const safeBucket=ensureBucketName(bucket);
  const safePath=requireCanonicalStoragePath(relativePath);
  const chunks=safePath.split('/').filter(Boolean);
  if(safeBucket==='media' && chunks[0]===PUBLIC_MEDIA_PREFIX){
    const approved=chunks.length===1 ||
      (chunks.length===2 && validGuidPart(chunks[1])) ||
      (chunks.length===3 && validGuidPart(chunks[1]) &&
        chunks[2].endsWith('.webp') && validGuidPart(chunks[2].slice(0,-5)));
    if(!approved){throw Object.assign(new Error('Invalid public derivative path.'),{
      status:400,code:'INVALID_PUBLIC_MEDIA_PATH'
    });}
    return path.join(PRIVATE_LISTING_MEDIA_ROOT,...chunks.slice(1));
  }
  return path.join(STORAGE_ROOT,safeBucket,safePath);
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
    ensureBucketName(bucket);
    assertGenericInvoiceArchiveBucketDeleteAllowed(bucket);
    assertEviaEvidenceDeletionAllowed(bucket);
    denyPaymentProofMutation(bucket, ['']);
    await fs.rm(path.join(STORAGE_ROOT, ensureBucketName(bucket)), { recursive: true, force: true });
  }

  async list(bucket, relativePath = '') {
    const targetPath = resolveLocalStoragePath(bucket,relativePath);
    const entries = await fs.readdir(targetPath, { withFileTypes: true }).catch(() => []);
    return Promise.all(entries.map((entry) => mapLocalEntry(targetPath, entry)));
  }

  async upload(bucket, relativePath, body, _contentType, {createOnly=false}={}) {
    const safeBucket = ensureBucketName(bucket);
    const safePath = requireCanonicalStoragePath(relativePath);
    assertGenericInvoiceArchiveMutationAllowed(safeBucket, safePath);
    const targetPath = resolveLocalStoragePath(safeBucket,safePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    try { await fs.writeFile(targetPath, body, createOnly ? {flag:'wx'} : {}); }
    catch(error) {
      if (error.code==='EEXIST') {throw Object.assign(new Error('This upload already exists. Use a new file name.'),{status:409,code:'STORAGE_OBJECT_EXISTS'});}
      throw error;
    }
    return { path: safePath, fullPath: `${safeBucket}/${safePath}` };
  }

  async createEviaAuditIfAbsent(bucket, relativePath, body) {
    const safePath = validateAuditCreate(bucket, relativePath, body);
    const targetPath = path.join(STORAGE_ROOT, bucket, safePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    try { await fs.writeFile(targetPath, body, { flag: 'wx' }); return 'created'; }
    catch (error) { if (error.code === 'EEXIST') {return 'exists';} throw error; }
  }

  async deleteObjects(bucket, paths = []) {
    assertStorageObjectDeletionAllowed(bucket, paths);
    const safeBucket = ensureBucketName(bucket);
    const safePaths = paths.map(requireCanonicalStoragePath);
    await Promise.all(safePaths.map((item) => fs.rm(resolveLocalStoragePath(safeBucket,item), { force: true, recursive: true })));
    return safePaths.map((name) => ({ name }));
  }

  async getObject(bucket, relativePath) {
    const safePath = requireCanonicalStoragePath(relativePath);
    if (!safePath) {
      const error = new Error('Stored object path is required.');
      error.status = 404;
      error.code = 'STORAGE_OBJECT_NOT_FOUND';
      throw error;
    }
    const body = await fs.readFile(resolveLocalStoragePath(bucket,safePath));
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

export class R2StorageDriver {
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
    const safePath = requireCanonicalStoragePath(relativePath);
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
    ensureBucketName(bucket);
    assertGenericInvoiceArchiveBucketDeleteAllowed(bucket);
    assertEviaEvidenceDeletionAllowed(bucket);
    denyPaymentProofMutation(bucket, ['']);
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

  async upload(bucket, relativePath, body, contentType = 'application/octet-stream', {createOnly=false}={}) {
    ensureBucketName(bucket);
    const safePath = requireCanonicalStoragePath(relativePath);
    assertGenericInvoiceArchiveMutationAllowed(bucket, safePath);
    try {
      await this.request('PUT', this.objectKey(bucket, safePath), {body,headers:{'content-type':contentType,...(createOnly?{'if-none-match':'*'}:{})}});
    } catch(error) {
      if (error.status===412) {throw Object.assign(new Error('This upload already exists. Use a new file name.'),{status:409,code:'STORAGE_OBJECT_EXISTS'});}
      throw error;
    }
    return { path: safePath, fullPath: `${ensureBucketName(bucket)}/${safePath}` };
  }

  async deleteObjects(bucket, paths = []) {
    assertStorageObjectDeletionAllowed(bucket, paths);
    const safePaths = paths.map(requireCanonicalStoragePath);
    await Promise.all(safePaths.map((item) => this.request('DELETE', this.objectKey(bucket, item))));
    return safePaths.map((name) => ({ name }));
  }


  async createEviaAuditIfAbsent(bucket, relativePath, body) {
    const safePath = validateAuditCreate(bucket, relativePath, body);
    try {
      await this.request('PUT', this.objectKey(bucket, safePath), {
        body, headers: { 'content-type': 'application/pdf', 'if-none-match': '*' }
      });
      return 'created';
    } catch (error) { if (error.status === 412) {return 'exists';} throw error; }
  }

  // Candidate-only, conditional-create archive writer. No production route
  // calls this yet. R2 evaluates If-None-Match:* atomically for PutObject.
  async createIssuedInvoiceIfAbsent(bucket, relativePath, body) {
    const safePath = requireCanonicalStoragePath(relativePath);
    const match = /^tenants\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/invoices\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/issued\/sha256-([0-9a-f]{64})\.pdf$/.exec(safePath);
    if (bucket !== 'invoices' || !match || !Buffer.isBuffer(body) ||
      body.length < 100 || body.length > 5 * 1024 * 1024 ||
      body.subarray(0, 5).toString('ascii') !== '%PDF-' ||
      sha256(body) !== match[3]) {
      const error = new Error('Issued invoice object requires a canonical content-addressed PDF.');
      error.status = 400;
      error.code = 'INVALID_INVOICE_ARCHIVE_WRITE';
      throw error;
    }
    try {
      await this.request('PUT', this.objectKey(bucket, safePath), {
        body, headers: { 'content-type': 'application/pdf', 'if-none-match': '*' }
      });
      return 'created';
    } catch (error) {
      // 412 is not success: the higher-level writer MUST read back and
      // compare exact bytes before reconciling an interrupted SQL commit.
      if (error?.status === 412) {return 'exists';}
      throw error;
    }
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

export const storageDeliveryContent = object => {
  let type=String(object.contentType||'application/octet-stream').split(';')[0].trim().toLowerCase();
  // The local driver has no MIME metadata. Preserve raster/PDF viewing using
  // bytes, never a caller-controlled suffix or an HTML sniffing fallback.
  if (type==='application/octet-stream' && Buffer.isBuffer(object.body)) {
    const b=object.body;
    if (b.toString('ascii',0,5)==='%PDF-') {type='application/pdf';}
    else if (b[0]===0xff && b[1]===0xd8 && b[2]===0xff) {type='image/jpeg';}
    else if (b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {type='image/png';}
    else if (['GIF87a','GIF89a'].includes(b.toString('ascii',0,6))) {type='image/gif';}
    else if (b.toString('ascii',0,4)==='RIFF' && b.toString('ascii',8,12)==='WEBP') {type='image/webp';}
  }
  return {type,inline:['image/jpeg','image/png','image/gif','image/webp','application/pdf'].includes(type)};
};

export const createStorageDeliveryHandler = () => async (req, res, next) => {
  try {
    const bucket = ensureBucketName(req.storageIdentity?.bucket || req.params.bucket);
    const objectPath = requireCanonicalStoragePath(req.storageIdentity?.path ?? String(req.params[0] || req.path || '').replace(/^\//, ''));
    if (!objectPath) {
      res.status(404).json({ error: 'Stored object not found.' });
      return;
    }
    const object = await getStorageDriver().getObject(bucket, objectPath);
    const content=storageDeliveryContent(object);
    res.setHeader('Content-Type', content.type);
    res.setHeader('X-Content-Type-Options','nosniff');
    if (!content.inline) {
      res.setHeader('Content-Disposition','attachment');
      res.setHeader('Content-Security-Policy',"sandbox; default-src 'none'");
    }
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
