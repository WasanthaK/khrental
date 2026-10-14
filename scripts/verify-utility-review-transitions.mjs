import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const guid = value => String(value).toLowerCase();

const readRow = async (pool, readingId) => {
  const result = await pool.request().input('readingId', readingId).query(
    'SELECT id, tenant_id, status, billing_status, calculatedbill, invoice_id, rejection_reason FROM utility_readings WHERE id = @readingId'
  );
  return result.recordset?.[0] || null;
};

export const verifyUtilityReviewTransitions = async ({
  pool, a, b, call, createAuthRecord, issueAuthSession, browser, origin
}) => {
  const fixtureIds = [];
  const createAdmin = async item => {
    const email = 'utility-review-' + crypto.randomUUID() + '@example.invalid';
    const person = await pool.request().input('tenantId', item.tenantId).input('email', email)
      .query(`INSERT INTO app_users (tenant_id, name, email, role, user_type)
              OUTPUT INSERTED.id VALUES (@tenantId, 'Utility Review Admin', @email, 'admin', 'admin')`);
    const id = guid(person.recordset[0].id);
    await pool.request().input('tenantId', item.tenantId).input('id', id)
      .query(`INSERT INTO tenant_memberships (tenant_id, app_user_id, role, status, is_default)
              VALUES (@tenantId, @id, 'admin', 'active', 1)`);
    const authId = crypto.randomUUID();
    const record = await createAuthRecord({
      authId, appUserId: id, email, role: 'admin',
      password: crypto.randomBytes(24).toString('base64url')
    });
    await pool.request().input('tenantId', item.tenantId).input('id', id).input('authId', authId)
      .query('UPDATE app_users SET auth_id = @authId WHERE id = @id AND tenant_id = @tenantId');
    return { token: (await issueAuthSession(record)).accessToken, authId, email };
  };
  const insertReading = async (item, overrides = {}) => {
    const values = {
      tenantId: item.tenantId, renteeId: item.renteeId, propertyId: item.propertyId,
      previous: overrides.previous ?? 100, current: overrides.current ?? 105,
      utilityType: overrides.utilityType ?? 'water', readingDate: overrides.readingDate ?? '2026-09-20'
    };
    const request = pool.request();
    Object.entries(values).forEach(([key, value]) => request.input(key, value));
    const result = await request.query(`
      INSERT INTO utility_readings
        (tenant_id, renteeid, propertyid, utilitytype, readingdate,
         previousreading, currentreading, status, billing_status)
      OUTPUT INSERTED.id
      VALUES (@tenantId, @renteeId, @propertyId, @utilityType,
              @readingDate, @previous, @current, 'pending', 'pending')
    `);
    const id = guid(result.recordset[0].id);
    fixtureIds.push(id);
    return id;
  };
  const requestReview = (item, token, id, transition, body = {}) => call(
    '/api/utility-reviews/readings/' + id + '/' + transition, {
      method: 'POST', tenantId: item.tenantId, token, body
    }
  );
  const assertRow = async (id, expected) => {
    const record = await readRow(pool, id);
    for (const [key, value] of Object.entries(expected)) {
      assert.equal(record?.[key], value, 'utility row ' + id + ': ' + key);
    }
    return record;
  };

  try {
    const adminA = await createAdmin(a);
    const adminB = await createAdmin(b);
    await pool.request().input('propertyId', a.propertyId).input('tenantId', a.tenantId)
      .query('UPDATE properties SET water_rate = 12.5 WHERE tenant_id = @tenantId AND id = @propertyId');
    await pool.request().input('propertyId', b.propertyId).input('tenantId', b.tenantId)
      .query('UPDATE properties SET water_rate = 8.0 WHERE tenant_id = @tenantId AND id = @propertyId');

    const readingA = await insertReading(a);
    const readingB = await insertReading(b);
    const anonymous = await requestReview(a, null, readingA, 'approve');
    assert.equal(anonymous.status, 401, 'anonymous review forbidden');
    const renter = await requestReview(a, a.token, readingA, 'approve');
    assert.equal(renter.status, 403, 'renter cannot review utility readings');
    const wrongTenant = await requestReview(a, adminA.token, readingB, 'approve');
    assert.equal(wrongTenant.status, 404, 'foreign utility reading hidden');
    const falseTenant = await requestReview(b, adminA, readingB, 'approve');
    assert.equal(falseTenant.status, 403, 'authenticated session cannot choose foreign tenant');
    const badReason = await requestReview(a, adminA.token, readingA, 'reject', { reason: '' });
    assert.equal(badReason.status, 400);
    await assertRow(readingA, { status: 'pending', billing_status: 'pending', invoice_id: null });

    const approveA = await requestReview(a, adminA.token, readingA, 'approve');
    assert.equal(approveA.status, 200, JSON.stringify(approveA));
    await assertRow(readingA, { status: 'approved', billing_status: 'pending_invoice', calculatedbill: 62.5, invoice_id: null });
    const duplicate = await requestReview(a, adminA.token, readingA, 'approve');
    assert.equal(duplicate.status, 409, 'approval must be idempotent-by-rejection');
    await assertRow(readingA, { status: 'approved', billing_status: 'pending_invoice', calculatedbill: 62.5 });

    const rejectB = await requestReview(b, adminB.token, readingB, 'reject', { reason: 'Fixture meter unreadable' });
    assert.equal(rejectB.status, 200, JSON.stringify(rejectB));
    await assertRow(readingB, { status: 'rejected', billing_status: 'rejected', rejection_reason: 'Fixture meter unreadable', invoice_id: null });
    assert.equal((await requestReview(b, adminB.token, readingB, 'approve')).status, 409);

    const racing = await insertReading(a);
    const concurrent = await Promise.all([
      requestReview(a, adminA.token, racing, 'approve'),
      requestReview(a, adminA.token, racing, 'approve')
    ]);
    assert.deepEqual(concurrent.map(x => x.status).sort(), [200, 409], 'concurrent approvals have one winner');
    await assertRow(racing, { status: 'approved', billing_status: 'pending_invoice', calculatedbill: 62.5 });

    const missingRate = await insertReading(a, { utilityType: 'electricity' });
    const invalidRate = await requestReview(a, adminA.token, missingRate, 'approve');
    assert.equal(invalidRate.status, 422, 'unknown configured rate must fail closed');
    await assertRow(missingRate, { status: 'pending', billing_status: 'pending', calculatedbill: null });

    const rollbackId = await insertReading(a);
    try {
      await pool.request().query(`
        CREATE TRIGGER dbo.test_utility_review_force_rollback
        ON dbo.utility_readings AFTER UPDATE AS
        BEGIN
          IF EXISTS (SELECT 1 FROM inserted WHERE id = CONVERT(uniqueidentifier, '${rollbackId}'))
            THROW 53001, 'Forced disposable utility review rollback', 1;
        END
      `);
      const rollback = await requestReview(a, adminA.token, rollbackId, 'approve');
      assert.ok(rollback.status >= 400, 'forced DB failure must not report success');
    } finally {
      await pool.request().query('DROP TRIGGER IF EXISTS dbo.test_utility_review_force_rollback');
    }
    await assertRow(rollbackId, { status: 'pending', billing_status: 'pending', calculatedbill: null, invoice_id: null });

    // Full React/browser acceptance: exercise real buttons in both live routes
    // with actual tenant-selected administrator sessions and synthetic SQL data.
    const openReview = async (item, admin, path) => {
      const page = await browser.newPage();
      await page.evaluateOnNewDocument((sessionToken, tenantId, authId, email) => {
        localStorage.removeItem('dev_bypass_role');
        localStorage.setItem('khrental.activeTenantId', tenantId);
        localStorage.setItem('khrental.local.session', JSON.stringify({
          access_token: sessionToken,
          user: { id: authId, email, role: 'admin' }
        }));
      }, admin.token, item.tenantId, admin.authId, admin.email);
      await page.goto(origin + path, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForFunction(() => document.body.innerText.includes('Utility Readings Review')
        && [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Approve'),
      { timeout: 30000 });
      return page;
    };
    const clickLabel = async (page, label) => {
      const clicked = await page.evaluate(label => {
        const button = [...document.querySelectorAll('button')]
          .find(b => b.textContent.trim() === label && !b.disabled);
        if (!button) return false;
        button.click();
        return true;
      }, label);
      assert.ok(clicked, 'Expected enabled utility-review button: ' + label);
    };
    // The newest synthetic reading is displayed first by each view.
    const primaryApproveId = await insertReading(a, { readingDate: '2026-10-14' });
    let page = await openReview(a, adminA, '/dashboard/utilities');
    try {
      await clickLabel(page, 'Approve');
      await page.waitForFunction(() => document.body.innerText.includes('Reading approved and ready for monthly invoice generation.'),
        { timeout: 30000 });
      await assertRow(primaryApproveId, { status: 'approved', billing_status: 'pending_invoice',
        calculatedbill: 62.5, invoice_id: null });
    } finally {
      await page.close();
    }
    const staffRejectId = await insertReading(b, { utilityType: 'electricity', readingDate: '2026-10-14' });
    page = await openReview(b, adminB, '/dashboard/utilities/review');
    try {
      page.once('dialog', async dialog => { await dialog.accept('Incorrect meter photo'); });
      await clickLabel(page, 'Reject');
      await page.waitForFunction(() => document.body.innerText.includes('Reading rejected'),
        { timeout: 30000 });
      await assertRow(staffRejectId, { status: 'rejected', billing_status: 'rejected',
        rejection_reason: 'Incorrect meter photo', invoice_id: null });
    } finally {
      await page.close();
    }
    const rejectedA = await insertReading(a, { readingDate: '2026-10-15' });
    page = await openReview(a, adminA, '/dashboard/utilities');
    try {
      page.once('dialog', async dialog => { await dialog.accept('Reading evidence mismatch'); });
      await clickLabel(page, 'Reject');
      await page.waitForFunction(() => document.body.innerText.includes('Reading rejected successfully.'),
        { timeout: 30000 });
      await assertRow(rejectedA, { status: 'rejected', billing_status: 'rejected',
        rejection_reason: 'Reading evidence mismatch', invoice_id: null });
    } finally {
      await page.close();
    }
    console.log('PASS: real React utility review buttons for both routes persist only governed transitions');

    console.log('PASS: governed utility review HTTP/SQL authorization, amount, duplicate, concurrency, failure rollback');
  } finally {
    for (const id of fixtureIds) {
      await pool.request().input('id', id)
        .query('DELETE FROM utility_readings WHERE id = @id');
    }
  }
};
