import { hasPermission, isAdminRole, isTenantRole, PERMISSIONS } from './permissionEngine.js';

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const newKey = new RegExp('^tenants/(' + uuid + ')/payment_proofs/(' + uuid + ')/([0-9a-f-]{36}\\.(?:pdf|png|jpg|jpeg))$', 'i');
const oldKey = new RegExp('^tenants/(' + uuid + ')/payment_proofs/(' + uuid + ')_([0-9]+\\.(?:pdf|png|jpg|jpeg))$', 'i');
const eq = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
const err = (status, code, message) => Object.assign(new Error(message), { status, code });

export const parsePaymentProofPath = (bucket, source) => {
  const path = String(source || '').replace(/^\/+/, '').replace(/\\/g, '/');
  const applies = ['invoices', 'images'].includes(String(bucket || '').toLowerCase())
    && /(?:^|\/)payment[_-]proofs(?:\/|$)/i.test(path);
  if (!applies) return { applies: false };
  const newMatch = String(bucket).toLowerCase() === 'invoices' ? newKey.exec(path) : null;
  const legacy = !newMatch && String(bucket).toLowerCase() === 'invoices' ? oldKey.exec(path) : null;
  const m = newMatch || legacy;
  return m
    ? { applies: true, valid: true, tenantId: m[1], invoiceId: m[2], path, legacy: !newMatch }
    : { applies: true, valid: false };
};

export const parseSubmittedPaymentProof = (url, tenantId, invoiceId) => {
  const value = String(url || '').trim();
  if (!value.startsWith('/storage/invoices/') || value.includes('?') || value.includes('#')) {
    throw err(400, 'PAYMENT_PROOF_PATH_INVALID', 'Proof must be an invoice-owned storage path.');
  }
  let path;
  try { path = decodeURIComponent(value.slice('/storage/invoices/'.length)); }
  catch { throw err(400, 'PAYMENT_PROOF_PATH_INVALID', 'Invalid payment proof path.'); }
  const parsed = parsePaymentProofPath('invoices', path);
  if (!parsed.valid || parsed.legacy || !eq(parsed.tenantId, tenantId) || !eq(parsed.invoiceId, invoiceId)) {
    throw err(400, 'PAYMENT_PROOF_PATH_INVALID', 'Payment proof belongs to a different invoice.');
  }
  return parsed;
};

export const verifyStoredPaymentProof = async ({ proofUrl, tenantId, invoiceId, readObject }) => {
  const parsed = parseSubmittedPaymentProof(proofUrl, tenantId, invoiceId);
  let object;
  try { object = await readObject('invoices', parsed.path); }
  catch { throw err(409, 'PAYMENT_PROOF_NOT_STORED', 'The uploaded payment proof cannot be found.'); }
  const b = object?.body;
  if (!Buffer.isBuffer(b) || b.length < 5 || b.length > 5 * 1024 * 1024) {
    throw err(409, 'PAYMENT_PROOF_INVALID_BYTES', 'Payment proof is empty or exceeds the size limit.');
  }
  const type = parsed.path.split('.').pop().toLowerCase();
  const valid = type === 'pdf' ? b.subarray(0,5).toString('ascii') === '%PDF-'
    : type === 'png' ? b.length >= 8 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : (type === 'jpg' || type === 'jpeg') && b[0] === 255 && b[1] === 216 && b[2] === 255;
  if (!valid) throw err(409, 'PAYMENT_PROOF_INVALID_BYTES', 'Payment proof is not a valid image or PDF.');
  return parsed;
};

export const authorizePaymentProofAccess = async ({
  bucket, path, tenantId, user, membership, operation = 'read', loadInvoice
}) => {
  const p = parsePaymentProofPath(bucket, path);
  if (!p.applies) return { applies: false, allowed: true };
  const denied = { applies: true, allowed: false };
  if (!p.valid || !eq(p.tenantId, tenantId) || !user?.id || !membership
      || !eq(membership.tenant_id || membership.tenantId, tenantId)
      || String(membership.status || '').toLowerCase() !== 'active') return denied;
  if (operation === 'delete' || (operation === 'upload' && p.legacy)) return denied;
  const invoice = await loadInvoice({ tenantId, invoiceId: p.invoiceId });
  if (!invoice || !eq(invoice.id, p.invoiceId) || !eq(invoice.tenant_id, tenantId)) return denied;
  if (isTenantRole({ user, membership })) {
    return { applies: true, allowed: eq(invoice.renteeid, user.id) };
  }
  if (operation === 'upload') return denied;
  return {
    applies: true,
    allowed: hasPermission({ user, membership }, PERMISSIONS.PAYMENTS_MANAGE)
      && (isAdminRole({ user, membership })
        || (membership.assignedPropertyIds || []).some(id => eq(id, invoice.propertyid)))
  };
};

export const denyPaymentProofMutation = (bucket, paths) => {
  if ((paths || []).some(path => parsePaymentProofPath(bucket, path).applies)) {
    throw err(403, 'PAYMENT_PROOF_DELETE_FORBIDDEN',
      'Payment evidence cannot be deleted through generic storage.');
  }
};
