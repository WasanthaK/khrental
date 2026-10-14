import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const id = value => String(value || '').toLowerCase();
const round = value => Math.round(Number(value) * 100) / 100;
const bodyIs = (result, status, code) => {
  assert.equal(result.status, status, JSON.stringify(result));
  if (code) assert.equal(result.payload.code, code, JSON.stringify(result));
};

/**
 * Governed payment lifecycle through real HTTP/session middleware and disposable
 * SQL Server. Uses synthetic payment-proof metadata; it does not upload an R2
 * file, contact a payment processor, or send an invoice email.
 */
export async function verifyPhase4PaymentLifecycleHttp({
  pool, a, b, tokenA, tokenB, otherToken, invoiceB, call,
  createAuthRecord, issueAuthSession, browser, origin
}) {
  const run = async (statement, inputs = {}) => {
    const request = pool.request();
    Object.entries(inputs).forEach(([key, value]) => request.input(key, value));
    return (await request.query(statement)).recordset || [];
  };
  const one = async (statement, inputs) => (await run(statement, inputs))[0] || null;
  const makeAdmin = async item => {
    const email = 'payment-acceptance-' + crypto.randomUUID() + '@example.invalid';
    const person = await one(
      "INSERT INTO app_users (tenant_id, name, email, role, user_type) OUTPUT INSERTED.id VALUES (@tenantId, 'Payment Acceptance Admin', @email, 'admin', 'admin')",
      { tenantId: item.tenantId, email }
    );
    const userId = id(person.id);
    await run(
      "INSERT INTO tenant_memberships (tenant_id, app_user_id, role, status, is_default) VALUES (@tenantId, @userId, 'admin', 'active', 1)",
      { tenantId: item.tenantId, userId }
    );
    const authId = crypto.randomUUID();
    const record = await createAuthRecord({
      authId, appUserId: userId, email, role: 'admin',
      password: crypto.randomBytes(24).toString('base64url')
    });
    await run('UPDATE app_users SET auth_id = @authId WHERE tenant_id = @tenantId AND id = @userId',
      { tenantId: item.tenantId, userId, authId });
    return { token: (await issueAuthSession(record)).accessToken };
  };
  const adminA = await makeAdmin(a);
  const adminB = await makeAdmin(b);
  const created = await one(
    "INSERT INTO invoices (tenant_id, renteeid, propertyid, agreementid, billingperiod, status, totalamount) OUTPUT INSERTED.id VALUES (@tenantId, @renteeId, @propertyId, @agreementId, '2026-12', 'pending', 180)",
    a
  );
  const invoiceId = id(created.id);
  await run(
    "INSERT INTO invoice_components (tenant_id, invoice_id, component_type, description, amount) VALUES (@tenantId, @invoiceId, 'rent', 'Payment lifecycle fixture', 180)",
    { tenantId: a.tenantId, invoiceId }
  );

  const url = '/api/billing/invoices/' + invoiceId;
  const paymentBody = {
    proofUrl: '/storage/documents/tenants/' + a.tenantId + '/billing/synthetic-proof-only.pdf',
    amount: 180, paymentMethod: 'bank_transfer', transactionReference: 'FIXTURE-PROOF-V2'
  };
  const renter = (method, suffix, body, token = tokenA, tenantId = a.tenantId) =>
    call(url + suffix, { method, token, tenantId, ...(body ? { body } : {}) });
  const approve = (approved, notes = '') => renter(
    'POST', '/verify-payment', { approved, notes }, adminA.token
  );
  const state = async () => ({
    invoice: await one('SELECT status, totalamount FROM invoices WHERE tenant_id = @tenantId AND id = @invoiceId',
      { tenantId: a.tenantId, invoiceId }),
    payments: await run('SELECT id, status, amount, rejection_reason FROM payments WHERE tenant_id = @tenantId AND invoiceid = @invoiceId ORDER BY createdat, id',
      { tenantId: a.tenantId, invoiceId }),
    receipts: await run('SELECT id, payment_id, receipt_number, amount FROM payment_receipts WHERE tenant_id = @tenantId AND invoice_id = @invoiceId',
      { tenantId: a.tenantId, invoiceId }),
    events: await run('SELECT event_type FROM billing_lifecycle_events WHERE tenant_id = @tenantId AND invoice_id = @invoiceId ORDER BY id',
      { tenantId: a.tenantId, invoiceId })
  });
  const beforeForeign = await one(
    'SELECT status, totalamount, updatedat FROM invoices WHERE tenant_id = @tenantId AND id = @invoiceId',
    { tenantId: b.tenantId, invoiceId: invoiceB }
  );
  const empty = await state();
  assert.equal(empty.invoice.status, 'pending');
  assert.deepEqual(empty.payments, []);
  assert.deepEqual(empty.receipts, []);

  bodyIs(await renter('POST', '/payment-proof', paymentBody, null), 401);
  bodyIs(await renter('POST', '/payment-proof', paymentBody, tokenA, b.tenantId), 403, 'TENANT_ACCESS_DENIED');
  bodyIs(await renter('POST', '/payment-proof', paymentBody, tokenB, b.tenantId), 404, 'INVOICE_NOT_FOUND');
  bodyIs(await renter('POST', '/payment-proof', paymentBody, otherToken), 403, 'RESOURCE_ACCESS_DENIED');
  bodyIs(await renter('POST', '/payment-proof', { amount: 180 }), 400, 'PAYMENT_PROOF_REQUIRED');
  bodyIs(await renter('POST', '/payment-proof', { ...paymentBody, amount: 181 }), 400, 'INVALID_PAYMENT_AMOUNT');
  bodyIs(await renter('POST', '/payment-proof', { ...paymentBody, amount: 0 }), 400, 'INVALID_PAYMENT_AMOUNT');
  bodyIs(await renter('POST', '/verify-payment', { approved: true }), 403);
  bodyIs(await renter('POST', '/verify-payment', { approved: true }, adminB.token, b.tenantId),
    404, 'INVOICE_NOT_FOUND');
  bodyIs(await approve(true), 409, 'NO_PENDING_PAYMENT');
  assert.deepEqual(await state(), empty, 'denied/malformed requests must not mutate payment state');

  const firstProof = await renter('POST', '/payment-proof', paymentBody);
  bodyIs(firstProof, 201);
  assert.equal(id(firstProof.payload.data.invoice.id), invoiceId);
  assert.equal(firstProof.payload.data.invoice.status, 'verification_pending');
  assert.equal(firstProof.payload.data.payment.status, 'pending');

  const submitted = await renter('GET', '/account');
  bodyIs(submitted, 200);
  assert.equal(round(submitted.payload.data.outstandingBalance), 180);
  assert.equal(submitted.payload.data.receipts.length, 0, 'proof does not create a receipt');
  assert.equal(submitted.payload.data.payments.length, 1);
  bodyIs(await renter('POST', '/payment-proof', paymentBody), 409, 'PAYMENT_SUBMISSION_BLOCKED');
  bodyIs(await approve(false), 400, 'PAYMENT_REJECTION_REASON_REQUIRED');
  assert.equal((await state()).payments.length, 1);

  const rejected = await approve(false, 'Fixture transfer reference invalid');
  bodyIs(rejected, 200);
  assert.equal(rejected.payload.data.payment.status, 'rejected');
  const afterRejection = await state();
  assert.equal(afterRejection.invoice.status, 'pending');
  assert.equal(afterRejection.payments.length, 1);
  assert.equal(afterRejection.payments[0].rejection_reason, 'Fixture transfer reference invalid');
  assert.equal(afterRejection.receipts.length, 0);
  assert.deepEqual(afterRejection.events.map(x => x.event_type).sort(),
    ['payment_rejected', 'payment_submitted']);
  assert.equal(round((await renter('GET', '/account')).payload.data.outstandingBalance), 180);

  const secondProof = await renter('POST', '/payment-proof', {
    ...paymentBody, transactionReference: 'FIXTURE-PROOF-CORRECTED'
  });
  bodyIs(secondProof, 201);
  assert.notEqual(id(secondProof.payload.data.payment.id), id(firstProof.payload.data.payment.id));
  assert.equal(secondProof.payload.data.invoice.status, 'verification_pending');
  const verified = await approve(true, 'Confirmed in synthetic acceptance');
  bodyIs(verified, 200);
  assert.equal(verified.payload.data.payment.status, 'verified');
  assert.equal(verified.payload.data.invoice.status, 'paid');
  assert.ok(verified.payload.data.receipt?.receipt_number, 'approved payment creates one receipt');
  const receiptNumber = verified.payload.data.receipt.receipt_number;
  const final = await state();
  assert.equal(final.invoice.status, 'paid');
  assert.deepEqual(final.payments.map(x => x.status).sort(), ['rejected', 'verified']);
  assert.equal(final.receipts.length, 1);
  assert.equal(final.receipts[0].receipt_number, receiptNumber);
  assert.equal(round(final.receipts[0].amount), 180);
  assert.equal(id(final.receipts[0].payment_id), id(verified.payload.data.payment.id));
  assert.deepEqual(final.events.map(x => x.event_type).sort(), [
    'payment_rejected', 'payment_submitted', 'payment_submitted', 'payment_verified'
  ]);

  const paidAccount = await renter('GET', '/account');
  bodyIs(paidAccount, 200);
  assert.equal(round(paidAccount.payload.data.outstandingBalance), 0);
  assert.equal(paidAccount.payload.data.receipts.length, 1);
  bodyIs(await approve(true), 409, 'NO_PENDING_PAYMENT');
  bodyIs(await renter('POST', '/payment-proof', paymentBody), 409, 'PAYMENT_SUBMISSION_BLOCKED');
  bodyIs(await renter('POST', '/manual-payment', { amount: 1 }, adminA.token), 400, 'INVALID_PAYMENT_AMOUNT');
  const afterReplay = await state();
  assert.deepEqual(afterReplay, final, 'payment replays cannot create duplicate receipts/events');
  assert.deepEqual(await one(
    'SELECT status, totalamount, updatedat FROM invoices WHERE tenant_id = @tenantId AND id = @invoiceId',
    { tenantId: b.tenantId, invoiceId: invoiceB }
  ), beforeForeign, 'tenant B invoice must be byte-for-byte unchanged');
  bodyIs(await renter('GET', '/account', null, tokenB, b.tenantId), 404, 'INVOICE_NOT_FOUND');
  bodyIs(await renter('GET', '/account', null, otherToken), 403, 'RESOURCE_ACCESS_DENIED');

  // Read-only browser confirmation on the genuine authenticated renter portal.
  // Click account for THIS invoice, not a synthetic mock screen or unrelated row.
  const page = await browser.newPage();
  try {
    await page.evaluateOnNewDocument((token, tenantId, authId, email) => {
      localStorage.removeItem('dev_bypass_role');
      localStorage.setItem('khrental.activeTenantId', tenantId);
      localStorage.setItem('khrental.local.session', JSON.stringify({
        access_token: token, user: { id: authId, email, role: 'rentee' }
      }));
    }, tokenA, a.tenantId, a.authId, a.email);
    await page.goto(origin + '/rentee/invoices', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(shortId => document.body.innerText.includes('Invoice #' + shortId),
      { timeout: 30000 }, invoiceId.slice(0, 8));
    const clicked = await page.evaluate(shortId => {
      const wrapper = [...document.querySelectorAll('div.relative')].find(element =>
        element.textContent.includes('Invoice #' + shortId) &&
        [...element.querySelectorAll('button')].some(button => button.textContent.trim() === 'Account & Receipts')
      );
      const button = [...(wrapper?.querySelectorAll('button') || [])]
        .find(node => node.textContent.trim() === 'Account & Receipts');
      if (!button) return false;
      button.click();
      return true;
    }, invoiceId.slice(0, 8));
    assert.equal(clicked, true, 'paid invoice account button must be accessible');
    await page.waitForFunction(receipt => document.body.innerText.includes('Receipt ' + receipt),
      { timeout: 30000 }, receiptNumber);
    const visible = await page.evaluate(() => ({
      path: location.pathname, text: document.body.innerText.slice(0, 17000)
    }));
    assert.equal(visible.path, '/rentee/invoices');
    assert.ok(visible.text.includes('Invoice Account'));
    assert.ok(visible.text.includes(receiptNumber));
    assert.ok(visible.text.includes('FIXTURE-PROOF-CORRECTED'));
    assert.ok(visible.text.includes('Fixture transfer reference invalid'));
    assert.ok(!visible.text.includes('Tenant B Property'));
  } finally {
    await page.close();
  }
  assert.deepEqual(await state(), final, 'read-only browser account drill-down cannot mutate SQL');
  console.log('PASS: real bearer-session payment proof, reject/resubmit/verify/receipt, replay and tenant-denial SQL + renter account browser');
}
