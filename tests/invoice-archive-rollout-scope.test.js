import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isImmutableInvoiceArchiveEnabledForTenant } from '../src/api/platform/immutableInvoiceArchiveRollout.js';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const enabled = canary => ({
  INVOICE_IMMUTABLE_ARCHIVE_ENABLED: 'true',
  INVOICE_IMMUTABLE_ARCHIVE_CANARY_TENANTS: canary
});

test('archive is disabled unless global switch and exact tenant opt-in are both present', () => {
  assert.equal(isImmutableInvoiceArchiveEnabledForTenant(a, {}), false);
  assert.equal(isImmutableInvoiceArchiveEnabledForTenant(a, enabled('')), false);
  assert.equal(isImmutableInvoiceArchiveEnabledForTenant(a, enabled(undefined)), false);
  assert.equal(isImmutableInvoiceArchiveEnabledForTenant(a, {
    ...enabled(a), INVOICE_IMMUTABLE_ARCHIVE_ENABLED: 'false'
  }), false);
  assert.equal(isImmutableInvoiceArchiveEnabledForTenant(a, enabled(a)), true);
  assert.equal(isImmutableInvoiceArchiveEnabledForTenant(b, enabled(a)), false);
  assert.equal(isImmutableInvoiceArchiveEnabledForTenant(a.toUpperCase(), enabled(a)), true);
  assert.equal(isImmutableInvoiceArchiveEnabledForTenant(a, enabled(b + ', ' + a)), true);
  assert.equal(isImmutableInvoiceArchiveEnabledForTenant(b, enabled(b + ', ' + a)), true);
});

test('wildcards, malformed tenants, invalid entries and partial lists fail closed', () => {
  for (const scope of ['*','all','true',a+',*',a+',INVALID',a+',',','+a,' ','null']) {
    assert.equal(isImmutableInvoiceArchiveEnabledForTenant(a, enabled(scope)), false, scope);
  }
  for (const target of [null,undefined,'', 'tenants/'+a,a+';'+b,'invalid']) {
    assert.equal(isImmutableInvoiceArchiveEnabledForTenant(target, enabled(a)), false);
  }
});

test('account visibility, protected document read, issuance and delivery all share tenant gate', () => {
  const router = readFileSync(new URL('../src/api/platform/billingRouter.js', import.meta.url),'utf8');
  assert.match(router,/import \{ isImmutableInvoiceArchiveEnabledForTenant \}/);
  assert.equal((router.match(/isImmutableInvoiceArchiveEnabledForTenant\(req\.tenantId\)/g)||[]).length,4);
  assert.doesNotMatch(router,/process\.env\.INVOICE_IMMUTABLE_ARCHIVE_ENABLED/);
  for (const section of [
    router.slice(router.indexOf("router.get('/invoices/:invoiceId/account'"),router.indexOf("router.get('/invoices/:invoiceId/issued-document'")),
    router.slice(router.indexOf("router.get('/invoices/:invoiceId/issued-document'"),router.indexOf("router.patch('/invoices/:invoiceId/draft'")),
    router.slice(router.indexOf('const deliverIssuedInvoice ='),router.indexOf("router.post('/invoices/:invoiceId/issue'")),
    router.slice(router.indexOf("router.post('/invoices/:invoiceId/issue'"),router.indexOf("router.post('/invoices/:invoiceId/retry-delivery'"))
  ]) assert.match(section,/isImmutableInvoiceArchiveEnabledForTenant\(req\.tenantId\)/);
});
