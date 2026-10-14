import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const guid = value => String(value || '').toLowerCase();

export async function verifyPhase4StaffMaintenanceHttp({
  pool, a, b, tokenA, tokenB, call, createAuthRecord, issueAuthSession, browser, origin
}) {
  // A/B are disposable Docker SQL tenants. No live people or external URLs.
  const sqlRows = async (statement, inputs = {}) => {
    const request = pool.request();
    for (const [key, value] of Object.entries(inputs)) request.input(key, value);
    return (await request.query(statement)).recordset || [];
  };
  const one = async (statement, inputs) => (await sqlRows(statement, inputs))[0] || null;
  const check = (response, status, code = null) => {
    assert.equal(response.status, status, JSON.stringify(response));
    if (code) assert.equal(response.payload?.code, code, JSON.stringify(response));
    return response.payload?.data;
  };
  const actor = async (item, bundle, assignedPropertyId = null) => {
    const email = 'maintenance-acceptance-' + crypto.randomUUID() + '@example.invalid';
    const row = await one(
      "INSERT INTO app_users (tenant_id, name, email, role, user_type) OUTPUT INSERTED.id VALUES (@tenantId, 'Fixture Staff', @email, 'staff', 'staff')",
      { tenantId: item.tenantId, email }
    );
    const userId = guid(row.id);
    await sqlRows(
      "INSERT INTO tenant_memberships (tenant_id, app_user_id, role, permission_bundle, status, is_default) VALUES (@tenantId, @userId, 'staff', @bundle, 'active', 1)",
      { tenantId: item.tenantId, userId, bundle }
    );
    if (assignedPropertyId) {
      await sqlRows(
        "INSERT INTO staff_property_assignments (tenant_id, propertyid, staff_user_id, status) VALUES (@tenantId, @propertyId, @userId, 'active')",
        { tenantId: item.tenantId, propertyId: assignedPropertyId, userId }
      );
    }
    const authId = crypto.randomUUID();
    const record = await createAuthRecord({
      authId, appUserId: userId, email, role: 'staff',
      password: crypto.randomBytes(24).toString('base64url')
    });
    await sqlRows(
      'UPDATE app_users SET auth_id = @authId WHERE tenant_id = @tenantId AND id = @userId',
      { tenantId: item.tenantId, userId, authId }
    );
    return { userId, email, authId, token: (await issueAuthSession(record)).accessToken };
  };

  const managerA = await actor(a, 'property_operations', a.propertyId);
  const managerNoScope = await actor(a, 'property_operations');
  const workerA = await actor(a, 'maintenance');
  const idleWorkerA = await actor(a, 'maintenance');
  const workerB = await actor(b, 'maintenance');
  const financeA = await actor(a, 'finance');
  const readOnlyA = await actor(a, 'read_only');
  const managerB = await actor(b, 'property_operations', b.propertyId);
  const path = id => '/api/maintenance-lifecycle/requests' + (id ? '/' + id : '');
  const api = (item, token, method, suffix, body) => call(suffix, {
    tenantId: item.tenantId, token, method, ...(body === undefined ? {} : { body })
  });
  const request = (item, token, method, id, action = '', body) =>
    api(item, token, method, path(id) + action, body);
  const snapshot = async id => ({
    request: await one(
      'SELECT id, tenant_id, renteeid, propertyid, assignedto, status, startedat, completedat, completed_by, completion_cost FROM maintenance_requests WHERE id = @id',
      { id }
    ),
    events: await sqlRows(
      'SELECT event_type, actor_user_id, from_status, to_status FROM maintenance_lifecycle_events WHERE maintenance_request_id = @id ORDER BY createdat, id',
      { id }
    ),
    images: await sqlRows(
      'SELECT image_url, uploaded_by FROM maintenance_request_images WHERE maintenance_request_id = @id ORDER BY image_url',
      { id }
    ),
    comments: await sqlRows(
      'SELECT comment, is_internal, user_id FROM maintenance_request_comments WHERE maintenance_request_id = @id ORDER BY comment',
      { id }
    )
  });

  const requestBody = {
    propertyId: a.propertyId, title: 'Staff lifecycle acceptance',
    description: 'Synthetic water leak for two-tenant acceptance'
  };
  check(await request(a, null, 'POST', null, '', requestBody), 401);
  check(await request(a, managerA.token, 'POST', null, '', requestBody), 403, 'TENANT_PORTAL_REQUIRED');
  check(await request(a, tokenA, 'POST', null, '', { ...requestBody, propertyId: b.propertyId }),
    409, 'ACTIVE_TENANCY_REQUIRED');
  const created = check(await request(a, tokenA, 'POST', null, '', requestBody), 201);
  const id = guid(created.id);
  assert.equal(guid(created.renteeid), a.renteeId);
  assert.equal(guid(created.propertyid), a.propertyId);
  assert.equal(created.status, 'pending');
  check(await request(b, tokenB, 'GET', id), 404, 'MAINTENANCE_REQUEST_NOT_FOUND');
  check(await request(a, tokenA, 'POST', id, '/assign', { staffUserId: workerA.userId }),
    403, 'MAINTENANCE_MANAGE_REQUIRED');
  check(await request(a, managerNoScope.token, 'POST', id, '/assign', { staffUserId: workerA.userId }),
    403, 'RESOURCE_ACCESS_DENIED');
  check(await request(a, managerA.token, 'POST', id, '/assign', { staffUserId: workerB.userId }),
    400, 'INVALID_MAINTENANCE_ASSIGNEE');
  check(await request(b, managerB.token, 'POST', id, '/assign', { staffUserId: workerB.userId }),
    404, 'MAINTENANCE_REQUEST_NOT_FOUND');
  check(await request(a, idleWorkerA.token, 'GET', id), 403, 'RESOURCE_ACCESS_DENIED');
  const assigned = check(await request(a, managerA.token, 'POST', id, '/assign',
    { staffUserId: workerA.userId }), 200);
  assert.equal(guid(assigned.assignedto), workerA.userId);
  assert.equal(assigned.status, 'pending');

  check(await request(a, tokenA, 'POST', id, '/start', {}), 403, 'RESOURCE_ACCESS_DENIED');
  check(await request(a, idleWorkerA.token, 'POST', id, '/start', {}),
    403, 'RESOURCE_ACCESS_DENIED');
  check(await request(a, managerNoScope.token, 'POST', id, '/start', {}),
    403, 'RESOURCE_ACCESS_DENIED');
  check(await request(a, workerA.token, 'POST', id, '/complete', {}),
    409, 'INVALID_MAINTENANCE_TRANSITION');
  const started = check(await request(a, workerA.token, 'POST', id, '/start', {}), 200);
  assert.equal(started.status, 'in_progress');
  assert.ok(started.startedat);
  check(await request(a, workerA.token, 'POST', id, '/start', {}),
    409, 'INVALID_MAINTENANCE_TRANSITION');

  check(await request(a, tokenA, 'POST', id, '/comments',
    { comment: 'Attempt private comment', isInternal: true }),
    403, 'INTERNAL_COMMENT_FORBIDDEN');
  check(await request(a, workerA.token, 'POST', id, '/comments', { comment: '  ' }),
    400, 'COMMENT_REQUIRED');
  check(await request(a, workerA.token, 'POST', id, '/comments',
    { comment: 'Staff-only diagnosis', isInternal: true }), 201);
  check(await request(a, tokenA, 'POST', id, '/comments',
    { comment: 'Visible tenant update' }), 201);
  const renterProjection = check(await request(a, tokenA, 'GET', id), 200);
  assert.ok(renterProjection.comments.some(c => c.comment === 'Visible tenant update'));
  assert.ok(!renterProjection.comments.some(c => c.comment === 'Staff-only diagnosis'));
  const staffProjection = check(await request(a, workerA.token, 'GET', id), 200);
  assert.ok(staffProjection.comments.some(c => c.comment === 'Staff-only diagnosis'));
  check(await request(a, idleWorkerA.token, 'POST', id, '/comments',
    { comment: 'Unauthorized write' }), 403, 'RESOURCE_ACCESS_DENIED');

  const imageUrl = '/storage/images/tenants/' + a.tenantId + '/maintenance/worker-fixture.png';
  check(await request(a, idleWorkerA.token, 'POST', id, '/images',
    { imageUrl }), 403, 'RESOURCE_ACCESS_DENIED');
  check(await request(a, workerA.token, 'POST', id, '/images',
    { imageUrl: '/storage/images/tenants/' + b.tenantId + '/maintenance/foreign.png' }),
    400, 'INVALID_MAINTENANCE_IMAGE_URL');
  const image = check(await request(a, workerA.token, 'POST', id, '/images',
    { imageUrl, imageType: 'completion' }), 201);
  assert.equal(image.image_url, imageUrl);
  assert.equal(guid(image.uploaded_by), workerA.userId);

  check(await request(a, idleWorkerA.token, 'POST', id, '/complete',
    { completionCost: 12 }), 403, 'RESOURCE_ACCESS_DENIED');
  check(await request(a, workerA.token, 'POST', id, '/complete',
    { completionCost: -1 }), 400, 'INVALID_MAINTENANCE_COST');
  const beforeComplete = await snapshot(id);
  assert.equal(beforeComplete.request.status, 'in_progress');
  const completed = check(await request(a, workerA.token, 'POST', id, '/complete',
    { completionCost: 125.5, notes: 'Fixture work complete' }), 200);
  assert.equal(completed.status, 'completed');
  assert.equal(Number(completed.completion_cost), 125.5);
  assert.equal(guid(completed.completed_by), workerA.userId);
  const afterComplete = await snapshot(id);
  assert.equal(afterComplete.request.status, 'completed');
  assert.deepEqual(afterComplete.events.map(e => e.event_type).sort(),
    ['request_assigned', 'request_created', 'work_completed', 'work_started']);
  assert.equal(afterComplete.images.length, 1);
  assert.equal(afterComplete.comments.length, 2);
  check(await request(a, workerA.token, 'POST', id, '/complete', {}),
    409, 'INVALID_MAINTENANCE_TRANSITION');
  check(await request(a, managerA.token, 'POST', id, '/assign',
    { staffUserId: idleWorkerA.userId }), 409, 'MAINTENANCE_REQUEST_CLOSED');
  check(await request(a, tokenA, 'POST', id, '/images', { imageUrl }),
    403, 'RESOURCE_ACCESS_DENIED');
  check(await request(a, workerA.token, 'POST', id, '/images', { imageUrl }),
    403, 'RESOURCE_ACCESS_DENIED');
  check(await request(a, tokenA, 'POST', id, '/cancel', { reason: 'too late' }),
    403, 'RESOURCE_ACCESS_DENIED');
  assert.deepEqual(await snapshot(id), afterComplete, 'denials/replays must not mutate closed request');

  // Property scope denial must hold even when staff and request share a tenant.
  const unrelatedProperty = await one(
    "INSERT INTO properties (tenant_id, name, status) OUTPUT INSERTED.id VALUES (@tenantId, 'Unassigned property', 'available')",
    { tenantId: a.tenantId }
  );
  const outOfScopeRequest = await one(
    "INSERT INTO maintenance_requests (tenant_id, propertyid, renteeid, title, description) OUTPUT INSERTED.id VALUES (@tenantId, @propertyId, @renteeId, 'Outside staff scope', 'Synthetic')",
    { tenantId: a.tenantId, propertyId: unrelatedProperty.id, renteeId: a.renteeId }
  );
  const outsideId = guid(outOfScopeRequest.id);
  check(await request(a, managerA.token, 'GET', outsideId),
    403, 'RESOURCE_ACCESS_DENIED');
  check(await request(a, managerA.token, 'POST', outsideId, '/assign',
    { staffUserId: workerA.userId }), 403, 'RESOURCE_ACCESS_DENIED');
  assert.equal((await snapshot(outsideId)).request.assignedto, null);
  // The browser picker must use membership permissions, not obsolete
  // app_users.role. Verify both its scoped GET and real assignment button.
  const managerFixture = check(await request(a, tokenA, 'POST', null, '', {
    propertyId: a.propertyId, title: 'Browser manager assignment proof',
    description: 'Synthetic manager assignment test'
  }), 201);
  const managerFixtureId = guid(managerFixture.id);
  const eligiblePath = path(managerFixtureId) + '/eligible-staff';
  check(await api(a, null, 'GET', eligiblePath), 401);
  check(await api(a, tokenA, 'GET', eligiblePath), 403, 'MAINTENANCE_MANAGE_REQUIRED');
  check(await api(a, workerA.token, 'GET', eligiblePath), 403, 'MAINTENANCE_MANAGE_REQUIRED');
  check(await api(a, managerNoScope.token, 'GET', eligiblePath), 403, 'RESOURCE_ACCESS_DENIED');
  check(await api(b, managerB.token, 'GET', eligiblePath), 404, 'MAINTENANCE_REQUEST_NOT_FOUND');
  const listed = check(await api(a, managerA.token, 'GET', eligiblePath), 200);
  assert.ok(Array.isArray(listed));
  const ids = listed.map(item => guid(item.id));
  assert.ok(ids.includes(workerA.userId), 'maintenance-bundle worker must be eligible');
  assert.ok(ids.includes(idleWorkerA.userId));
  assert.ok(!ids.includes(workerB.userId), 'foreign worker must be hidden');
  assert.ok(!ids.includes(financeA.userId), 'finance staff cannot perform maintenance');
  assert.ok(!ids.includes(readOnlyA.userId), 'read-only staff cannot perform maintenance');
  check(await request(a, managerA.token, 'POST', managerFixtureId, '/assign',
    { staffUserId: financeA.userId }), 400, 'INVALID_MAINTENANCE_ASSIGNEE');
  check(await request(a, managerA.token, 'POST', managerFixtureId, '/assign',
    { staffUserId: readOnlyA.userId }), 400, 'INVALID_MAINTENANCE_ASSIGNEE');
  assert.equal((await snapshot(managerFixtureId)).request.assignedto, null);

  const managerPage = await browser.newPage();
  try {
    await managerPage.evaluateOnNewDocument((token, tenantId, authId, email) => {
      localStorage.removeItem('dev_bypass_role');
      localStorage.setItem('khrental.activeTenantId', tenantId);
      localStorage.setItem('khrental.local.session', JSON.stringify({
        access_token: token, user: { id: authId, email, role: 'staff' }
      }));
    }, managerA.token, a.tenantId, managerA.authId, managerA.email);
    await managerPage.goto(origin + '/dashboard/maintenance/' + managerFixtureId,
      { waitUntil: 'domcontentloaded', timeout: 45000 });
    try {
      await managerPage.waitForFunction(workerId => {
        const selector = document.querySelector('#staffMember');
        return selector && [...selector.options].some(
          option => option.value.toLowerCase() === workerId
        );
      }, { timeout: 30000, polling: 200 }, workerA.userId);
    } catch (error) {
      const visible = await managerPage.evaluate(() => document.body.innerText.slice(-3200));
      throw new Error('Manager picker not available: ' + visible, { cause: error });
    }
    const options = await managerPage.evaluate(() =>
      [...document.querySelector('#staffMember').options]
        .map(option => option.value.toLowerCase()).filter(Boolean)
    );
    assert.ok(options.includes(workerA.userId));
    assert.ok(!options.includes(workerB.userId));
    assert.ok(!options.includes(financeA.userId));
    assert.ok(!options.includes(readOnlyA.userId));
    // Puppeteer's native select drives React's controlled onChange and
    // form validation, unlike a synthetic value-property assignment.
    const actualValue = await managerPage.evaluate(workerId => {
      const option = [...document.querySelector('#staffMember').options].find(
        row => row.value.toLowerCase() === workerId
      );
      return option?.value || null;
    }, workerA.userId);
    assert.ok(actualValue);
    const selected = await managerPage.select('#staffMember', actualValue);
    assert.deepEqual(selected, [actualValue]);
    await managerPage.waitForFunction(() => {
      const button = document.querySelector('#staffAssignment button[type="submit"]');
      return button && !button.disabled && button.textContent.trim() === 'Assign Staff';
    }, { timeout: 10000, polling: 200 });
    const browserErrors = [];
    const outbound = [];
    managerPage.on('pageerror', error => browserErrors.push(error.message));
    managerPage.on('request', request => {
      if (request.url().includes('/api/maintenance-lifecycle/requests/')) {
        outbound.push(request.method() + ' ' + request.url().split('/api/maintenance-lifecycle/')[1]);
      }
    });
    await managerPage.click('#staffAssignment button[type="submit"]');
    try {
      await managerPage.waitForFunction(() =>
        [...document.querySelectorAll('button')].some(
          button => button.textContent.trim() === 'Start Work'
        ), { timeout: 15000, polling: 200 });
    } catch (error) {
      const visible = await managerPage.evaluate(() => ({
        text: document.body.innerText.slice(-3600),
        select: document.querySelector('#staffMember')?.value || null,
        errors: [...document.querySelectorAll('[role="alert"]')].map(node => node.innerText)
      }));
      const actual = await snapshot(managerFixtureId);
      throw new Error('Manager assignment did not settle: ' + JSON.stringify({
        visible, assignedto: actual.request.assignedto, events: actual.events,
        outbound: outbound.slice(-6), browserErrors: browserErrors.slice(-5)
      }), { cause: error });
    }
    const saved = await snapshot(managerFixtureId);
    assert.equal(guid(saved.request.assignedto), workerA.userId);
    assert.deepEqual(saved.events.map(event => event.event_type).sort(),
      ['request_assigned', 'request_created']);
  } finally {
    await managerPage.close();
  }
  console.log('PASS: manager picker uses tenant-scoped permission bundles and real form assigns only eligible workers');
  // No real outgoing notification is claimed. This router records lifecycle
  // events; external delivery is a distinct unresolved acceptance gate.
  assert.equal((await snapshot(id)).request.status, 'completed');

  // Exercise the actual staff React detail page and its action controls,
  // not synthetic HTTP button replacements. Use the same server-backed
  // bearer session and disposable tenant assigned above.
  const liveRequest = check(await request(a, tokenA, 'POST', null, '', {
    propertyId: a.propertyId,
    title: 'Browser staff lifecycle proof',
    description: 'Disposable staff interface Start Work and Complete acceptance'
  }), 201);
  const liveId = guid(liveRequest.id);
  check(await request(a, managerA.token, 'POST', liveId, '/assign',
    { staffUserId: workerA.userId }), 200);

  const openStaffPage = async (item, staff, requestId) => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluateOnNewDocument((token, tenantId, authId, email) => {
      localStorage.removeItem('dev_bypass_role');
      localStorage.setItem('khrental.activeTenantId', tenantId);
      localStorage.setItem('khrental.local.session', JSON.stringify({
        access_token: token, user: { id: authId, email, role: 'staff' }
      }));
    }, staff.token, item.tenantId, staff.authId, staff.email);
    await page.goto(origin + '/dashboard/maintenance/' + requestId, {
      waitUntil: 'domcontentloaded', timeout: 45000
    });
    return { page, errors };
  };
  const { page, errors } = await openStaffPage(a, workerA, liveId);
  try {
    const clickAction = async label => {
      const clicked = await page.evaluate(text => {
        const button = [...document.querySelectorAll('button')].find(
          candidate => candidate.textContent.trim() === text && !candidate.disabled
        );
        if (!button) return false;
        button.click();
        return true;
      }, label);
      assert.equal(clicked, true, 'Expected enabled staff button: ' + label);
    };
    try {
      await page.waitForFunction(
        title => document.body.innerText.includes(title)
          && [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Start Work'),
        { timeout: 30000, polling: 200 }, 'Browser staff lifecycle proof'
      );
    } catch (error) {
      const body = await page.evaluate(() => document.body.innerText.slice(-2500));
      throw new Error('Assigned staff details failed to load: ' + body + '; browser errors='
        + errors.slice(-4).join(' | '), { cause: error });
    }
    await clickAction('Start Work');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('button')].some(
        b => b.textContent.trim() === 'Mark as Completed'
      ), { timeout: 30000, polling: 200 });
    const startedInSql = (await snapshot(liveId)).request;
    assert.equal(startedInSql.status, 'in_progress');
    assert.ok(startedInSql.startedat);
    await clickAction('Mark as Completed');
    await page.waitForSelector('#completionNotes', { timeout: 12000 });
    await page.type('#completionNotes', 'Completed through the real staff browser');
    // There are two buttons labeled Mark as Completed after the dialog
    // opens; choose the visible dialog-local submit control deliberately.
    const clickedComplete = await page.evaluate(() => {
      const dialog = [...document.querySelectorAll('h2')]
        .find(node => node.textContent.trim() === 'Complete Maintenance Request')
        ?.closest('div.fixed');
      const button = [...(dialog?.querySelectorAll('button') || [])]
        .find(node => node.textContent.trim() === 'Mark as Completed' && !node.disabled);
      if (!button) return false;
      button.click();
      return true;
    });
    assert.equal(clickedComplete, true, 'Enabled completion dialog submit must be present');
    await page.waitForFunction(() =>
      document.body.innerText.includes('Browser staff lifecycle proof') &&
      !document.body.innerText.includes('Complete Maintenance Request') &&
      ![...document.querySelectorAll('button')].some(
        b => b.textContent.trim() === 'Mark as Completed'
      ), { timeout: 30000, polling: 200 });
    const doneInSql = await snapshot(liveId);
    assert.equal(doneInSql.request.status, 'completed');
    assert.equal(guid(doneInSql.request.completed_by), workerA.userId);
    assert.deepEqual(doneInSql.events.map(e => e.event_type).sort(),
      ['request_assigned', 'request_created', 'work_completed', 'work_started']);
    assert.equal(doneInSql.comments.length, 0, 'completing from browser must not duplicate comments');
    assert.equal(doneInSql.request.completion_cost, null);
    const body = await page.evaluate(() => document.body.innerText);
    assert.ok(body.includes('Browser staff lifecycle proof'));
    assert.ok(!body.includes('Tenant B Property'));
  } finally {
    await page.close();
  }

  const foreign = await openStaffPage(b, workerB, liveId);
  try {
    await foreign.page.waitForFunction(() =>
      document.body.innerText.includes('Failed to load maintenance request details')
      || location.pathname === '/unauthorized',
      { timeout: 30000, polling: 200 });
    const foreignBody = await foreign.page.evaluate(() => document.body.innerText);
    assert.ok(!foreignBody.includes('Browser staff lifecycle proof'),
      'tenant B staff cannot see tenant A details by guessing URL');
    assert.ok(!foreignBody.includes('Tenant A Property'));
  } finally {
    await foreign.page.close();
  }
  console.log('PASS: actual assigned staff browser Start Work / Complete flow, durable SQL events and foreign tenant denial');
  console.log('PASS: real-session renter request -> scoped staff assignment -> assigned start/comment/image/complete, replay and cross-tenant denials');
}
