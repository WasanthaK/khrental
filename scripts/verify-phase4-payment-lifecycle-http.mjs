import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const guid = (value) => String(value || '').toLowerCase();

const assertResponse = (result, status, reason) => {
  assert.equal(result.status, status, reason + ': ' + JSON.stringify(result));
  return result.payload?.data;
};

/**
 * Real SQL-backed bearer-session HTTP acceptance of the governed billing
 * payment state machine. Only disposable Docker SQL data is used.
 *
 * Important limits: invoices are seeded in ISSUED state so no outbound
 * SendGrid request occurs. The URLs represent already uploaded synthetic
 * proof metadata; this does not exercise R2 upload or invoice issuing.
 */
export async function verifyPhase4PaymentLifecycleHttp({
  pool, first, query, a, b, tokenA, tokenB, otherToken,
  call, createAuthRecord, issueAuthSession, browser, origin
}) {
  const createAdmin = async item => {
    const email = 'billing-lifecycle-' + crypto.randomUUID() + '@example.invalid';
    const row = await first(pool,
      `INSERT INTO app_users (tenant_id, name, email, role, user_type)
       OUTPUT INSERTED.id VALUES (@tenantId, 'Billing Test Admin', @email, 'admin', 'admin')`,
      { tenantId: item.tenantId, email }
    );
    const id = guid(row.id);
    await query(pool,
      `INSERT INTO tenant_memberships (tenant_id, app_user_id, role, status, is_default)
       VALUES (@tenantId, @id, 'admin', 'active', 1)`,
      { tenantId: item.tenantId, id }
    );
    const authId = crypto.randomUUID();
    const record = await createAuthRecord({
      authId, appUserId: id, email, role: 'admin',
      password: crypto.randomBytes(24).toString('base64url')
    });
    await query(pool,
      'UPDATE app_users SET auth_id = @authId WHERE id = @id AND tenant_id = @tenantId',
      { tenantId: item.tenantId, id, authId }
    );
    return (await issueAuthSession(record)).accessToken;
  };

  const createIssuedFixture = async (item, total) => {
    const invoice = await first(pool,
      `INSERT INTO invoices
        (tenant_id, renteeid, propertyid, agreementid, status, totalamount, billingperiod)
       OUTPUT INSERTED.id
       VALUES (@tenantId, @renteeId, @propertyId, @agreementId, 'pending', @total, '2026-11')`,
      { ...item, total }
    );
    const invoiceId = guid(invoice.id);
    await query(pool,
      `INSERT INTO invoice_components
         (tenant_id, invoice_id, component_type, description, amount)
       VALUES (@tenantId, @invoiceId, 'rent', 'Disposable November rent', @total)`,
      { tenantId: item.tenantId, invoiceId, total }
    );
    return invoiceId;
  };

  const adminA = await createAdmin(a);
  const adminB = await createAdmin(b);
  const invoiceA = await createIssuedFixture(a, 1000);
  const invoiceB = await createIssuedFixture(b, 2000);
  const url = id => '/api/billing/invoices/' + id;
  const send = (id, suffix, { token, tenantId, body } = {}) =>
    call(url(id) + suffix, { method: 'POST', token, tenantId, body });
  const account = (id, token, tenantId) =>
    call(url(id) + '/account', { token, tenantId });

  const initialA = assertResponse(await account(invoiceA, tokenA, a.tenantId), 200, 'initial owned account');
  assert.equal(Number(initialA.outstandingBalance), 1000);
  assert.deepEqual(initialA.receipts, []);
  assert.deepEqual(initialA.payments, []);
  assertResponse(await account(invoiceB, tokenA, a.tenantId), 404, 'foreign invoice hidden');
  assertResponse(await account(invoiceA, null, a.tenantId), 401, 'anonymous denied');

  const proofPath = tenant => '/storage/images/tenants/' + tenant + '/payment-proofs/disposable.jpg';
  const submit = (invoiceId, token, tenantId, amount) => send(invoiceId, '/payment-proof', {
    token, tenantId,
    body: { amount, proofUrl: proofPath(tenantId), paymentMethod: 'bank_transfer',
      transactionReference: 'DISPOSABLE-PROOF' }
  });
  const verify = (invoiceId, token, tenantId, approved, notes) => send(invoiceId, '/verify-payment', {
    token, tenantId, body: { approved, ...(notes == null ? {} : { notes }) }
  });

  assertResponse(await submit(invoiceB, tokenA, a.tenantId, 100), 404, 'cannot pay foreign invoice');
  assertResponse(await submit(invoiceA, adminA, a.tenantId, 100), 403, 'admin cannot impersonate renter proof');
  assertResponse(await submit(invoiceA, tokenA, b.tenantId, 100), 403, 'cannot select foreign tenant');
  assertResponse(await submit(invoiceA, tokenA, a.tenantId, 1200), 400, 'cannot overpay');

  const pending = assertResponse(await submit(invoiceA, tokenA, a.tenantId, 400), 201, 'first partial proof');
  assert.equal(pending.payment.status, 'pending');
  assert.equal(Number(pending.payment.amount), 400);
  assert.equal(pending.invoice.status, 'verification_pending');
  let projection = assertResponse(await account(invoiceA, tokenA, a.tenantId), 200, 'pending account');
  assert.equal(Number(projection.outstandingBalance), 1000,
    'unverified evidence must not reduce balance');
  assert.equal(projection.receipts.length, 0);
  assertResponse(await submit(invoiceA, tokenA, a.tenantId, 100), 409, 'only one pending proof');
  assertResponse(await verify(invoiceA, tokenA, a.tenantId, true), 403,
    'renter cannot approve own payment');
  assertResponse(await verify(invoiceA, adminA, a.tenantId, false, ''), 400,
    'rejection requires reason');
  assertResponse(await verify(invoiceB, adminA, a.tenantId, true), 404,
    'finance administrator cannot manage foreign invoice');

  const rejection = assertResponse(await verify(invoiceA, adminA, a.tenantId, false,
    'Disposable proof not legible'), 200, 'reject proof');
  assert.equal(rejection.payment.status, 'rejected');
  assert.equal(rejection.receipt, null);
  projection = assertResponse(await account(invoiceA, tokenA, a.tenantId), 200, 'post rejection account');
  assert.equal(Number(projection.outstandingBalance), 1000);
  assert.equal(projection.receipts.length, 0);
  assert.equal(projection.payments.filter(p => p.status === 'rejected').length, 1);

  const replacement = assertResponse(await submit(invoiceA, tokenA, a.tenantId, 400), 201,
    'rejected proof may be resubmitted');
  assert.equal(replacement.payment.status, 'pending');
  const partial = assertResponse(await verify(invoiceA, adminA, a.tenantId, true),
    200, 'approve partial proof');
  assert.equal(partial.payment.status, 'verified');
  assert.ok(partial.receipt?.id);
  assert.notEqual(partial.invoice.status, 'paid',
    'partial verified amount cannot mark invoice paid');
  projection = assertResponse(await account(invoiceA, tokenA, a.tenantId),
    200, 'post partial approval account');
  assert.equal(Number(projection.outstandingBalance), 600);
  assert.equal(projection.receipts.length, 1);
  assert.equal(Number(projection.receipts[0].amount), 400);
  assertResponse(await verify(invoiceA, adminA, a.tenantId, true), 409,
    'already verified payment cannot be verified again');

  assertResponse(await submit(invoiceA, tokenA, a.tenantId, 601), 400,
    'remaining amount cannot exceed balance');
  assertResponse(await submit(invoiceA, tokenA, a.tenantId, 600), 201,
    'remainder proof submitted');
  const completed = assertResponse(await verify(invoiceA, adminA, a.tenantId, true),
    200, 'approve remainder');
  assert.equal(completed.invoice.status, 'paid');
  projection = assertResponse(await account(invoiceA, tokenA, a.tenantId), 200, 'paid account');
  assert.equal(Number(projection.outstandingBalance), 0);
  assert.equal(projection.receipts.length, 2);
  assert.equal(projection.receipts.reduce((sum, row) => sum + Number(row.amount), 0), 1000);
  assertResponse(await submit(invoiceA, tokenA, a.tenantId, 50), 409,
    'paid invoice rejects more proofs');
  const ownEvents = await query(pool,
    `SELECT event_type, payment_id FROM billing_lifecycle_events
     WHERE tenant_id = @tenantId AND invoice_id = @invoiceId`,
    { tenantId: a.tenantId, invoiceId: invoiceA }
  );
  const events = ownEvents.map(row => row.event_type).sort();
  assert.deepEqual(events, [
    'payment_rejected', 'payment_submitted', 'payment_submitted',
    'payment_submitted', 'payment_verified', 'payment_verified'
  ]);

  const untouchedB = assertResponse(await account(invoiceB, tokenB, b.tenantId),
    200, 'foreign tenant invoice preserved');
  assert.equal(untouchedB.invoice.status, 'pending');
  assert.equal(Number(untouchedB.outstandingBalance), 2000);
  assert.deepEqual(untouchedB.payments, []);
  assert.deepEqual(untouchedB.receipts, []);
  assertResponse(await verify(invoiceB, adminA, b.tenantId, true), 403,
    'foreign tenant header not authorized');

  // Independent second-tenant lifecycle: own finance authority, own ledger.
  assertResponse(await submit(invoiceB, tokenB, b.tenantId, 2000), 201,
    'tenant B submits own payment');
  const bDone = assertResponse(await verify(invoiceB, adminB, b.tenantId, true), 200,
    'tenant B administrator approves own payment');
  assert.equal(bDone.invoice.status, 'paid');
  const paidB = assertResponse(await account(invoiceB, tokenB, b.tenantId),
    200, 'tenant B final account');
  assert.equal(Number(paidB.outstandingBalance), 0);
  assert.equal(paidB.receipts.length, 1);
  assertResponse(await account(invoiceB, tokenA, a.tenantId), 404,
    'paid foreign receipt remains private');

  // Same organization does not imply same renter account ownership.
  assertResponse(await account(invoiceA, otherToken, a.tenantId), 403,
    'same tenant second renter cannot read someone else\'s account');
  assertResponse(await submit(invoiceA, otherToken, a.tenantId, 5), 403,
    'same tenant second renter cannot submit someone else\'s proof');

  const ownReceiptsA = projection.receipts.map(row => row.receipt_number);
  const ownReceiptsB = paidB.receipts.map(row => row.receipt_number);
  assert.equal(ownReceiptsA.length, 2);
  assert.equal(ownReceiptsB.length, 1);
  const stableSqlSnapshot = async () => ({
    invoices: await query(pool,
      'SELECT id, status, updatedat FROM invoices WHERE id IN (@invoiceA, @invoiceB) ORDER BY id',
      { invoiceA, invoiceB }),
    payments: await query(pool,
      'SELECT id, invoiceid, status, verified_at, rejection_reason FROM payments WHERE invoiceid IN (@invoiceA, @invoiceB) ORDER BY id',
      { invoiceA, invoiceB }),
    receipts: await query(pool,
      'SELECT id, invoice_id, payment_id, receipt_number, amount FROM payment_receipts WHERE invoice_id IN (@invoiceA, @invoiceB) ORDER BY id',
      { invoiceA, invoiceB }),
    events: await query(pool,
      'SELECT id, invoice_id, event_type FROM billing_lifecycle_events WHERE invoice_id IN (@invoiceA, @invoiceB) ORDER BY id',
      { invoiceA, invoiceB })
  });
  const beforeBrowser = await stableSqlSnapshot();

  for (const [own, token, invoiceId, receiptNumbers, foreignNumbers] of [
    [a, tokenA, invoiceA, ownReceiptsA, ownReceiptsB],
    [b, tokenB, invoiceB, ownReceiptsB, ownReceiptsA]
  ]) {
    const page = await browser.newPage();
    try {
      // Same real auth shape used elsewhere by the disposable two-tenant
      // browser harness: token is server-issued, no development bypass.
      await page.evaluateOnNewDocument((accessToken, tenantId, authId, email) => {
        localStorage.removeItem('dev_bypass_role');
        localStorage.setItem('khrental.activeTenantId', tenantId);
        localStorage.setItem('khrental.local.session', JSON.stringify({
          access_token: accessToken,
          user: { id: authId, email, role: 'rentee' }
        }));
      }, token, own.tenantId, own.authId, own.email);
      await page.goto(origin + '/rentee/invoices', {
        waitUntil: 'domcontentloaded', timeout: 45000
      });
      const shortId = invoiceId.slice(0, 8);
      await page.waitForFunction(fragment =>
        document.body.innerText.toLowerCase().includes('invoice #' + fragment),
        { timeout: 30000 }, shortId
      );
      const clicked = await page.evaluate(fragment => {
        const card = [...document.querySelectorAll('div.relative')].find(element =>
          element.innerText.toLowerCase().includes('invoice #' + fragment) &&
          [...element.querySelectorAll('button')].some(button =>
            button.textContent.trim() === 'Account & Receipts'
          )
        );
        const button = [...(card?.querySelectorAll('button') || [])].find(element =>
          element.textContent.trim() === 'Account & Receipts'
        );
        if (!button) return false;
        button.click();
        return true;
      }, shortId);
      assert.equal(clicked, true, 'must click account for this paid invoice, not a different card');
      await page.waitForFunction(number =>
        document.body.innerText.includes('Receipt ' + number),
        { timeout: 30000 }, receiptNumbers[0]
      );
      const visible = await page.evaluate(() => ({
        route: location.pathname, body: document.body.innerText
      }));
      assert.equal(visible.route, '/rentee/invoices');
      assert.match(visible.body, /Invoice Account/);
      assert.match(visible.body, /Outstanding/);
      assert.match(visible.body, /paid/i);
      for (const ownReceipt of receiptNumbers) {
        assert.ok(visible.body.includes('Receipt ' + ownReceipt),
          'all own verified receipts must appear on the actual renter account screen');
      }
      for (const foreignReceipt of foreignNumbers) {
        assert.ok(!visible.body.includes(foreignReceipt),
          'foreign tenant receipt must remain private even after settlement');
      }
      assert.ok(!visible.body.includes(own.tenantId === a.tenantId
        ? 'Tenant B Property' : 'Tenant A Property'),
        'renter browser must not render a foreign tenant property');
    } finally {
      await page.close();
    }
  }
  assert.deepEqual(await stableSqlSnapshot(), beforeBrowser,
    'read-only routed renter receipt views cannot mutate invoice, payment or ledger records');
  console.log('PASS: real routed renter account UI exposes only own approved receipts in both tenant organizations');

  console.log('PASS: real-session two-tenant payment proof -> reject/resubmit -> verify -> paid/receipts, amount limits, duplicate and ledger isolation');
}
