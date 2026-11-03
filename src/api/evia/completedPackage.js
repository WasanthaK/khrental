import yauzl from 'yauzl';
import { crc32 } from 'node:zlib';
import { normalizeEviaCompletedDocumentName } from './completedDocuments.js';

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_ENTRIES = 100;
const fail = (code, status = 502) => Object.assign(new Error('Evia completed package could not be retained safely.'), { code, status });

// Only call with the descriptor from a verified, agreement-bound completion
// webhook. Never construct a package URL or accept one from the recovery UI.
export const downloadEviaCompletedPackage = async ({ completedPackage, verifiedRequest = false, fetchImpl = fetch, now = Date.now() }) => {
  if (!verifiedRequest) throw fail('EVIA_PACKAGE_UNVERIFIED', 403);
  let url;
  try { url = new URL(completedPackage?.url || completedPackage?.Url); } catch { throw fail('EVIA_PACKAGE_URL_INVALID'); }
  if (url.origin !== 'https://evia.enadocapp.com' || url.username || url.password || url.hash
      || !url.pathname.startsWith('/_apis/sign/')) throw fail('EVIA_PACKAGE_URL_UNTRUSTED');
  const rawToken = String(completedPackage?.token || completedPackage?.Token || '').trim().replace(/^Bearer\s+/i, '');
  if (!rawToken || rawToken.length > 8192 || !/^[A-Za-z0-9._~+\/-]+=*$/.test(rawToken)) throw fail('EVIA_PACKAGE_TOKEN_INVALID');
  const expiry = completedPackage?.expiresAt ?? completedPackage?.ExpiresAt;
  if (expiry != null && (!Number.isFinite(Date.parse(expiry)) || Date.parse(expiry) <= now)) throw fail('EVIA_PACKAGE_EXPIRED', 410);
  let response;
  try {
    response = await fetchImpl(url.href, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { 'X-Webhook-Download-Token': `Bearer ${rawToken}`, Accept: 'application/zip' }
    });
  } catch { throw fail('EVIA_PACKAGE_FETCH_FAILED'); }
  if (!response.ok) throw fail('EVIA_PACKAGE_HTTP_ERROR', response.status === 410 ? 410 : 502);
  if (Number(response.headers.get('content-length')) > MAX_BYTES) {
    await response.body?.cancel(); throw fail('EVIA_PACKAGE_TOO_LARGE');
  }
  let body;
  try { body = await readBounded(response.body, MAX_BYTES); }
  catch { throw fail('EVIA_PACKAGE_BODY_INVALID'); }
  return extractEviaPackagePdfs(body);
};

const readBounded = async (stream, limit) => {
  if (!stream) throw fail('EVIA_PACKAGE_EMPTY');
  const chunks = []; let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > limit) throw fail('EVIA_PACKAGE_TOO_LARGE');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, size);
};

export const extractEviaPackagePdfs = async body => {
  if (!Buffer.isBuffer(body) || body.length > MAX_BYTES) throw fail('EVIA_PACKAGE_TOO_LARGE');
  let zip;
  try {
    zip = await yauzl.fromBufferPromise(body, { strictFileNames: true, validateEntrySizes: true });
    if (zip.entryCount > MAX_ENTRIES) throw fail('EVIA_PACKAGE_TOO_MANY_ENTRIES');
    const documents = []; const names = new Set(); let total = 0;
    for await (const entry of zip.eachEntry()) {
      const name = entry.fileName;
      if (name.endsWith('/')) continue;
      // The archive is never extracted to disk. Reject ambiguous leaf names,
      // symlinks and non-PDF entries before any object is written.
      const leaf = name.split('/').pop();
      const storedName = normalizeEviaCompletedDocumentName(leaf);
      if (!/^[A-Za-z0-9_-][A-Za-z0-9 ._-]*\.pdf$/i.test(leaf)
          || names.has(storedName.toLowerCase()) || entry.isEncrypted()
          || ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000) throw fail('EVIA_PACKAGE_ENTRY_INVALID');
      names.add(storedName.toLowerCase());
      total += entry.uncompressedSize;
      if (total > MAX_BYTES) throw fail('EVIA_PACKAGE_TOO_LARGE');
      const stream = await zip.openReadStreamPromise(entry);
      const pdf = await readBounded(stream, entry.uncompressedSize);
      if (pdf.length !== entry.uncompressedSize || crc32(pdf) !== entry.crc32
          || pdf.subarray(0, 5).toString() !== '%PDF-') throw fail('EVIA_PACKAGE_PDF_INVALID');
      documents.push({ DocumentName: storedName.toLowerCase() === 'audit_trail.pdf' ? 'audit_trail.pdf' : storedName,
        DocumentContent: pdf.toString('base64'), ContentType: 'application/pdf' });
    }
    if (!names.has('audit_trail.pdf') || documents.length < 2) throw fail('EVIA_PACKAGE_DOCUMENT_PAIR_REQUIRED');
    return documents;
  } catch (error) {
    throw error?.code?.startsWith('EVIA_PACKAGE_') ? error : fail('EVIA_PACKAGE_ZIP_INVALID');
  } finally { zip?.close(); }
};
